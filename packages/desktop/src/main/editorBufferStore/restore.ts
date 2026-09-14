import { canonicalPathKey } from '../session/pathCanonicalizer'

/**
 * The persisted buffer format is intentionally permissive because it must be
 * able to read files written by older Inkiva/MarkText versions.
 */
export interface BufferStoreTab {
  id?: string
  pathname?: string
  isSaved?: boolean
  [key: string]: unknown
}

export interface BufferStoreState {
  version?: number
  tabs: BufferStoreTab[]
  [key: string]: unknown
}

export const BUFFER_STORE_VERSION = 1

export const createEmptyBufferStoreState = (): BufferStoreState => ({
  version: BUFFER_STORE_VERSION,
  tabs: [],
  currentFileId: null,
  restoreWarnings: []
})

/**
 * Convert legacy recovery files to the current format and reject versions
 * that this build cannot safely interpret.
 */
export const normalizeBufferStoreState = (value: unknown): BufferStoreState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid editor buffer state.')
  }

  const state = value as Record<string, unknown>
  if (!Array.isArray(state.tabs)) {
    throw new Error('Invalid editor buffer state.')
  }
  if (state.tabs.some((tab) => !tab || typeof tab !== 'object' || Array.isArray(tab))) {
    throw new Error('Invalid editor buffer state.')
  }

  if (state.version !== undefined && state.version !== BUFFER_STORE_VERSION) {
    throw new Error(`Unsupported editor buffer state version: ${String(state.version)}`)
  }

  return {
    ...state,
    version: BUFFER_STORE_VERSION,
    tabs: state.tabs as BufferStoreTab[]
  }
}

const getTabId = (tab: BufferStoreTab): string | null =>
  typeof tab.id === 'string' && tab.id ? tab.id : null

const getCurrentFileId = (state: BufferStoreState): string | null => {
  if (typeof state.currentFileId === 'string' && state.currentFileId) {
    return state.currentFileId
  }

  const currentFile = state.currentFile
  if (currentFile && typeof currentFile === 'object') {
    const id = (currentFile as { id?: unknown }).id
    return typeof id === 'string' && id ? id : null
  }

  return null
}

const sameRestoredPath = (pathA: string, pathB: string, platform: NodeJS.Platform): boolean => {
  const keyA = canonicalPathKey(pathA, platform)
  const keyB = canonicalPathKey(pathB, platform)
  return keyA !== null && keyA === keyB
}

const shouldReplaceDuplicate = (existing: BufferStoreTab, candidate: BufferStoreTab): boolean => {
  // Never discard an unsaved edit in favor of a clean copy from another
  // stale window. If both copies have the same save status, keep the first
  // one to make the merge deterministic.
  return existing.isSaved !== false && candidate.isSaved === false
}

const resolveMappedId = (id: string, idMap: Map<string, string>): string => {
  let resolved = id
  const visited = new Set<string>()

  while (!visited.has(resolved)) {
    visited.add(resolved)
    const next = idMap.get(resolved)
    if (!next || next === resolved) break
    resolved = next
  }

  return resolved
}

const remapAliases = (from: string, to: string, idMap: Map<string, string>): void => {
  for (const [id, mappedId] of idMap) {
    if (id === from || mappedId === from) {
      idMap.set(id, to)
    }
  }
  idMap.set(from, to)
}

/**
 * Merge the states left by multiple editor windows into the state expected by
 * one restored editor window. Saved files are deduplicated by path; untitled
 * tabs are kept because each one is an independent recovery buffer.
 */
export const mergeBufferStoreContents = (
  states: readonly BufferStoreState[],
  options: { platform?: NodeJS.Platform } = {}
): BufferStoreState => {
  const platform = options.platform ?? process.platform
  if (states.length === 0) {
    return createEmptyBufferStoreState()
  }

  const tabs: BufferStoreTab[] = []
  const idMap = new Map<string, string>()
  const currentFileIds: string[] = []

  for (const state of states) {
    const currentFileId = getCurrentFileId(state)
    if (currentFileId) currentFileIds.push(currentFileId)

    for (const tab of state.tabs) {
      const pathname = typeof tab.pathname === 'string' ? tab.pathname : ''
      const existingIndex = pathname
        ? tabs.findIndex((existing) => {
          const existingPath = typeof existing.pathname === 'string' ? existing.pathname : ''
          return sameRestoredPath(existingPath, pathname, platform)
        })
        : -1

      if (existingIndex === -1) {
        tabs.push(tab)
        const tabId = getTabId(tab)
        if (tabId) idMap.set(tabId, tabId)
        continue
      }

      const existing = tabs[existingIndex]
      const candidateId = getTabId(tab)
      const existingId = getTabId(existing)

      if (shouldReplaceDuplicate(existing, tab)) {
        tabs[existingIndex] = tab
        if (existingId && candidateId) {
          remapAliases(existingId, candidateId, idMap)
        } else if (candidateId) {
          idMap.set(candidateId, candidateId)
        }
      } else if (candidateId && existingId) {
        idMap.set(candidateId, existingId)
      }
    }
  }

  const mergedCurrentFileId =
    currentFileIds
      .map((id) => resolveMappedId(id, idMap))
      .find((id) => tabs.some((tab) => getTabId(tab) === id)) ?? null

  const restoreWarnings: unknown[] = []
  const warningKeys = new Set<string>()
  for (const state of states) {
    if (!Array.isArray(state.restoreWarnings)) continue

    for (const rawWarning of state.restoreWarnings) {
      if (!rawWarning || typeof rawWarning !== 'object') continue

      const warning = { ...(rawWarning as Record<string, unknown>) }
      if (typeof warning.tabId === 'string' && warning.tabId) {
        warning.tabId = resolveMappedId(warning.tabId, idMap)
      }

      const key = [
        warning.tabId ?? '',
        warning.pathname ?? '',
        warning.msg ?? '',
        warning.style ?? '',
        warning.exclusiveType ?? ''
      ].join('\u0000')
      if (warningKeys.has(key)) continue
      warningKeys.add(key)
      restoreWarnings.push(warning)
    }
  }

  const merged: BufferStoreState = {
    ...states[0],
    version: BUFFER_STORE_VERSION,
    tabs,
    currentFileId: mergedCurrentFileId,
    restoreWarnings
  }

  // Keep the first window's project/layout as the deterministic primary
  // state, but do not lose a non-empty value when that first state predates
  // those fields.
  for (const key of ['project', 'layout']) {
    if (merged[key] != null) continue
    const fallback = states.find((state) => state[key] != null)?.[key]
    if (fallback != null) merged[key] = fallback
  }

  if ('currentFile' in merged) {
    merged.currentFile = mergedCurrentFileId ? { id: mergedCurrentFileId } : null
  }

  return merged
}
