export interface SplitTab {
  id: string
  pathname?: string | null
}

export interface SplitToggleState {
  enabled: boolean
  tabId: string | null
}

export interface PromotedSplitState {
  primaryId: string
  secondaryId: string
}

/** Choose a stable second document without inventing a new tab. */
export const getDefaultSplitTabId = (
  currentId: string | null | undefined,
  tabs: readonly SplitTab[]
): string | null => {
  if (!currentId) return null
  return tabs.find((tab) => tab.id !== currentId)?.id ?? currentId
}

/** Keep the secondary pane valid after a tab is closed or restored. */
export const normalizeSplitTabId = (
  splitId: string | null | undefined,
  currentId: string | null | undefined,
  tabs: readonly SplitTab[]
): string | null => {
  if (!currentId) return null
  if (splitId && tabs.some((tab) => tab.id === splitId)) return splitId
  return getDefaultSplitTabId(currentId, tabs)
}

export const toggleSplitEditor = (
  enabled: boolean,
  currentId: string | null | undefined,
  tabs: readonly SplitTab[]
): SplitToggleState => ({
  enabled: !enabled && !!currentId,
  tabId: enabled ? null : getDefaultSplitTabId(currentId, tabs)
})

export const promoteSplitTab = (
  primaryId: string | null | undefined,
  secondaryId: string | null | undefined,
  tabs: readonly SplitTab[]
): PromotedSplitState | null => {
  if (!primaryId || !secondaryId) return null
  if (!tabs.some((tab) => tab.id === secondaryId)) return null
  return { primaryId: secondaryId, secondaryId: primaryId }
}
