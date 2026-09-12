import type { KeyedTocNode } from './tocKeys'
import { TOP_LEVEL_HEADINGS_SELECTOR, TOC_HEADING_SLUG_ATTRIBUTE } from './tocNavigation'

export { TOC_HEADING_SLUG_ATTRIBUTE }

export interface TocPosition {
  slug: string
  top: number
}

interface TocSlugLike {
  slug?: unknown
}

const normalizeQuery = (query: unknown): string =>
  typeof query === 'string' ? query.trim().toLocaleLowerCase() : ''

/**
 * Filter an outline without mutating the store-owned tree. Matching ancestors
 * remain in the result so a search never hides the path to a matching heading.
 */
export function filterTocTree(nodes: KeyedTocNode[], query: unknown): KeyedTocNode[] {
  const needle = normalizeQuery(query)
  if (!needle) return nodes

  const filter = (items: KeyedTocNode[]): KeyedTocNode[] => {
    const result: KeyedTocNode[] = []
    for (const node of items) {
      const children = filter(node.children)
      const label = typeof node.label === 'string' ? node.label : String(node.label ?? '')
      if (label.toLocaleLowerCase().includes(needle) || children.length > 0) {
        result.push({ ...node, children })
      }
    }
    return result
  }

  return filter(nodes)
}

export function getExpandableTocKeys(nodes: KeyedTocNode[]): string[] {
  const keys: string[] = []
  const visit = (items: KeyedTocNode[]): void => {
    for (const node of items) {
      if (node.children.length > 0) keys.push(node.key)
      visit(node.children)
    }
  }
  visit(nodes)
  return keys
}

/**
 * Return the heading whose cached content position is at or above the active
 * line. Positions are measured only when the outline/DOM changes; scrolling
 * this list is a binary search over numbers and never reads layout.
 */
export function findActiveTocSlug(
  positions: readonly TocPosition[],
  scrollTop: number,
  activationOffset = 40
): string | null {
  if (positions.length === 0) return null

  const activationLine = scrollTop + activationOffset
  let low = 0
  let high = positions.length - 1
  let result = 0

  while (low <= high) {
    const middle = low + Math.floor((high - low) / 2)
    if (positions[middle].top <= activationLine) {
      result = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }

  return positions[result]?.slug ?? null
}

/**
 * Bind the engine's runtime block slugs to the corresponding rendered
 * top-level headings. A data attribute is used instead of `id` so exported
 * GitHub anchors and document-authored IDs remain untouched.
 */
export function syncTocHeadingAnchors(container: Element, toc: readonly TocSlugLike[]): void {
  const headings = Array.from(container.querySelectorAll(TOP_LEVEL_HEADINGS_SELECTOR))
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index]
    heading.removeAttribute(TOC_HEADING_SLUG_ATTRIBUTE)
    const slug = toc[index]?.slug
    if (typeof slug === 'string' && slug.length > 0) {
      heading.setAttribute(TOC_HEADING_SLUG_ATTRIBUTE, slug)
    }
  }
}

export interface TocRefreshScheduler {
  schedule(documentId: string, refresh: () => void): void
  cancel(): void
}

/**
 * Coalesce heading refreshes and cancel a callback belonging to an old tab.
 * Ordinary paragraph edits never schedule this work; heading operations do it
 * once after the editor has applied the live tree and DOM patch.
 */
export function createTocRefreshScheduler(delay = 75): TocRefreshScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null
  let generation = 0
  let pendingDocumentId: string | null = null

  const cancel = (): void => {
    generation += 1
    pendingDocumentId = null
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  return {
    schedule(documentId, refresh) {
      if (timer !== null) clearTimeout(timer)
      const scheduledGeneration = ++generation
      pendingDocumentId = documentId
      timer = setTimeout(() => {
        timer = null
        if (scheduledGeneration !== generation || pendingDocumentId !== documentId) return
        pendingDocumentId = null
        refresh()
      }, delay)
    },
    cancel
  }
}

export interface TocScrollSync {
  attach(): void
  update(toc: readonly TocSlugLike[]): void
  refresh(): void
  destroy(): void
}

const requestFrame = (callback: FrameRequestCallback): number => {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback)
  return window.setTimeout(() => callback(Date.now()), 0)
}

const cancelFrame = (handle: number): void => {
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(handle)
  } else {
    window.clearTimeout(handle)
  }
}

/**
 * Keep active-heading state in sync with scrolling using a cached position
 * index. Layout is read during explicit rebuilds only, never from the scroll
 * event's hot path; MutationObserver deliberately watches only direct child
 * replacement so diagram internals cannot cause one rebuild per SVG mutation.
 */
export function createTocScrollSync(
  container: HTMLElement,
  onActiveChange: (slug: string | null) => void,
  activationOffset = 40
): TocScrollSync {
  let toc: readonly TocSlugLike[] = []
  let positions: TocPosition[] = []
  let activeSlug: string | null = null
  let rebuildHandle: number | null = null
  let activeHandle: number | null = null
  let attached = false
  let destroyed = false
  let mutationObserver: MutationObserver | null = null
  let resizeObserver: ResizeObserver | null = null

  const updateActive = (): void => {
    if (destroyed) return
    const nextSlug = findActiveTocSlug(positions, container.scrollTop, activationOffset)
    if (nextSlug === activeSlug) return
    activeSlug = nextSlug
    onActiveChange(nextSlug)
  }

  const rebuild = (): void => {
    rebuildHandle = null
    if (destroyed) return

    const rootRect = container.getBoundingClientRect()
    const headings = Array.from(container.querySelectorAll(TOP_LEVEL_HEADINGS_SELECTOR))
    syncTocHeadingAnchors(container, toc)
    positions = headings.reduce<TocPosition[]>((result, heading, index) => {
      const slug = toc[index]?.slug
      if (typeof slug !== 'string' || slug.length === 0) return result
      const rect = heading.getBoundingClientRect()
      result.push({
        slug,
        top: rect.top - rootRect.top + container.scrollTop
      })
      return result
    }, [])
    updateActive()
  }

  const scheduleRebuild = (): void => {
    if (destroyed || rebuildHandle !== null) return
    rebuildHandle = requestFrame(() => rebuild())
  }

  const scheduleActiveUpdate = (): void => {
    if (destroyed || activeHandle !== null) return
    activeHandle = requestFrame(() => {
      activeHandle = null
      updateActive()
    })
  }

  const handleScroll = (): void => {
    // Only the cached numeric positions are used here. In particular, do not
    // call getBoundingClientRect/querySelectorAll while the user is scrolling.
    scheduleActiveUpdate()
  }

  const refresh = (): void => {
    if (destroyed) return
    if (rebuildHandle !== null) {
      cancelFrame(rebuildHandle)
      rebuildHandle = null
    }
    rebuild()
  }

  const attach = (): void => {
    if (destroyed || attached) return
    attached = true
    container.addEventListener('scroll', handleScroll, { passive: true })

    if (typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver(() => scheduleRebuild())
      mutationObserver.observe(container, { childList: true })
    }
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => scheduleRebuild())
      resizeObserver.observe(container)
    }
    scheduleRebuild()
  }

  const update = (nextToc: readonly TocSlugLike[]): void => {
    toc = nextToc.slice()
    if (attached) scheduleRebuild()
  }

  const destroy = (): void => {
    if (destroyed) return
    destroyed = true
    if (rebuildHandle !== null) cancelFrame(rebuildHandle)
    if (activeHandle !== null) cancelFrame(activeHandle)
    rebuildHandle = null
    activeHandle = null
    mutationObserver?.disconnect()
    resizeObserver?.disconnect()
    container.removeEventListener('scroll', handleScroll)
    mutationObserver = null
    resizeObserver = null
    positions = []
  }

  return { attach, update, refresh, destroy }
}
