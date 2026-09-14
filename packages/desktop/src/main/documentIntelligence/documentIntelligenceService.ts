import { readFile } from 'node:fs/promises'
import writeFileAtomic from 'write-file-atomic'

import type {
  ApplyRenameRepairResult,
  ApplyRenameRepairRequest,
  LocalHistoryCreateRequest,
  LocalHistoryEntry,
  LocalHistoryPruneResult,
  LocalHistorySnapshot,
  PrepareRenameRepairRequest,
  MarkdownBacklink,
  MarkdownLinkCandidate,
  RenameRepairPlan
} from '@shared/types/documentIntelligence'
import { MarkdownLinkIndex } from './markdownLinkIndex'
import {
  applyRenameRepairPlan,
  createRenameRepairPlan,
  type RenameRepairFileAdapter
} from './renameRepair'
import {
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

const defaultFiles: DocumentIntelligenceFileAdapter = {
  readFile: (filePath) => readFile(filePath, 'utf8'),
  writeFile: async(filePath, content) => {
    await writeFileAtomic(filePath, content, { encoding: 'utf8' })
  }
}

export { LocalHistorySnapshotNotFoundError, StaleLocalHistoryRestoreError }

/**
 * Main-process boundary for document intelligence. It keeps pure link/index
 * functions usable in isolation while making disk access explicit at the
 * service edge.
 */
export class DocumentIntelligenceService {
  readonly linkIndex: MarkdownLinkIndex
  readonly localHistory: LocalHistoryService
  private readonly files: DocumentIntelligenceFileAdapter

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
    this.linkIndex.updateDocument(pathname, markdown)
  }

  removeDocument(pathname: string): void {
    this.linkIndex.removeDocument(pathname)
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
