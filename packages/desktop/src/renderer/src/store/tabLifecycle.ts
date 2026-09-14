export const TAB_LIFECYCLE_STATES = ['active', 'warm', 'cold'] as const
export type TabLifecycle = (typeof TAB_LIFECYCLE_STATES)[number]

export const DEFAULT_MAX_WARM_TABS = 2

export interface TabLifecycleSnapshot {
  activeId: string | null
  warmIds: string[]
  coldIds: string[]
  activationOrder: string[]
  byId: Record<string, TabLifecycle>
}

export interface TabLifecycleOptions {
  tabIds: readonly string[]
  activeId?: string | null
  activationOrder?: readonly string[]
  maxWarmTabs?: number
}

const uniqueKnownIds = (tabIds: readonly string[]): string[] => {
  const seen = new Set<string>()
  const result: string[] = []
  for (const id of tabIds) {
    if (typeof id !== 'string' || id.length === 0 || seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

const normalizeMaxWarmTabs = (value: number | undefined): number => {
  const maxWarmTabs = value ?? DEFAULT_MAX_WARM_TABS
  if (!Number.isInteger(maxWarmTabs) || maxWarmTabs < 0) {
    throw new Error('maxWarmTabs must be a non-negative integer')
  }
  return maxWarmTabs
}

/**
 * Derive the renderer resource policy for the current tab set.
 *
 * The desktop renderer mounts exactly one full Muya editor. This policy is the
 * explicit ownership boundary around that surface: the active tab may own the
 * full editor, the most recently used non-active tabs are warm lightweight
 * surfaces, and every remaining tab is cold document-model state only.
 */
export const buildTabLifecycle = ({
  tabIds,
  activeId = null,
  activationOrder = [],
  maxWarmTabs
}: TabLifecycleOptions): TabLifecycleSnapshot => {
  const knownIds = uniqueKnownIds(tabIds)
  const resolvedActiveId =
    activeId === null
      ? null
      : activeId && knownIds.includes(activeId)
        ? activeId
        : knownIds[0] ?? null
  const knownSet = new Set(knownIds)
  const orderedIds: string[] = []
  const append = (id: string): void => {
    if (knownSet.has(id) && !orderedIds.includes(id)) orderedIds.push(id)
  }

  if (resolvedActiveId) append(resolvedActiveId)
  for (const id of activationOrder) append(id)
  for (const id of knownIds) append(id)

  const warmIds = resolvedActiveId
    ? orderedIds
      .filter((id) => id !== resolvedActiveId)
      .slice(0, normalizeMaxWarmTabs(maxWarmTabs))
    : []
  const warmSet = new Set(warmIds)
  const coldIds = knownIds.filter((id) => id !== resolvedActiveId && !warmSet.has(id))
  const byId: Record<string, TabLifecycle> = {}

  for (const id of knownIds) {
    byId[id] = id === resolvedActiveId ? 'active' : warmSet.has(id) ? 'warm' : 'cold'
  }

  return {
    activeId: resolvedActiveId,
    warmIds,
    coldIds,
    activationOrder: orderedIds,
    byId
  }
}
