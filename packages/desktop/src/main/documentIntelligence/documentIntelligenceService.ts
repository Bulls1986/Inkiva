import { lstat, readFile, readdir, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import writeFileAtomic from 'write-file-atomic'

import type {
  ApplyRenameRepairResult,
  ApplyRenameRepairRequest,
  LocalHistoryCreateRequest,
  LocalHistoryEntry,
  LocalHistoryPruneResult,
  LocalHistorySnapshot,
  MoveHistoryPathRequest,
  PrepareRenameRepairRequest,
  MarkdownBacklink,
  MarkdownLinkCandidate,
  RenameRepairPlan,
  WorkspaceLinkIndexResult
} from '@shared/types/documentIntelligence'
import { canonicalDocumentPath, MarkdownLinkIndex } from './markdownLinkIndex'
import { isMarkdownPath } from './markdownLinks'
import {
  applyRenameRepairPlan,
  createRenameRepairPlan,
  type RenameRepairFileAdapter
} from './renameRepair'
import {
  LocalHistoryRollbackUnavailableError,
  LocalHistoryService,
  LocalHistorySnapshotNotFoundError,
  StaleLocalHistoryRestoreError,
  type LocalHistoryFileAdapter,
  type LocalHistoryServiceOptions
} from './localHistoryService'

export interface DocumentIntelligenceFileAdapter
  extends RenameRepairFileAdapter, LocalHistoryFileAdapter {}

export interface DocumentIntelligenceServiceOptions {
  historyRootPath: string
  files?: DocumentIntelligenceFileAdapter
  history?: Omit<LocalHistoryServiceOptions, 'rootPath' | 'files'>
}

const MAX_WORKSPACE_MARKDOWN_FILES = 20_000
const MAX_WORKSPACE_DIRECTORIES = 10_000
const MAX_INDEX_FILE_BYTES = 5 * 1024 * 1024
const MAX_TOTAL_INDEX_BYTES = 64 * 1024 * 1024
const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules'])

interface LinkIndexScope {
  linkIndex: MarkdownLinkIndex
  openDocuments: Map<string, string>
  workspaceDocuments: Map<string, string>
  generation: number
  rootPath: string | null
  pendingScanUpdates: Map<string, string | null> | null
  fileRevisions: Map<string, number>
  nextFileRevision: number
}

const isWithinDirectory = (root: string, candidate: string): boolean => {
  const relative = path.relative(root, candidate)
  return relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
}

const defaultFiles: DocumentIntelligenceFileAdapter = {
  readFile: (filePath) => readFile(filePath, 'utf8'),
  writeFile: async(filePath, content) => {
    await writeFileAtomic(filePath, content, { encoding: 'utf8' })
  }
}

export {
  LocalHistoryRollbackUnavailableError,
  LocalHistorySnapshotNotFoundError,
  StaleLocalHistoryRestoreError
}

/**
 * Main-process boundary for document intelligence. It keeps pure link/index
 * functions usable in isolation while making disk access explicit at the
 * service edge.
 */
export class DocumentIntelligenceService {
  readonly linkIndex: MarkdownLinkIndex
  readonly localHistory: LocalHistoryService
  private readonly files: DocumentIntelligenceFileAdapter
  private readonly indexScopes = new Map<number, LinkIndexScope>()

  constructor(options: DocumentIntelligenceServiceOptions) {
    this.files = options.files ?? defaultFiles
    this.linkIndex = new MarkdownLinkIndex()
    this.indexScopes.set(0, {
      linkIndex: this.linkIndex,
      openDocuments: new Map(),
      workspaceDocuments: new Map(),
      generation: 0,
      rootPath: null,
      pendingScanUpdates: null,
      fileRevisions: new Map(),
      nextFileRevision: 0
    })
    this.localHistory = new LocalHistoryService({
      rootPath: options.historyRootPath,
      files: this.files,
      ...options.history
    })
  }

  private getScope(scopeId: number): LinkIndexScope {
    let scope = this.indexScopes.get(scopeId)
    if (!scope) {
      scope = {
        linkIndex: new MarkdownLinkIndex(),
        openDocuments: new Map(),
        workspaceDocuments: new Map(),
        generation: 0,
        rootPath: null,
        pendingScanUpdates: null,
        fileRevisions: new Map(),
        nextFileRevision: 0
      }
      this.indexScopes.set(scopeId, scope)
    }
    return scope
  }

  closeScope(scopeId: number): void {
    if (scopeId === 0) return
    const scope = this.indexScopes.get(scopeId)
    if (!scope) return
    scope.generation += 1
    scope.linkIndex.clear()
    scope.openDocuments.clear()
    scope.workspaceDocuments.clear()
    scope.pendingScanUpdates = null
    scope.fileRevisions.clear()
    this.indexScopes.delete(scopeId)
  }

  indexDocument(pathname: string, markdown: string, scopeId = 0): void {
    const scope = this.getScope(scopeId)
    scope.openDocuments.set(canonicalDocumentPath(pathname), markdown)
    scope.linkIndex.updateDocument(pathname, markdown)
  }

  removeDocument(pathname: string, scopeId = 0): void {
    const scope = this.getScope(scopeId)
    const key = canonicalDocumentPath(pathname)
    scope.openDocuments.delete(key)
    const saved = scope.workspaceDocuments.get(key)
    if (saved === undefined) scope.linkIndex.removeDocument(pathname)
    else scope.linkIndex.updateDocument(pathname, saved)
  }

  async indexWorkspace(rootPath: string | null, scopeId = 0): Promise<WorkspaceLinkIndexResult> {
    const scope = this.getScope(scopeId)
    const generation = ++scope.generation
    // Clear the old workspace immediately while retaining live-tab overlays.
    scope.rootPath = rootPath ? path.resolve(rootPath) : null
    scope.workspaceDocuments.clear()
    scope.pendingScanUpdates = rootPath ? new Map() : null
    scope.fileRevisions.clear()
    this.rebuildIndex(scope)
    if (!rootPath) {
      return { rootPath: null, indexedFiles: 0, skippedFiles: 0, complete: true }
    }

    const root = scope.rootPath!
    const documents = new Map<string, string>()
    const pendingDirectories = [root]
    let visitedDirectories = 0
    let encounteredFiles = 0
    let skippedFiles = 0
    let totalBytes = 0
    while (pendingDirectories.length && generation === scope.generation) {
      visitedDirectories += 1
      if (visitedDirectories > MAX_WORKSPACE_DIRECTORIES) {
        skippedFiles += 1
        break
      }
      const directory = pendingDirectories.pop()!
      let entries
      try {
        entries = await readdir(directory, { withFileTypes: true })
      } catch {
        skippedFiles += 1
        continue
      }
      for (const entry of entries) {
        if (generation !== scope.generation) break
        if (entry.isSymbolicLink()) continue
        const pathname = path.join(directory, entry.name)
        if (entry.isDirectory()) {
          if (!IGNORED_DIRECTORIES.has(entry.name)) pendingDirectories.push(pathname)
          continue
        }
        if (!entry.isFile() || !isMarkdownPath(pathname)) continue
        encounteredFiles += 1
        if (encounteredFiles > MAX_WORKSPACE_MARKDOWN_FILES) {
          skippedFiles += 1
          pendingDirectories.length = 0
          break
        }
        try {
          const size = (await stat(pathname)).size
          if (size > MAX_INDEX_FILE_BYTES || totalBytes + size > MAX_TOTAL_INDEX_BYTES) {
            skippedFiles += 1
            continue
          }
          const markdown = await this.files.readFile(pathname)
          if (generation !== scope.generation) break
          totalBytes += size
          documents.set(canonicalDocumentPath(pathname), markdown)
        } catch {
          skippedFiles += 1
        }
      }
    }

    if (generation !== scope.generation) {
      return { rootPath: root, indexedFiles: 0, skippedFiles: 0, complete: false }
    }
    for (const [pathname, markdown] of scope.pendingScanUpdates ?? []) {
      if (markdown === null) documents.delete(pathname)
      else documents.set(pathname, markdown)
    }
    scope.pendingScanUpdates = null
    scope.workspaceDocuments = documents
    this.rebuildIndex(scope)
    return {
      rootPath: root,
      indexedFiles: documents.size,
      skippedFiles,
      complete: skippedFiles === 0
    }
  }

  async refreshWorkspaceFile(pathname: string, scopeId = 0): Promise<void> {
    const scope = this.getScope(scopeId)
    const root = scope.rootPath
    if (!root || !path.isAbsolute(pathname)) return
    const absolute = path.resolve(pathname)
    if (!isWithinDirectory(root, absolute) || !isMarkdownPath(absolute)) return
    if (path.relative(root, absolute).split(path.sep).some((part) =>
      IGNORED_DIRECTORIES.has(part))) return

    const key = canonicalDocumentPath(absolute)
    const generation = scope.generation
    const revision = ++scope.nextFileRevision
    scope.fileRevisions.set(key, revision)
    let markdown: string | null
    try {
      const info = await lstat(absolute)
      if (info.isSymbolicLink()) {
        // A formerly indexed source can be replaced by a symlink. Stop
        // contributing its saved backlinks rather than retaining stale data.
        markdown = null
      } else if (!info.isFile() || info.size > MAX_INDEX_FILE_BYTES) {
        throw new Error('Workspace file cannot be indexed safely')
      } else {
        const [actualRoot, actualFile] = await Promise.all([realpath(root), realpath(absolute)])
        // Parent directory junctions can replace ordinary directories even
        // when the Markdown entry itself is still a regular file.
        markdown = isWithinDirectory(actualRoot, actualFile)
          ? await this.files.readFile(absolute)
          : null
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      markdown = null
    }

    if (scope.generation !== generation || scope.fileRevisions.get(key) !== revision) return
    if (markdown === null) scope.workspaceDocuments.delete(key)
    else scope.workspaceDocuments.set(key, markdown)
    scope.pendingScanUpdates?.set(key, markdown)
    if (scope.openDocuments.has(key)) return
    if (markdown === null) scope.linkIndex.removeDocument(absolute)
    else scope.linkIndex.updateDocument(absolute, markdown)
  }

  private rebuildIndex(scope: LinkIndexScope): void {
    scope.linkIndex.clear()
    for (const [pathname, markdown] of scope.workspaceDocuments) {
      if (!scope.openDocuments.has(pathname)) scope.linkIndex.updateDocument(pathname, markdown)
    }
    for (const [pathname, markdown] of scope.openDocuments) {
      scope.linkIndex.updateDocument(pathname, markdown)
    }
  }

  getBacklinks(targetPath: string, scopeId = 0): MarkdownBacklink[] {
    return this.getScope(scopeId).linkIndex.getBacklinks(targetPath)
  }

  getLinkCandidates(
    sourcePath: string,
    pathnames: readonly string[],
    scopeId = 0
  ): MarkdownLinkCandidate[] {
    return this.getScope(scopeId).linkIndex.getLinkCandidates(sourcePath, pathnames)
  }

  prepareRenameRepair(request: PrepareRenameRepairRequest): RenameRepairPlan {
    return createRenameRepairPlan(request)
  }

  applyRenameRepair(request: ApplyRenameRepairRequest): Promise<ApplyRenameRepairResult> {
    return applyRenameRepairPlan(request.plan, request.decision, this.files)
  }

  createSnapshot(request: LocalHistoryCreateRequest): Promise<LocalHistoryEntry> {
    return this.localHistory.createSnapshot(request)
  }

  listSnapshots(filePath: string): Promise<LocalHistoryEntry[]> {
    return this.localHistory.listSnapshots(filePath)
  }

  getSnapshot(filePath: string, id: string): Promise<LocalHistorySnapshot | null> {
    return this.localHistory.getSnapshot(filePath, id)
  }

  deleteSnapshot(filePath: string, id: string): Promise<boolean> {
    return this.localHistory.deleteSnapshot(filePath, id)
  }

  moveHistoryPath(request: MoveHistoryPathRequest): Promise<number> {
    return this.localHistory.movePath(request)
  }

  pruneHistory(): Promise<LocalHistoryPruneResult> {
    return this.localHistory.prune()
  }

  restoreSnapshot(request: {
    filePath: string
    id: string
    expectedCurrentContent?: string
  }): Promise<LocalHistorySnapshot> {
    return this.localHistory.restoreSnapshot(request)
  }
}
