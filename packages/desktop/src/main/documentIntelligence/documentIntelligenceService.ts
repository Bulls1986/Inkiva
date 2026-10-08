import { readFile, readdir, stat } from 'node:fs/promises'
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
  private readonly openDocuments = new Map<string, string>()
  private workspaceDocuments = new Map<string, string>()
  private workspaceGeneration = 0

  constructor(options: DocumentIntelligenceServiceOptions) {
    this.files = options.files ?? defaultFiles
    this.linkIndex = new MarkdownLinkIndex()
    this.localHistory = new LocalHistoryService({
      rootPath: options.historyRootPath,
      files: this.files,
      ...options.history
    })
  }

  indexDocument(pathname: string, markdown: string): void {
    this.openDocuments.set(canonicalDocumentPath(pathname), markdown)
    this.linkIndex.updateDocument(pathname, markdown)
  }

  removeDocument(pathname: string): void {
    const key = canonicalDocumentPath(pathname)
    this.openDocuments.delete(key)
    const saved = this.workspaceDocuments.get(key)
    if (saved === undefined) this.linkIndex.removeDocument(pathname)
    else this.linkIndex.updateDocument(pathname, saved)
  }

  async indexWorkspace(rootPath: string | null): Promise<WorkspaceLinkIndexResult> {
    const generation = ++this.workspaceGeneration
    // Clear the old workspace immediately while retaining live-tab overlays.
    this.workspaceDocuments.clear()
    this.rebuildIndex()
    if (!rootPath) {
      return { rootPath: null, indexedFiles: 0, skippedFiles: 0, complete: true }
    }

    const root = path.resolve(rootPath)
    const documents = new Map<string, string>()
    const pendingDirectories = [root]
    let visitedDirectories = 0
    let encounteredFiles = 0
    let skippedFiles = 0
    let totalBytes = 0
    while (pendingDirectories.length && generation === this.workspaceGeneration) {
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
        if (generation !== this.workspaceGeneration) break
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
          if (generation !== this.workspaceGeneration) break
          totalBytes += size
          documents.set(canonicalDocumentPath(pathname), markdown)
        } catch {
          skippedFiles += 1
        }
      }
    }

    if (generation !== this.workspaceGeneration) {
      return { rootPath: root, indexedFiles: 0, skippedFiles: 0, complete: false }
    }
    this.workspaceDocuments = documents
    this.rebuildIndex()
    return {
      rootPath: root,
      indexedFiles: documents.size,
      skippedFiles,
      complete: skippedFiles === 0
    }
  }

  private rebuildIndex(): void {
    this.linkIndex.clear()
    for (const [pathname, markdown] of this.workspaceDocuments) {
      if (!this.openDocuments.has(pathname)) this.linkIndex.updateDocument(pathname, markdown)
    }
    for (const [pathname, markdown] of this.openDocuments) {
      this.linkIndex.updateDocument(pathname, markdown)
    }
  }

  getBacklinks(targetPath: string): MarkdownBacklink[] {
    return this.linkIndex.getBacklinks(targetPath)
  }

  getLinkCandidates(sourcePath: string, pathnames: readonly string[]): MarkdownLinkCandidate[] {
    return this.linkIndex.getLinkCandidates(sourcePath, pathnames)
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
