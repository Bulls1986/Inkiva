/**
 * File lifecycle events can arrive after a newer tab became active. Applying
 * one of those events would replace the live editor with the old document.
 */
export const isStaleEditorEvent = (
  eventId: string | undefined,
  currentTabId: string | null | undefined
): boolean => Boolean(eventId && currentTabId && eventId !== currentTabId)
