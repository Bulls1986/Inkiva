export type DocumentDurabilityStatus = 'saved' | 'protected' | 'unprotected'

export interface DocumentDurabilityState {
  currentRevision: number
  fileSavedRevision: number
  recoveryProtectedRevision: number
  status: DocumentDurabilityStatus
  fileError: string | null
  recoveryError: string | null
}

const normalizeRevision = (revision: number): number =>
  Number.isFinite(revision) && revision >= 0 ? revision : 0

const withStatus = (state: Omit<DocumentDurabilityState, 'status'>): DocumentDurabilityState => ({
  ...state,
  status:
    state.fileSavedRevision >= state.currentRevision
      ? 'saved'
      : state.recoveryProtectedRevision >= state.currentRevision
        ? 'protected'
        : 'unprotected'
})

export const createDocumentDurability = (
  currentRevision = 0,
  saved = false
): DocumentDurabilityState => {
  const revision = normalizeRevision(currentRevision)
  return withStatus({
    currentRevision: revision,
    fileSavedRevision: saved ? revision : -1,
    recoveryProtectedRevision: -1,
    fileError: null,
    recoveryError: null
  })
}

export const markDocumentDirty = (
  state: DocumentDurabilityState,
  revision: number
): DocumentDurabilityState => {
  const nextRevision = Math.max(state.currentRevision, normalizeRevision(revision))
  return withStatus({
    ...state,
    currentRevision: nextRevision,
    fileError: null,
    recoveryError: null
  })
}

export const markRecoveryProtected = (
  state: DocumentDurabilityState,
  revision: number
): DocumentDurabilityState =>
  withStatus({
    ...state,
    recoveryProtectedRevision: Math.max(
      state.recoveryProtectedRevision,
      normalizeRevision(revision)
    ),
    recoveryError: null
  })

export const markRecoveryFailed = (
  state: DocumentDurabilityState,
  revision: number,
  error: unknown
): DocumentDurabilityState => {
  const normalized = normalizeRevision(revision)
  if (normalized < state.currentRevision) return state
  return withStatus({
    ...state,
    recoveryError: error instanceof Error ? error.message : String(error)
  })
}

export const markFileSaved = (
  state: DocumentDurabilityState,
  revision: number
): DocumentDurabilityState =>
  withStatus({
    ...state,
    fileSavedRevision: Math.max(state.fileSavedRevision, normalizeRevision(revision)),
    fileError: null
  })

export const markFileSaveFailed = (
  state: DocumentDurabilityState,
  revision: number,
  error: unknown
): DocumentDurabilityState => {
  const normalized = normalizeRevision(revision)
  if (normalized < state.currentRevision) return state
  return withStatus({
    ...state,
    fileError: error instanceof Error ? error.message : String(error)
  })
}
