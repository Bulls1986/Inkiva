import type { KeyedTocNode } from './tocKeys'
import type { EditorLayoutChange } from './editorLayout'
import {
  TOP_LEVEL_HEADINGS_SELECTOR,
  TOC_HEADING_SLUG_ATTRIBUTE,
  VIRTUAL_BLOCK_INDEX_ATTRIBUTE
} from './tocNavigation'

export { TOC_HEADING_SLUG_ATTRIBUTE }

export interface TocPosition {
  slug: string
  top: number
}

interface TocSlugLike {
  slug?: unknown
  blockIndex?: unknown
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
    const virtualBlockIndexAttribute = heading.getAttribute(VIRTUAL_BLOCK_INDEX_ATTRIBUTE)
    const virtualBlockIndex = virtualBlockIndexAttribute === null
      ? null
      : Number(virtualBlockIndexAttribute)
    const tocItem = virtualBlockIndex !== null && Number.isInteger(virtualBlockIndex)
      ? toc.find((item) => item.blockIndex === virtualBlockIndex)
      : toc[index]
    const slug = tocItem?.slug
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
  reconcile(changes: readonly EditorLayoutChange[]): void
  destroy(): void
}

interface CachedTocPosition extends TocPosition {
  heading: Element | null
  block: Element | null
  blockIndex: number
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
 * event's hot path. Block-size changes are reconciled from the editor's local
 * layout signal so a diagram resize shifts following headings without
 * rescanning every heading.
 */
export function createTocScrollSync(
  container: HTMLElement,
  onActiveChange: (slug: string | null) => void,
  activationOffset = 40,
  getVirtualBlockOffset?: (blockIndex: number) => number | null
): TocScrollSync {
  let toc: readonly TocSlugLike[] = []
  let positions: CachedTocPosition[] = []
  let activeSlug: string | null = null
  let rebuildHandle: number | null = null
  let activeHandle: number | null = null
  let activeGeneration = 0
  let attached = false
  let destroyed = false
  let virtualOffsetsActive = false

  const hasVirtualOffsets = (): boolean => {
    if (!getVirtualBlockOffset) return false
    for (const item of toc) {
      const blockIndex = item.blockIndex
      if (
        typeof blockIndex === 'number' &&
        Number.isInteger(blockIndex) &&
        getVirtualBlockOffset(blockIndex) !== null
      ) return true
    }
    return false
  }

  const findActiveVirtualSlug = (): string | null => {
    if (!getVirtualBlockOffset) return null
    const target = container.scrollTop + activationOffset
    let low = 0
    let high = toc.length - 1
    let best: string | null = null

    while (low <= high) {
      const mid = Math.floor((low + high) / 2)
      const item = toc[mid]
      const slug = item?.slug
      const blockIndex = item?.blockIndex
      if (
        typeof slug !== 'string' ||
        slug.length === 0 ||
        typeof blockIndex !== 'number' ||
        !Number.isInteger(blockIndex)
      ) {
        // TOC entries produced by Muya are ordered and complete, but keep the
        // fallback path robust for external/legacy callers with partial items.
        return findActiveTocSlug(
          positions.map((position) => ({
            ...position,
            top: getVirtualBlockOffset(position.blockIndex) ?? position.top
          })),
          container.scrollTop,
          activationOffset
        )
      }

      const top = getVirtualBlockOffset(blockIndex)
      if (top === null) return best
      if (top <= target) {
        best = slug
        low = mid + 1
      } else {
        high = mid - 1
      }
    }

    return best
  }

  const updateActive = (): void => {
    if (destroyed) return
    // Virtual offsets evolve as mounted blocks replace estimates with exact
    // measurements. Never use the snapshot captured by `rebuild()` on the
    // scroll hot path; resolve the current numeric offsets directly instead.
    // This stays layout-free and uses O(log headings) offset lookups.
    const nextSlug = virtualOffsetsActive
      ? findActiveVirtualSlug()
      : findActiveTocSlug(positions, container.scrollTop, activationOffset)
    if (nextSlug === activeSlug) return
    activeSlug = nextSlug
    onActiveChange(nextSlug)
  }

  const rebuild = (): void => {
    rebuildHandle = null
    if (destroyed) return

    const rootRect = container.getBoundingClientRect()
    const headings = Array.from(container.querySelectorAll(TOP_LEVEL_HEADINGS_SELECTOR))
    const root = Array.from(container.children).find((child) =>
      child instanceof HTMLElement && child.classList.contains('mu-container'))
    syncTocHeadingAnchors(container, toc)
    virtualOffsetsActive = hasVirtualOffsets()
    if (virtualOffsetsActive) {
      positions = toc.reduce<CachedTocPosition[]>((result, item) => {
        const slug = item.slug
        const blockIndex = item.blockIndex
        if (
          typeof slug !== 'string' ||
          slug.length === 0 ||
          typeof blockIndex !== 'number' ||
          !Number.isInteger(blockIndex)
        ) return result
        const top = getVirtualBlockOffset?.(blockIndex) ?? null
        if (top === null) return result
        result.push({ slug, top, heading: null, block: null, blockIndex })
        return result
      }, [])
      updateActive()
      return
    }
    positions = headings.reduce<CachedTocPosition[]>((result, heading, index) => {
      const slug = toc[index]?.slug
      if (typeof slug !== 'string' || slug.length === 0) return result
      const rect = heading.getBoundingClientRect()
      let block: Element = heading
      while (block.parentElement && block.parentElement !== root) {
        block = block.parentElement
      }
      const blockIndex = root && block.parentElement === root
        ? Array.prototype.indexOf.call(root.children, block)
        : -1
      result.push({
        slug,
        top: rect.top - rootRect.top + container.scrollTop,
        heading,
        block: root && block.parentElement === root ? block : null,
        blockIndex
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
    if (destroyed) return

    const generation = ++activeGeneration
    if (activeHandle !== null) {
      cancelFrame(activeHandle)
      activeHandle = null
    }

    // Updating `activeTocSlug` invalidates the reactive outline tree. During a
    // continuous scroll that used to happen once per frame, consuming most of
    // the renderer frame budget on large outlines. Treat each scroll event as a
    // candidate viewport and commit only after two consecutive paint boundaries
    // stay on the same generation. A newer scroll cancels the old generation,
    // while a scrollbar jump still updates the outline within two paints.
    activeHandle = requestFrame(() => {
      if (destroyed || generation !== activeGeneration) return
      activeHandle = requestFrame(() => {
        if (destroyed || generation !== activeGeneration) return
        activeHandle = null
        updateActive()
      })
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

  const reconcile = (changes: readonly EditorLayoutChange[]): void => {
    if (destroyed || changes.length === 0) return

    if (virtualOffsetsActive) {
      rebuild()
      return
    }

    // Insertion/removal changes the heading-to-block mapping. Rebuild once for
    // that structural boundary; ordinary diagram resizes stay on the local
    // numeric cache path below.
    if (changes.some(({ previous, next }) => previous === null || next === null)) {
      scheduleRebuild()
      return
    }

    for (const change of changes) {
      if (change.delta === 0) continue
      for (const position of positions) {
        if (position.block === change.element) continue
        if (position.blockIndex > change.index) {
          position.top += change.delta
        }
      }
    }

    let rootRect: DOMRect | null = null
    for (const change of changes) {
      if (!change.next) continue
      for (const position of positions) {
        if (position.block !== change.element) continue
        if (!position.heading) continue
        rootRect ??= container.getBoundingClientRect()
        const rect = position.heading.getBoundingClientRect()
        position.top = rect.top - rootRect.top + container.scrollTop
      }
    }
    updateActive()
  }

  const attach = (): void => {
    if (destroyed || attached) return
    attached = true
    container.addEventListener('scroll', handleScroll, { passive: true })
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
    activeGeneration += 1
    if (activeHandle !== null) cancelFrame(activeHandle)
    rebuildHandle = null
    activeHandle = null
    container.removeEventListener('scroll', handleScroll)
    positions = []
  }

  return { attach, update, refresh, reconcile, destroy }
}
