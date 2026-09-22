import type { EditorScrollOwner } from './documentGeometry'

export interface EditorBlockGeometry {
  top: number
  height: number
  bottom: number
}

export interface EditorLayoutChange {
  element: HTMLElement
  index: number
  previous: EditorBlockGeometry | null
  next: EditorBlockGeometry | null
  delta: number
}

export interface EditorLayoutReconcilerOptions {
  onChange?: (changes: readonly EditorLayoutChange[]) => void
  getScrollOwner?: () => EditorScrollOwner
}

export interface EditorLayoutReconciler {
  refresh(): void
  reset(deferMeasurement?: boolean): void
  destroy(): void
}

const BOTTOM_ANCHOR_TOLERANCE = 24
const GEOMETRY_EPSILON = 0.5

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

const getMaxScrollTop = (container: HTMLElement): number =>
  Math.max(0, container.scrollHeight - container.clientHeight)

const resolveContentRoot = (container: HTMLElement): HTMLElement | null => {
  for (const child of Array.from(container.children)) {
    if (child instanceof HTMLElement && child.classList.contains('mu-container')) return child
  }
  return null
}

const isHTMLElement = (element: Element): element is HTMLElement =>
  element instanceof HTMLElement

const measureBlock = (block: HTMLElement): EditorBlockGeometry => {
  const rect = block.getBoundingClientRect()
  return {
    top: rect.top,
    height: rect.height,
    bottom: rect.bottom
  }
}

const sameGeometry = (left: EditorBlockGeometry, right: EditorBlockGeometry): boolean =>
  Math.abs(left.top - right.top) < GEOMETRY_EPSILON &&
  Math.abs(left.height - right.height) < GEOMETRY_EPSILON &&
  Math.abs(left.bottom - right.bottom) < GEOMETRY_EPSILON

/**
 * Observe only the editor's direct block children. Diagram renderers mutate
 * descendants many times while producing SVG/canvas output; the parent block
 * is the smallest stable layout boundary whose ResizeObserver entry captures
 * the resulting height change.
 */
export function createEditorLayoutReconciler(
  container: HTMLElement,
  options: EditorLayoutReconcilerOptions = {}
): EditorLayoutReconciler {
  let root = resolveContentRoot(container)
  let blockOrder: HTMLElement[] = []
  let blockSet = new Set<HTMLElement>()
  const geometry = new Map<HTMLElement, EditorBlockGeometry>()
  const dirtyBlocks = new Set<HTMLElement>()
  const removedBlocks = new Map<HTMLElement, {
    index: number
    geometry: EditorBlockGeometry
  }>()
  let frame: number | null = null
  let destroyed = false
  let lastScrollTop = container.scrollTop
  let lastMaxScrollTop = getMaxScrollTop(container)
  let observerEpoch = 0

  let mutationObserver: MutationObserver | null = null
  let resizeObserver: ResizeObserver | null = null

  const observeMutationTargets = (disconnect = true): void => {
    if (disconnect) mutationObserver?.disconnect()
    mutationObserver?.observe(container, { childList: true })
    if (root) mutationObserver?.observe(root, { childList: true })
  }

  const schedule = (): void => {
    if (destroyed || frame !== null) return
    frame = requestFrame(flush)
  }

  const syncBlocks = (): boolean => {
    if (destroyed) return false

    const previousOrder = blockOrder
    const previousSet = new Set(previousOrder)
    const nextRoot = resolveContentRoot(container)
    const rootChanged = nextRoot !== root
    if (rootChanged) {
      root = nextRoot
      observeMutationTargets()
    }

    const nextOrder = root
      ? Array.from(root.children).filter(isHTMLElement)
      : []
    const nextSet = new Set(nextOrder)
    const orderChanged =
      rootChanged ||
      nextOrder.length !== previousOrder.length ||
      nextOrder.some((block, index) => block !== previousOrder[index])
    let changed = orderChanged

    for (let index = 0; index < previousOrder.length; index += 1) {
      const block = previousOrder[index]
      if (nextSet.has(block)) continue

      changed = true
      const previousGeometry = geometry.get(block)
      if (previousGeometry) {
        removedBlocks.set(block, { index, geometry: previousGeometry })
      }
      geometry.delete(block)
      dirtyBlocks.delete(block)
      resizeObserver?.unobserve(block)
    }

    for (const block of nextOrder) {
      if (previousSet.has(block)) continue

      changed = true
      const removed = removedBlocks.get(block)
      if (removed) {
        // A DOM move can be reported as a remove followed by an insert. Keep
        // its old sample so the next measurement is still a real delta.
        geometry.set(block, removed.geometry)
        removedBlocks.delete(block)
      }
      dirtyBlocks.add(block)
      resizeObserver?.observe(block)
    }

    if (orderChanged) {
      for (const block of nextOrder) dirtyBlocks.add(block)
    }

    blockOrder = nextOrder
    blockSet = new Set(nextOrder)
    return changed
  }

  const reconcileScroll = (changes: readonly EditorLayoutChange[]): void => {
    if (destroyed || (options.getScrollOwner?.() ?? 'desktop') !== 'desktop') return

    const currentMaxScrollTop = getMaxScrollTop(container)
    const wasAtBottom =
      lastScrollTop > 0 &&
      lastMaxScrollTop > 0 &&
      lastMaxScrollTop - lastScrollTop <= BOTTOM_ANCHOR_TOLERANCE
    let nextScrollTop = lastScrollTop

    if (wasAtBottom) {
      nextScrollTop = currentMaxScrollTop
    } else {
      const containerRect = container.getBoundingClientRect()
      for (const change of changes) {
        if (!change.previous || change.delta === 0) continue
        // A block whose old bottom was above the viewport moves the visible
        // content. Keep the user's anchor at the same viewport coordinate.
        if (change.previous.bottom <= containerRect.top + 1) {
          nextScrollTop += change.delta
        }
      }
      nextScrollTop = Math.max(0, nextScrollTop)
      nextScrollTop = Math.min(currentMaxScrollTop, nextScrollTop)
    }

    if (container.scrollTop !== nextScrollTop) container.scrollTop = nextScrollTop
  }

  const flush = (): void => {
    frame = null
    if (destroyed) return

    // Structural changes are synchronized by the direct-child mutation
    // callback before this frame is queued. Avoid rescanning the root during a
    // ResizeObserver-only frame; only dirty block references are measured here.
    const changes: EditorLayoutChange[] = []

    for (const [element, removed] of removedBlocks) {
      changes.push({
        element,
        index: removed.index,
        previous: removed.geometry,
        next: null,
        delta: -removed.geometry.height
      })
    }
    removedBlocks.clear()

    const dirty = [...dirtyBlocks]
    dirtyBlocks.clear()
    for (const block of dirty) {
      if (!root || block.parentElement !== root) continue

      const nextGeometry = measureBlock(block)
      const previousGeometry = geometry.get(block) ?? null
      geometry.set(block, nextGeometry)
      if (previousGeometry && sameGeometry(previousGeometry, nextGeometry)) continue

      changes.push({
        element: block,
        index: blockOrder.indexOf(block),
        previous: previousGeometry,
        next: nextGeometry,
        delta: previousGeometry
          ? nextGeometry.height - previousGeometry.height
          : nextGeometry.height
      })
    }

    if (changes.length) {
      reconcileScroll(changes)
      options.onChange?.(changes)
    }

    lastScrollTop = container.scrollTop
    lastMaxScrollTop = getMaxScrollTop(container)
  }

  const installObservers = (): void => {
    const epoch = ++observerEpoch
    if (typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver(() => {
        if (destroyed || epoch !== observerEpoch) return
        if (syncBlocks()) schedule()
      })
      observeMutationTargets(false)
    }

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => {
        if (destroyed || epoch !== observerEpoch) return
        for (const entry of entries) {
          const block = entry.target
          if (isHTMLElement(block) && blockSet.has(block) && block.parentElement === root) {
            dirtyBlocks.add(block)
          }
        }
        if (dirtyBlocks.size) schedule()
      })
      for (const block of blockOrder) resizeObserver.observe(block)
    }
  }

  const handleScroll = (): void => {
    if (destroyed) return
    // scrollHeight can force layout when the virtual surface has just changed.
    // Keep the scroll hot path to the compositor-backed scrollTop read only;
    // max scroll geometry is refreshed by layout/observer flushes below.
    lastScrollTop = container.scrollTop
  }

  syncBlocks()
  for (const block of blockOrder) {
    geometry.set(block, measureBlock(block))
  }
  dirtyBlocks.clear()

  installObservers()

  container.addEventListener('scroll', handleScroll, { passive: true })

  return {
    refresh() {
      if (destroyed) return
      syncBlocks()
      for (const block of blockOrder) dirtyBlocks.add(block)
      schedule()
    },
    reset(deferMeasurement = false) {
      if (destroyed) return
      if (frame !== null) cancelFrame(frame)
      frame = null
      observerEpoch += 1
      root = resolveContentRoot(container)
      mutationObserver?.disconnect()
      resizeObserver?.disconnect()
      mutationObserver = null
      resizeObserver = null
      blockOrder = root
        ? Array.from(root.children).filter(isHTMLElement)
        : []
      blockSet = new Set(blockOrder)
      geometry.clear()
      dirtyBlocks.clear()
      removedBlocks.clear()
      if (deferMeasurement) {
        for (const block of blockOrder) dirtyBlocks.add(block)
        installObservers()
        schedule()
        return
      }
      for (const block of blockOrder) {
        geometry.set(block, measureBlock(block))
      }
      lastScrollTop = container.scrollTop
      lastMaxScrollTop = getMaxScrollTop(container)
      installObservers()
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      observerEpoch += 1
      if (frame !== null) cancelFrame(frame)
      frame = null
      mutationObserver?.disconnect()
      resizeObserver?.disconnect()
      mutationObserver = null
      resizeObserver = null
      container.removeEventListener('scroll', handleScroll)
      blockOrder = []
      blockSet.clear()
      dirtyBlocks.clear()
      removedBlocks.clear()
      geometry.clear()
    }
  }
}
