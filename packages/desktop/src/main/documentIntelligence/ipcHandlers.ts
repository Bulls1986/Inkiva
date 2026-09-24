import type {
  ApplyRenameRepairRequest,
  ApplyRenameRepairResult,
  LocalHistoryCreateRequest,
  LocalHistoryEntry,
  LocalHistoryPruneResult,
  LocalHistoryRestoreRequest,
  LocalHistorySnapshot,
  MarkdownBacklink,
  MarkdownLinkCandidate,
  MarkdownDocumentInput,
  RenameRepairPlan
} from '@shared/types/documentIntelligence'

export interface DocumentIntelligenceHandlerService {
  indexDocument(pathname: string, markdown: string): void
  removeDocument(pathname: string): void
  getBacklinks(targetPath: string): MarkdownBacklink[]
  getLinkCandidates(sourcePath: string, pathnames: readonly string[]): MarkdownLinkCandidate[]
  prepareRenameRepair(request: {
    fromPath: string
    toPath: string
    documents: readonly MarkdownDocumentInput[]
  }): RenameRepairPlan
  applyRenameRepair(request: ApplyRenameRepairRequest): Promise<ApplyRenameRepairResult>
  createSnapshot(request: LocalHistoryCreateRequest): Promise<LocalHistoryEntry>
  listSnapshots(filePath: string): Promise<LocalHistoryEntry[]>
  getSnapshot(filePath: string, id: string): Promise<LocalHistorySnapshot | null>
  deleteSnapshot(filePath: string, id: string): Promise<boolean>
  restoreSnapshot(request: LocalHistoryRestoreRequest): Promise<LocalHistorySnapshot>
  pruneHistory(): Promise<LocalHistoryPruneResult>
}

export interface DocumentIntelligenceHandlers {
  indexDocument(pathname: unknown, markdown: unknown): void
  removeDocument(pathname: unknown): void
  getBacklinks(targetPath: unknown): MarkdownBacklink[]
  getLinkCandidates(sourcePath: unknown, pathnames: unknown): MarkdownLinkCandidate[]
  prepareRenameRepair(request: unknown): RenameRepairPlan
  applyRenameRepair(request: unknown): Promise<ApplyRenameRepairResult>
  createSnapshot(request: unknown): Promise<LocalHistoryEntry>
  listSnapshots(filePath: unknown): Promise<LocalHistoryEntry[]>
  getSnapshot(filePath: unknown, id: unknown): Promise<LocalHistorySnapshot | null>
  deleteSnapshot(filePath: unknown, id: unknown): Promise<boolean>
  restoreSnapshot(request: unknown): Promise<LocalHistorySnapshot>
  pruneHistory(): Promise<LocalHistoryPruneResult>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const requireString = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || !value) throw new TypeError(`${name} must be a non-empty string`)
  return value
}

const requireMarkdown = (value: unknown, name: string): string => {
  if (typeof value !== 'string') throw new TypeError(`${name} must be a string`)
  return value
}

const requireStringArray = (value: unknown, name: string): string[] => {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`)
  return value.map((item, index) => requireString(item, `${name}[${index}]`))
}

const requireDecision = (value: unknown): ApplyRenameRepairRequest['decision'] => {
  if (value !== 'update' && value !== 'keep' && value !== 'cancel') {
    throw new TypeError('decision must be update, keep, or cancel')
  }
  return value
}

const requireDocumentInputs = (value: unknown): MarkdownDocumentInput[] => {
  if (!Array.isArray(value)) throw new TypeError('documents must be an array')
  return value.map((document, index) => {
    if (!isRecord(document)) throw new TypeError(`documents[${index}] must be an object`)
    return {
      pathname: requireString(document.pathname, `documents[${index}].pathname`),
      markdown: requireMarkdown(document.markdown, `documents[${index}].markdown`)
    }
  })
}

const requirePrepareRequest = (
  value: unknown
): {
  fromPath: string
  toPath: string
  documents: MarkdownDocumentInput[]
} => {
  if (!isRecord(value)) throw new TypeError('rename repair request must be an object')
  return {
    fromPath: requireString(value.fromPath, 'fromPath'),
    toPath: requireString(value.toPath, 'toPath'),
    documents: requireDocumentInputs(value.documents)
  }
}

const requireInteger = (value: unknown, name: string): number => {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new TypeError(`${name} must be an integer`)
  }
  return value
}

const requireRepairPlan = (value: unknown): ApplyRenameRepairRequest['plan'] => {
  if (!isRecord(value)) throw new TypeError('plan must be an object')
  const changes = value.changes
  if (!Array.isArray(changes)) throw new TypeError('plan.changes must be an array')

  const normalizedChanges = changes.map((change, changeIndex) => {
    if (!isRecord(change)) throw new TypeError(`plan.changes[${changeIndex}] must be an object`)
    if (!Array.isArray(change.edits)) {
      throw new TypeError(`plan.changes[${changeIndex}].edits must be an array`)
    }
    const edits = change.edits.map((edit, editIndex) => {
      if (!isRecord(edit)) { throw new TypeError(`plan.changes[${changeIndex}].edits[${editIndex}] must be an object`) }
      const start = requireInteger(edit.start, 'edit.start')
      const end = requireInteger(edit.end, 'edit.end')
      if (start < 0 || end < start) throw new TypeError('edit range is invalid')
      return {
        start,
        end,
        replacement:
          typeof edit.replacement === 'string'
            ? edit.replacement
            : (() => {
              throw new TypeError('edit.replacement must be a string')
            })()
      }
    })
    return {
      sourcePath: requireString(change.sourcePath, 'change.sourcePath'),
      sourcePathAfter: requireString(change.sourcePathAfter, 'change.sourcePathAfter'),
      before:
        typeof change.before === 'string'
          ? change.before
          : (() => {
            throw new TypeError('change.before must be a string')
          })(),
      after:
        typeof change.after === 'string'
          ? change.after
          : (() => {
            throw new TypeError('change.after must be a string')
          })(),
      edits
    }
  })

  return {
    fromPath: requireString(value.fromPath, 'plan.fromPath'),
    toPath: requireString(value.toPath, 'plan.toPath'),
    changes: normalizedChanges,
    affectedFiles: requireStringArray(value.affectedFiles, 'plan.affectedFiles'),
    linkCount: (() => {
      const linkCount = requireInteger(value.linkCount, 'plan.linkCount')
      if (linkCount < 0) throw new TypeError('plan.linkCount must be non-negative')
      return linkCount
    })()
  }
}

const requireApplyRequest = (value: unknown): ApplyRenameRepairRequest => {
  if (!isRecord(value)) throw new TypeError('apply repair request must be an object')
  return {
    plan: requireRepairPlan(value.plan),
    decision: requireDecision(value.decision)
  }
}

const HISTORY_REASONS = new Set([
  'manual',
  'before-save',
  'before-restore',
  'before-external-change',
  'autosave',
  'close',
  'import',
  'unknown'
])

const requireSnapshotRequest = (value: unknown): LocalHistoryCreateRequest => {
  if (!isRecord(value)) throw new TypeError('snapshot request must be an object')
  if (
    value.createdAt !== undefined &&
    (typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt))
  ) {
    throw new TypeError('createdAt must be a finite number')
  }
  if (
    value.reason !== undefined &&
    (typeof value.reason !== 'string' || !HISTORY_REASONS.has(value.reason))
  ) {
    throw new TypeError('reason is not supported')
  }
  if (value.lineEnding !== undefined && value.lineEnding !== 'lf' && value.lineEnding !== 'crlf') {
    throw new TypeError('lineEnding must be lf or crlf')
  }
  if (value.encoding !== undefined && typeof value.encoding !== 'string') {
    throw new TypeError('encoding must be a string')
  }
  return {
    filePath: requireString(value.filePath, 'filePath'),
    content: requireMarkdown(value.content, 'content'),
    ...(value.createdAt !== undefined ? { createdAt: value.createdAt as number } : {}),
    ...(value.reason !== undefined
      ? { reason: value.reason as LocalHistoryCreateRequest['reason'] }
      : {}),
    ...(value.encoding !== undefined ? { encoding: value.encoding as string } : {}),
    ...(value.lineEnding !== undefined ? { lineEnding: value.lineEnding as 'lf' | 'crlf' } : {})
  }
}

const requireRestoreRequest = (
  value: unknown
): {
  filePath: string
  id: string
  expectedCurrentContent?: string
} => {
  if (!isRecord(value)) throw new TypeError('restore request must be an object')
  if (
    value.expectedCurrentContent !== undefined &&
    typeof value.expectedCurrentContent !== 'string'
  ) {
    throw new TypeError('expectedCurrentContent must be a string')
  }
  return {
    filePath: requireString(value.filePath, 'filePath'),
    id: requireString(value.id, 'id'),
    ...(value.expectedCurrentContent !== undefined
      ? { expectedCurrentContent: value.expectedCurrentContent }
      : {})
  }
}

export const createDocumentIntelligenceHandlers = (
  service: DocumentIntelligenceHandlerService
): DocumentIntelligenceHandlers => ({
  indexDocument(pathname, markdown) {
    service.indexDocument(
      requireString(pathname, 'pathname'),
      requireMarkdown(markdown, 'markdown')
    )
  },

  removeDocument(pathname) {
    service.removeDocument(requireString(pathname, 'pathname'))
  },

  getBacklinks(targetPath) {
    return service.getBacklinks(requireString(targetPath, 'targetPath'))
  },

  getLinkCandidates(sourcePath, pathnames) {
    return service.getLinkCandidates(
      requireString(sourcePath, 'sourcePath'),
      requireStringArray(pathnames, 'pathnames')
    )
  },

  prepareRenameRepair(request) {
    return service.prepareRenameRepair(requirePrepareRequest(request))
  },

  applyRenameRepair(request) {
    return service.applyRenameRepair(requireApplyRequest(request))
  },

  createSnapshot(request) {
    return service.createSnapshot(requireSnapshotRequest(request))
  },

  listSnapshots(filePath) {
    return service.listSnapshots(requireString(filePath, 'filePath'))
  },

  getSnapshot(filePath, id) {
    return service.getSnapshot(requireString(filePath, 'filePath'), requireString(id, 'id'))
  },

  deleteSnapshot(filePath, id) {
    return service.deleteSnapshot(requireString(filePath, 'filePath'), requireString(id, 'id'))
  },

  restoreSnapshot(request) {
    return service.restoreSnapshot(requireRestoreRequest(request))
  },

  pruneHistory() {
    return service.pruneHistory()
  }
})
