// The recovery banner is a startup notice, so its "×" dismissal has to
// outlive the window: a user who closed the notice should not see it again on
// the next launch while the same recovery entries are still pending. We store
// the ids the user dismissed in localStorage (the same renderer-side
// persistence the sidebar width and export options use) and show the banner
// again as soon as one pending entry was never dismissed.

export const RECOVERY_BANNER_DISMISSED_STORAGE_KEY = 'recovery-banner-dismissed-ids'

export interface RecoveryBannerStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export interface RecoveryBannerItem {
  id: string
}

const resolveStorage = (
  storage?: RecoveryBannerStorage | null
): RecoveryBannerStorage | null => {
  if (storage) return storage
  try {
    return globalThis.localStorage ?? null
  } catch {
    // Accessing localStorage itself can throw when storage is disabled.
    return null
  }
}

const unique = (ids: readonly string[]): string[] => {
  const seen = new Set<string>()
  const result: string[] = []
  for (const id of ids) {
    if (typeof id !== 'string' || !id || seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

/**
 * Read the recovery ids dismissed in earlier sessions.
 *
 * Persisting a dismissal is best-effort: a missing, malformed or unreadable
 * value simply means nothing was dismissed yet.
 */
export const loadDismissedRecoveryIds = (
  storage?: RecoveryBannerStorage | null
): string[] => {
  const target = resolveStorage(storage)
  if (!target) return []
  try {
    const raw = target.getItem(RECOVERY_BANNER_DISMISSED_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? unique(parsed as string[]) : []
  } catch {
    return []
  }
}

/** Persist the dismissed recovery ids; failures must never break the banner. */
export const saveDismissedRecoveryIds = (
  ids: readonly string[],
  storage?: RecoveryBannerStorage | null
): void => {
  const target = resolveStorage(storage)
  if (!target) return
  try {
    target.setItem(RECOVERY_BANNER_DISMISSED_STORAGE_KEY, JSON.stringify(unique(ids)))
  } catch {
    // Storage can be unavailable (private mode / quota); dismissal stays
    // session-local rather than breaking the recovery flow.
  }
}

/** Merge newly dismissed ids into the previously dismissed set. */
export const mergeDismissedRecoveryIds = (
  dismissed: readonly string[],
  additional: readonly string[]
): string[] => unique([...dismissed, ...additional])

/**
 * Show the banner only while at least one pending recovery entry was never
 * dismissed. Dismissing every current entry therefore keeps it hidden across
 * restarts, and a newly accumulated entry brings it back.
 */
export const shouldShowRecoveryBanner = (
  items: readonly RecoveryBannerItem[],
  dismissed: readonly string[]
): boolean => {
  if (!items.length) return false
  const dismissedIds = new Set(dismissed)
  return items.some(({ id }) => !dismissedIds.has(id))
}
