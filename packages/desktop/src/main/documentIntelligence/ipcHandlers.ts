import path from 'node:path'

import type {
  ApplyRenameRepairRequest,
  ApplyRenameRepairResult,
  LocalHistoryCreateRequest,
  LocalHistoryEntry,
  LocalHistoryPruneResult,
  LocalHistoryRestoreRequest,
  LocalHistorySnapshot,
  MoveHistoryPathRequest,
  MarkdownBacklink,
  MarkdownLinkCandidate,
  MarkdownDocumentInput,
  PrepareRenameRepairRequest,
  RenameRepairPathKind,
  RenameRepairPlan,
  WorkspaceLinkIndexResult
} from '@shared/types/documentIntelligence'

export interface DocumentIntelligenceHandlerService {
  indexWorkspace(rootPath: string | null, scopeId?: number): Promise<WorkspaceLinkIndexResult>
  refreshWorkspaceFile(pathname: string, scopeId?: number): Promise<void>
  indexDocument(pathname: string, markdown: string, scopeId?: number): void
  removeDocument(pathname: string, scopeId?: number): void
  getBacklinks(targetPath: string, scopeId?: number): MarkdownBacklink[]
  getLinkCandidates(
    sourcePath: string,
    pathnames: readonly string[],
    scopeId?: number
  ): MarkdownLinkCandidate[]
  searchWorkspaceLinkCandidates(
    sourcePath: string,
    query: string,
    scopeId?: number
  ): MarkdownLinkCandidate[]
  prepareRenameRepair(request: PrepareRenameRepairRequest): RenameRepairPlan
  applyRenameRepair(request: ApplyRenameRepairRequest): Promise<ApplyRenameRepairResult>
  createSnapshot(request: LocalHistoryCreateRequest): Promise<LocalHistoryEntry>
  listSnapshots(filePath: string): Promise<LocalHistoryEntry[]>
  getSnapshot(filePath: string, id: string): Promise<LocalHistorySnapshot | null>
  deleteSnapshot(filePath: string, id: string): Promise<boolean>
  restoreSnapshot(request: LocalHistoryRestoreRequest): Promise<LocalHistorySnapshot>
  moveHistoryPath(request: MoveHistoryPathRequest): Promise<number>
  pruneHistory(): Promise<LocalHistoryPruneResult>
}

export interface DocumentIntelligenceHandlers {
  indexWorkspace(rootPath: unknown): Promise<WorkspaceLinkIndexResult>
  refreshWorkspaceFile(pathname: unknown): Promise<void>
  indexDocument(pathname: unknown, markdown: unknown): void
  removeDocument(pathname: unknown): void
  getBacklinks(targetPath: unknown): MarkdownBacklink[]
  getLinkCandidates(sourcePath: unknown, pathnames: unknown): MarkdownLinkCandidate[]
  searchWorkspaceLinkCandidates(sourcePath: unknown, query: unknown): MarkdownLinkCandidate[]
  prepareRenameRepair(request: unknown): RenameRepairPlan
  applyRenameRepair(request: unknown): Promise<ApplyRenameRepairResult>
  createSnapshot(request: unknown): Promise<LocalHistoryEntry>
  listSnapshots(filePath: unknown): Promise<LocalHistoryEntry[]>
  getSnapshot(filePath: unknown, id: unknown): Promise<LocalHistorySnapshot | null>
  deleteSnapshot(filePath: unknown, id: unknown): Promise<boolean>
  restoreSnapshot(request: unknown): Promise<LocalHistorySnapshot>
  moveHistoryPath(request: unknown): Promise<number>
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

const requirePathKind = (
  value: unknown,
  name: string
): RenameRepairPathKind | undefined => {
  if (value === undefined) return undefined
  if (value !== 'file' && value !== 'directory') {
    throw new TypeError(`${name} must be file or directory`)
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

const requirePrepareRequest = (value: unknown): PrepareRenameRepairRequest => {
  if (!isRecord(value)) throw new TypeError('rename repair request must be an object')
  const pathKind = requirePathKind(value.pathKind, 'pathKind')
  if (value.includeResources !== undefined && typeof value.includeResources !== 'boolean') {
    throw new TypeError('includeResources must be a boolean')
  }
  return {
    fromPath: requireString(value.fromPath, 'fromPath'),
    toPath: requireString(value.toPath, 'toPath'),
    ...(pathKind ? { pathKind } : {}),
    ...(value.includeResources !== undefined
      ? { includeResources: value.includeResources }
      : {}),
    documents: requireDocumentInputs(value.documents)
  }
}

const requireMoveHistoryPathRequest = (value: unknown): MoveHistoryPathRequest => {
  if (!isRecord(value)) throw new TypeError('history move request must be an object')
  const pathKind = requirePathKind(value.pathKind, 'pathKind')
  return {
    fromPath: requireString(value.fromPath, 'fromPath'),
    toPath: requireString(value.toPath, 'toPath'),
    ...(pathKind ? { pathKind } : {})
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
  if (value.isBom !== undefined && typeof value.isBom !== 'boolean') {
    throw new TypeError('isBom must be a boolean')
  }
  return {
    filePath: requireString(value.filePath, 'filePath'),
    content: requireMarkdown(value.content, 'content'),
    ...(value.createdAt !== undefined ? { createdAt: value.createdAt as number } : {}),
    ...(value.reason !== undefined
      ? { reason: value.reason as LocalHistoryCreateRequest['reason'] }
      : {}),
    ...(value.encoding !== undefined ? { encoding: value.encoding as string } : {}),
    ...(value.isBom !== undefined ? { isBom: value.isBom as boolean } : {}),
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
  service: DocumentIntelligenceHandlerService,
  scopeId?: number
): DocumentIntelligenceHandlers => ({
  indexWorkspace(rootPath) {
    if (rootPath !== null && (typeof rootPath !== 'string' || !rootPath)) {
      throw new TypeError('rootPath must be an absolute, non-empty string or null')
    }
    if (typeof rootPath === 'string' && !path.isAbsolute(rootPath)) {
      throw new TypeError('rootPath must be absolute')
    }
    return scopeId === undefined
      ? service.indexWorkspace(rootPath)
      : service.indexWorkspace(rootPath, scopeId)
  },
  refreshWorkspaceFile(pathname) {
    const source = requireString(pathname, 'pathname')
    if (!path.isAbsolute(source)) throw new TypeError('pathname must be absolute')
    return scopeId === undefined
      ? service.refreshWorkspaceFile(source)
      : service.refreshWorkspaceFile(source, scopeId)
  },
  indexDocument(pathname, markdown) {
    const source = requireString(pathname, 'pathname')
    const content = requireMarkdown(markdown, 'markdown')
    if (scopeId === undefined) service.indexDocument(source, content)
    else service.indexDocument(source, content, scopeId)
  },

  removeDocument(pathname) {
    const source = requireString(pathname, 'pathname')
    if (scopeId === undefined) service.removeDocument(source)
    else service.removeDocument(source, scopeId)
  },

  getBacklinks(targetPath) {
    const target = requireString(targetPath, 'targetPath')
    return scopeId === undefined
      ? service.getBacklinks(target)
      : service.getBacklinks(target, scopeId)
  },

  getLinkCandidates(sourcePath, pathnames) {
    const source = requireString(sourcePath, 'sourcePath')
    const candidates = requireStringArray(pathnames, 'pathnames')
    return scopeId === undefined
      ? service.getLinkCandidates(source, candidates)
      : service.getLinkCandidates(source, candidates, scopeId)
  },

  searchWorkspaceLinkCandidates(sourcePath, query) {
    const source = requireString(sourcePath, 'sourcePath')
    const search = requireMarkdown(query, 'query')
    return scopeId === undefined
      ? service.searchWorkspaceLinkCandidates(source, search)
      : service.searchWorkspaceLinkCandidates(source, search, scopeId)
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

  moveHistoryPath(request) {
    return service.moveHistoryPath(requireMoveHistoryPathRequest(request))
  },

  pruneHistory() {
    return service.pruneHistory()
  }
})
