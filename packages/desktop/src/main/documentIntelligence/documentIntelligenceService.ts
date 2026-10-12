import { access, lstat, readFile, readdir, realpath, stat } from 'node:fs/promises'
import { constants, type Stats } from 'node:fs'
import path from 'node:path'
import writeFileAtomic from 'write-file-atomic'

import type {
  BrokenMarkdownLinkFinding,
  BrokenMarkdownLinksResult,
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
import { isMarkdownPath, parseNavigableMarkdownDestination } from './markdownLinks'
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
  /** Filesystem seam for deterministic permission and transient-IO tests. */
  linkTargetStat?: (pathname: string) => Promise<Stats>
}

const MAX_WORKSPACE_MARKDOWN_FILES = 20_000
const MAX_WORKSPACE_DIRECTORIES = 10_000
const MAX_INDEX_FILE_BYTES = 5 * 1024 * 1024
const MAX_TOTAL_INDEX_BYTES = 64 * 1024 * 1024
const MAX_DIAGNOSTIC_TARGETS = 20_000
const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules'])

interface LinkIndexScope {
  linkIndex: MarkdownLinkIndex
  openDocuments: Map<string, string>
  workspaceDocuments: Map<string, string>
  workspaceDocumentPaths: Map<string, string>
  openDocumentPaths: Map<string, string>
  generation: number
  rootPath: string | null
  pendingScanUpdates: Map<string, string | null> | null
  pendingScanPaths: Map<string, string | null> | null
  fileRevisions: Map<string, number>
  nextFileRevision: number
  diagnosticsRevision: number
  scanComplete: boolean
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
  private readonly linkTargetStat: (pathname: string) => Promise<Stats>
  private readonly indexScopes = new Map<number, LinkIndexScope>()

  constructor(options: DocumentIntelligenceServiceOptions) {
    this.files = options.files ?? defaultFiles
    this.linkTargetStat = options.linkTargetStat ?? stat
    this.linkIndex = new MarkdownLinkIndex()
    this.indexScopes.set(0, {
      linkIndex: this.linkIndex,
      openDocuments: new Map(),
      workspaceDocuments: new Map(),
      workspaceDocumentPaths: new Map(),
      openDocumentPaths: new Map(),
      generation: 0,
      rootPath: null,
      pendingScanUpdates: null,
      pendingScanPaths: null,
      fileRevisions: new Map(),
      nextFileRevision: 0,
      diagnosticsRevision: 0,
      scanComplete: false
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
        workspaceDocumentPaths: new Map(),
        openDocumentPaths: new Map(),
        generation: 0,
        rootPath: null,
        pendingScanUpdates: null,
        pendingScanPaths: null,
        fileRevisions: new Map(),
        nextFileRevision: 0,
        diagnosticsRevision: 0,
        scanComplete: false
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
    scope.diagnosticsRevision += 1
    scope.openDocuments.clear()
    scope.workspaceDocuments.clear()
    scope.workspaceDocumentPaths.clear()
    scope.openDocumentPaths.clear()
    scope.pendingScanUpdates = null
    scope.pendingScanPaths = null
    scope.fileRevisions.clear()
    this.indexScopes.delete(scopeId)
  }

  indexDocument(pathname: string, markdown: string, scopeId = 0): void {
    const scope = this.getScope(scopeId)
    scope.openDocuments.set(canonicalDocumentPath(pathname), markdown)
    scope.diagnosticsRevision += 1
    scope.openDocumentPaths.set(canonicalDocumentPath(pathname), path.resolve(pathname))
    scope.linkIndex.updateDocument(pathname, markdown)
  }

  removeDocument(pathname: string, scopeId = 0): void {
    const scope = this.getScope(scopeId)
    const key = canonicalDocumentPath(pathname)
    scope.openDocuments.delete(key)
    scope.diagnosticsRevision += 1
    scope.openDocumentPaths.delete(key)
    const saved = scope.workspaceDocuments.get(key)
    if (saved === undefined) scope.linkIndex.removeDocument(pathname)
    else scope.linkIndex.updateDocument(pathname, saved)
  }

  async indexWorkspace(rootPath: string | null, scopeId = 0): Promise<WorkspaceLinkIndexResult> {
    const scope = this.getScope(scopeId)
    const generation = ++scope.generation
    scope.diagnosticsRevision += 1
    scope.scanComplete = false
    // Clear the old workspace immediately while retaining live-tab overlays.
    scope.rootPath = rootPath ? path.resolve(rootPath) : null
    scope.workspaceDocuments.clear()
    scope.workspaceDocumentPaths.clear()
    scope.pendingScanUpdates = rootPath ? new Map() : null
    scope.pendingScanPaths = rootPath ? new Map() : null
    scope.fileRevisions.clear()
    this.rebuildIndex(scope)
    if (!rootPath) {
      return { rootPath: null, indexedFiles: 0, skippedFiles: 0, complete: true }
    }

    const root = scope.rootPath!
    const documents = new Map<string, string>()
    const documentPaths = new Map<string, string>()
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
          documentPaths.set(canonicalDocumentPath(pathname), pathname)
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
    for (const [key, pathname] of scope.pendingScanPaths ?? []) {
      if (pathname === null) documentPaths.delete(key)
      else documentPaths.set(key, pathname)
    }
    scope.pendingScanUpdates = null
    scope.pendingScanPaths = null
    scope.workspaceDocuments = documents
    scope.workspaceDocumentPaths = documentPaths
    scope.scanComplete = skippedFiles === 0
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
    scope.diagnosticsRevision += 1
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
    if (markdown === null) scope.workspaceDocumentPaths.delete(key)
    else scope.workspaceDocumentPaths.set(key, absolute)
    scope.pendingScanUpdates?.set(key, markdown)
    scope.pendingScanPaths?.set(key, markdown === null ? null : absolute)
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

  searchWorkspaceLinkCandidates(
    sourcePath: string,
    query: string,
    scopeId = 0
  ): MarkdownLinkCandidate[] {
    const scope = this.getScope(scopeId)
    const root = scope.rootPath
    if (!root || !path.isAbsolute(sourcePath) || !isWithinDirectory(root, path.resolve(sourcePath))) {
      return []
    }
    const sourceKey = canonicalDocumentPath(sourcePath)
    const pathnames = new Map(scope.workspaceDocumentPaths)
    for (const [key, pathname] of scope.openDocumentPaths) {
      if (isWithinDirectory(root, pathname)) pathnames.set(key, pathname)
    }
    pathnames.delete(sourceKey)
    const candidates = scope.linkIndex.getLinkCandidates(sourcePath, [...pathnames.values()])
    return scope.linkIndex.rankLinkCandidates(candidates, query)
  }

  /**
   * Read-only, workspace-scoped diagnostics over the existing Markdown index.
   * An in-flight result has no authority after a tab edit, filesystem refresh,
   * workspace switch, or window close.
   */
  async getBrokenMarkdownLinks(scopeId = 0): Promise<BrokenMarkdownLinksResult> {
    const scope = this.getScope(scopeId)
    const rootPath = scope.rootPath
    const revision = scope.diagnosticsRevision
    const generation = scope.generation
    const empty = (stale = false): BrokenMarkdownLinksResult => ({
      rootPath: stale ? null : rootPath,
      findings: [],
      checkedTargets: 0,
      complete: false,
      stale
    })
    if (!rootPath) return empty()

    const current = (): boolean =>
      this.indexScopes.get(scopeId) === scope &&
      scope.generation === generation &&
      scope.diagnosticsRevision === revision
    const links = scope.linkIndex.getIndexedLinks()
    const targetChecks = new Map<string, Promise<{
      status: BrokenMarkdownLinkFinding['status']
      reason: string
    } | null>>()
    let complete = scope.scanComplete
    let realRoot: string
    try {
      realRoot = await realpath(rootPath)
    } catch {
      // A missing/offline workspace is not proof that every target was deleted.
      return empty()
    }
    if (!current()) return empty(true)

    const inspect = async(targetPath: string): Promise<{
      status: BrokenMarkdownLinkFinding['status']
      reason: string
    } | null> => {
      // Resolve the nearest existing ancestor before reporting ENOENT. A parent
      // junction into another workspace must not become an in-scope "missing" link.
      let ancestor = targetPath
      while (true) {
        try {
          const resolved = await realpath(ancestor)
          if (resolved !== realRoot && !isWithinDirectory(realRoot, resolved)) return null
          break
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code
          if (code !== 'ENOENT' && code !== 'ENOTDIR') {
            return { status: 'unverified', reason: code ?? 'UNKNOWN' }
          }
          if (ancestor === rootPath) {
            return { status: 'unverified', reason: code }
          }
          ancestor = path.dirname(ancestor)
        }
      }
      try {
        const info = await this.linkTargetStat(targetPath)
        if (!info.isFile()) return { status: 'missing-file', reason: 'NOT_FILE' }
        await access(targetPath, constants.R_OK)
        return null
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        return code === 'ENOENT' || code === 'ENOTDIR'
          ? { status: 'missing-file', reason: code }
          : { status: 'unverified', reason: code ?? 'UNKNOWN' }
      }
    }

    const findings: BrokenMarkdownLinkFinding[] = []
    for (const link of links) {
      if (!current()) return empty(true)
      const source = scope.openDocumentPaths.get(link.sourcePath) ??
        scope.workspaceDocumentPaths.get(link.sourcePath) ?? link.sourcePath
      if (!isWithinDirectory(rootPath, source)) continue
      const destination = parseNavigableMarkdownDestination(link.destination)
      if (!destination) continue
      const targetPath = path.resolve(path.dirname(source), destination.pathname)
      if (!isWithinDirectory(rootPath, targetPath)) continue
      let result = targetChecks.get(targetPath)
      if (!result) {
        if (targetChecks.size >= MAX_DIAGNOSTIC_TARGETS) {
          complete = false
          break
        }
        result = inspect(targetPath)
        targetChecks.set(targetPath, result)
      }
      const finding = await result
      if (!current()) return empty(true)
      if (!finding) continue
      findings.push({
        ...link,
        sourcePath: source,
        targetPath,
        revision,
        status: finding.status,
        reason: finding.reason
      })
    }
    return {
      rootPath,
      findings,
      checkedTargets: targetChecks.size,
      complete,
      stale: false
    }
  }

  prepareRenameRepair(request: PrepareRenameRepairRequest): RenameRepairPlan {
    return createRenameRepairPlan(request)
  }

  applyRenameRepair(request: ApplyRenameRepairRequest): Promise<ApplyRenameRepairResult> {
    // Filesystem identity moves complete before optional link repair. Only
    // the existing Local History store may own the durable rollback preimages.
    return applyRenameRepairPlan(request.plan, request.decision, this.files, {
      afterMove: true,
      recovery: {
        create: async(filePath, content) => {
          const point = await this.localHistory.createSnapshot({
            filePath,
            content,
            reason: 'before-external-change'
          })
          return point.id
        },
        verify: async(filePath, snapshotId, content) => {
          const retained = await this.localHistory.getSnapshot(filePath, snapshotId)
          return retained?.content === content
        }
      }
    })
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
