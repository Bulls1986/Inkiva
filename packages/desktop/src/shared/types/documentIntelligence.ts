export type RenameRepairDecision = 'update' | 'keep' | 'cancel'

export const DOCUMENT_INTELLIGENCE_CHANNELS = {
  indexDocument: 'mt::document-intelligence::index-document',
  removeDocument: 'mt::document-intelligence::remove-document',
  getBacklinks: 'mt::document-intelligence::backlinks',
  getLinkCandidates: 'mt::document-intelligence::link-candidates',
  prepareRenameRepair: 'mt::document-intelligence::prepare-rename-repair',
  applyRenameRepair: 'mt::document-intelligence::apply-rename-repair',
  createSnapshot: 'mt::document-intelligence::history-create',
  listSnapshots: 'mt::document-intelligence::history-list',
  getSnapshot: 'mt::document-intelligence::history-get',
  deleteSnapshot: 'mt::document-intelligence::history-delete',
  restoreSnapshot: 'mt::document-intelligence::history-restore',
  pruneHistory: 'mt::document-intelligence::history-prune'
} as const

export interface MarkdownLinkOccurrence {
  label: string
  destination: string
  path: string
  fragment: string
  start: number
  end: number
  destinationStart: number
  destinationEnd: number
  line: number
}

export interface MarkdownBacklink {
  sourcePath: string
  label: string
  destination: string
  fragment: string
  line: number
  start: number
  end: number
}

export interface MarkdownLinkCandidate {
  pathname: string
  relativePath: string
}

export interface MarkdownDocumentInput {
  pathname: string
  markdown: string
}

export interface RenameRepairEdit {
  start: number
  end: number
  replacement: string
}

export interface RenameRepairFileChange {
  sourcePath: string
  sourcePathAfter: string
  before: string
  after: string
  edits: RenameRepairEdit[]
}

export interface RenameRepairPlan {
  fromPath: string
  toPath: string
  changes: RenameRepairFileChange[]
  affectedFiles: string[]
  linkCount: number
}

export interface PrepareRenameRepairRequest {
  fromPath: string
  toPath: string
  documents: MarkdownDocumentInput[]
}

export interface ApplyRenameRepairRequest {
  plan: RenameRepairPlan
  decision: RenameRepairDecision
}

export interface ApplyRenameRepairResult {
  decision: RenameRepairDecision
  updatedPaths: string[]
}

export interface LocalHistoryRestoreRequest {
  filePath: string
  id: string
  expectedCurrentContent?: string
}

export interface LocalHistoryPruneResult {
  deleted: number
  reclaimedBytes: number
}

export type LocalHistoryReason =
  | 'manual'
  | 'before-save'
  | 'before-restore'
  | 'before-external-change'
  | 'autosave'
  | 'close'
  | 'import'
  | 'unknown'

export interface LocalHistoryCreateRequest {
  filePath: string
  content: string
  createdAt?: number
  reason?: LocalHistoryReason
  encoding?: string
  isBom?: boolean
  lineEnding?: 'lf' | 'crlf'
}

export interface LocalHistoryEntry {
  id: string
  filePath: string
  createdAt: number
  reason: LocalHistoryReason
  size: number
  encoding?: string
  isBom?: boolean
  lineEnding?: 'lf' | 'crlf'
}

export interface LocalHistorySnapshot extends LocalHistoryEntry {
  content: string
}
