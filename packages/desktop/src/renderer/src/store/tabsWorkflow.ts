export interface TabWorkflowEntry {
  id: string
}

export const getTabIdsToCloseRight = <T extends TabWorkflowEntry>(
  tabs: readonly T[],
  targetId: string
): string[] => {
  const targetIndex = tabs.findIndex((tab) => tab.id === targetId)
  return targetIndex === -1 ? [] : tabs.slice(targetIndex + 1).map((tab) => tab.id)
}

export const pushClosedTab = <T>(
  history: readonly T[],
  tab: T,
  limit: number
): T[] => [tab, ...history].slice(0, Math.max(0, limit))
