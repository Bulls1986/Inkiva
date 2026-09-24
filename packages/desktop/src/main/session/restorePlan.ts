import { canonicalizePath } from './pathCanonicalizer'
import {
  mergeBufferStoreContents,
  type BufferStoreState,
  type BufferStoreTab
} from '../editorBufferStore/restore'

export interface RecoverySource {
  id: string
  filePath: string
}

export type RestoreSkipReason = 'read-failed' | 'invalid-state'

export interface SkippedRecoverySource extends RecoverySource {
  reason: RestoreSkipReason
  message: string
}

export interface RestorePlanTab {
  recoveryId: string
  canonicalPath: string
}

export interface RestoreWindowPlan {
  windowId: string
  workspace: string | null
  tabs: RestorePlanTab[]
  activeTab: string | null
}

export interface RestorePlan {
  kind: 'blank' | 'restore'
  windows: RestoreWindowPlan[]
  state: BufferStoreState | null
  automaticState: BufferStoreState | null
  pendingTabs: BufferStoreTab[]
  primarySource: RecoverySource | null
  sources: RecoverySource[]
  skippedSources: SkippedRecoverySource[]
}

export interface RestorePlanOptions {
  platform?: NodeJS.Platform
}

export type RecoveryStateReader = (source: RecoverySource) => unknown | Promise<unknown>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

/**
 * Migrate the two persisted shapes that have existed in Inkiva/MarkText:
 * either the editor state at the root or a BufferedState wrapper containing
 * `editor`. The result remains intentionally permissive until validation.
 */
export const migrateRestoreState = (raw: unknown): BufferStoreState | null => {
  if (!isRecord(raw)) return null

  if (Array.isArray(raw.tabs)) {
    return { ...raw, tabs: raw.tabs } as BufferStoreState
  }

  const editor = raw.editor
  if (!isRecord(editor) || !Array.isArray(editor.tabs)) return null

  const { editor: _editor, ...outerState } = raw
  return { ...outerState, ...editor, tabs: editor.tabs } as BufferStoreState
}

/**
 * Validate the untrusted JSON boundary without throwing. Invalid individual
 * tabs are filtered; a source with no valid tabs is rejected as a whole so a
 * malformed or empty recovery file cannot create a misleading empty state.
 */
export const validateRestoreState = (raw: unknown): BufferStoreState | null => {
  const migrated = migrateRestoreState(raw)
  if (!migrated) return null

  const tabs: BufferStoreTab[] = []
  for (const rawTab of migrated.tabs) {
    if (!isRecord(rawTab)) continue

    const id = rawTab.id
    if (typeof id !== 'string' || id.length === 0) continue

    tabs.push({
      ...rawTab,
      id,
      pathname: typeof rawTab.pathname === 'string' ? rawTab.pathname : ''
    })
  }

  if (tabs.length === 0) return null
  return { ...migrated, tabs }
}

const normalizeRestoreState = (
  state: BufferStoreState,
  platform: NodeJS.Platform
): BufferStoreState => {
  const tabs = state.tabs.map((tab) => {
    if (!tab.pathname) return { ...tab, pathname: '' }
    return { ...tab, pathname: canonicalizePath(tab.pathname, platform).path }
  })

  const project = state.project
  if (!isRecord(project) || typeof project.rootDirectory !== 'string' || !project.rootDirectory) {
    return { ...state, tabs }
  }

  return {
    ...state,
    tabs,
    project: {
      ...project,
      rootDirectory: canonicalizePath(project.rootDirectory, platform).path
    }
  }
}

const sortSources = (sources: readonly RecoverySource[]): RecoverySource[] =>
  sources
    .filter(
      (source): source is RecoverySource =>
        !!source &&
        typeof source.id === 'string' &&
        source.id.length > 0 &&
        typeof source.filePath === 'string' &&
        source.filePath.length > 0
    )
    .map((source) => ({ id: source.id, filePath: source.filePath }))
    .sort((a, b) => a.id.localeCompare(b.id) || a.filePath.localeCompare(b.filePath))

export const createBlankRestorePlan = (
  skippedSources: SkippedRecoverySource[] = []
): RestorePlan => ({
  kind: 'blank',
  windows: [],
  state: null,
  automaticState: null,
  pendingTabs: [],
  primarySource: null,
  sources: [],
  skippedSources
})

/**
 * Build the complete restore plan before any restore tabs or additional editor
 * windows are created. The startup shell may already be visible while this
 * plan is being assembled.
 * Reading failures are recorded per source, allowing valid recovery files to
 * survive a partial corruption and allowing an all-corrupt session to fall
 * back to a normal blank editor.
 */
export const buildRestorePlan = async(
  inputSources: readonly RecoverySource[],
  readState: RecoveryStateReader,
  options: RestorePlanOptions = {}
): Promise<RestorePlan> => {
  const platform = options.platform ?? process.platform
  const sources = sortSources(inputSources)
  const validStates: Array<{ source: RecoverySource; state: BufferStoreState }> = []
  const skippedSources: SkippedRecoverySource[] = []

  for (const source of sources) {
    let raw: unknown
    try {
      raw = await readState(source)
    } catch (error) {
      skippedSources.push({
        ...source,
        reason: 'read-failed',
        message: error instanceof Error ? error.message : String(error)
      })
      continue
    }

    const state = validateRestoreState(raw)
    if (!state) {
      skippedSources.push({
        ...source,
        reason: 'invalid-state',
        message: 'Recovery state does not contain a valid editor tab list.'
      })
      continue
    }

    validStates.push({ source, state: normalizeRestoreState(state, platform) })
  }

  if (validStates.length === 0) return createBlankRestorePlan(skippedSources)

  const firstValidState = validStates[0]
  if (!firstValidState) return createBlankRestorePlan(skippedSources)

  const state = mergeBufferStoreContents(
    validStates.map(({ state: validState }) => validState),
    { platform }
  )
  const pendingTabs = state.tabs.filter((tab) => tab.isSaved === false)
  const automaticTabs = state.tabs.filter((tab) => tab.isSaved !== false)
  const automaticIds = new Set(
    automaticTabs.flatMap((tab) => (typeof tab.id === 'string' && tab.id ? [tab.id] : []))
  )
  const requestedCurrentFileId =
    typeof state.currentFileId === 'string' ? state.currentFileId : null
  const automaticCurrentFileId =
    requestedCurrentFileId && automaticIds.has(requestedCurrentFileId)
      ? requestedCurrentFileId
      : (automaticTabs.find((tab) => typeof tab.id === 'string' && tab.id)?.id ?? null)
  const automaticState: BufferStoreState = {
    ...state,
    tabs: automaticTabs,
    currentFileId: automaticCurrentFileId
  }
  if ('currentFile' in automaticState) {
    automaticState.currentFile = automaticCurrentFileId ? { id: automaticCurrentFileId } : null
  }

  const primarySource = firstValidState.source
  const window: RestoreWindowPlan = {
    windowId: primarySource.id,
    workspace:
      isRecord(state.project) && typeof state.project.rootDirectory === 'string'
        ? state.project.rootDirectory
        : null,
    tabs: state.tabs.flatMap((tab) => {
      if (typeof tab.id !== 'string' || tab.id.length === 0) return []
      return [{ recoveryId: tab.id, canonicalPath: tab.pathname ?? '' }]
    }),
    activeTab: typeof state.currentFileId === 'string' ? state.currentFileId : null
  }

  return {
    kind: 'restore',
    windows: [window],
    state,
    automaticState,
    pendingTabs,
    primarySource,
    sources: validStates.map(({ source }) => source),
    skippedSources
  }
}

export default buildRestorePlan
