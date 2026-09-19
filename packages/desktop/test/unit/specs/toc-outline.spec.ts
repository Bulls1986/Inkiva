import { describe, expect, it, vi } from 'vitest'
import type { KeyedTocNode } from '@/util/tocKeys'
import {
  createTocRefreshScheduler,
  createTocScrollSync,
  filterTocTree,
  findActiveTocSlug,
  getExpandableTocKeys,
  syncTocHeadingAnchors,
  TOC_HEADING_SLUG_ATTRIBUTE
} from '@/util/tocOutline'

const outline: KeyedTocNode[] = [
  {
    key: 'guide',
    label: 'Guide',
    slug: 'uid-guide',
    children: [
      { key: 'api', label: 'API Reference', slug: 'uid-api', children: [] },
      { key: 'faq', label: 'FAQ', slug: 'uid-faq', children: [] }
    ]
  },
  { key: 'about', label: 'About', slug: 'uid-about', children: [] }
]

describe('TOC outline utilities', () => {
  it('filters case-insensitively while retaining matching ancestors', () => {
    const filtered = filterTocTree(outline, '  api  ')

    expect(filtered).toEqual([
      {
        key: 'guide',
        label: 'Guide',
        slug: 'uid-guide',
        children: [{ key: 'api', label: 'API Reference', slug: 'uid-api', children: [] }]
      }
    ])
    expect(outline[0].children).toHaveLength(2)
  })

  it('returns all expandable keys for expand/collapse controls', () => {
    expect(getExpandableTocKeys(outline)).toEqual(['guide'])
    expect(getExpandableTocKeys(filterTocTree(outline, 'faq'))).toEqual(['guide'])
  })

  it('selects the last heading before the activation line with binary search', () => {
    const positions = [
      { slug: 'first', top: 0 },
      { slug: 'second', top: 400 },
      { slug: 'third', top: 900 }
    ]

    expect(findActiveTocSlug(positions, 0, 40)).toBe('first')
    expect(findActiveTocSlug(positions, 380, 40)).toBe('second')
    expect(findActiveTocSlug(positions, 2000, 40)).toBe('third')
    expect(findActiveTocSlug([], 0)).toBeNull()
  })

  it('keeps the large-outline lookup free of per-scroll layout reads', () => {
    const positions = Array.from({ length: 10000 }, (_, index) => ({
      slug: `heading-${index}`,
      top: index * 48
    }))

    expect(findActiveTocSlug(positions, 456789, 40)).toBe('heading-9517')
    expect(findActiveTocSlug(positions, 0, 40)).toBe('heading-0')
  })

  it('debounces refreshes and cancels a stale document update', () => {
    vi.useFakeTimers()
    const refresh = vi.fn()
    const scheduler = createTocRefreshScheduler(50)

    scheduler.schedule('old-tab', refresh)
    scheduler.schedule('current-tab', refresh)
    vi.advanceTimersByTime(49)
    expect(refresh).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(refresh).toHaveBeenCalledTimes(1)

    scheduler.schedule('current-tab', refresh)
    scheduler.cancel()
    vi.advanceTimersByTime(50)
    expect(refresh).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('binds runtime slugs to only the headings represented by the TOC', () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <div class="mu-container">
        <h1>First</h1>
        <blockquote><h2>Nested and ignored</h2></blockquote>
        <h2>Second</h2>
      </div>
    `

    syncTocHeadingAnchors(container, [{ slug: 'uid-first' }, { slug: 'uid-second' }])

    const headings = container.querySelectorAll('.mu-container > h1, .mu-container > h2')
    expect(headings[0].getAttribute(TOC_HEADING_SLUG_ATTRIBUTE)).toBe('uid-first')
    expect(headings[1].getAttribute(TOC_HEADING_SLUG_ATTRIBUTE)).toBe('uid-second')
    expect(container.querySelector('blockquote h2')?.hasAttribute(TOC_HEADING_SLUG_ATTRIBUTE)).toBe(
      false
    )
  })

  it('binds virtualized headings by document block index instead of mounted order', () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <div class="mu-container">
        <h2 data-virtual-block-index="40">Middle</h2>
        <h2 data-virtual-block-index="80">Later</h2>
      </div>
    `
    syncTocHeadingAnchors(container, [
      { slug: 'uid-first', blockIndex: 2 },
      { slug: 'uid-middle', blockIndex: 40 },
      { slug: 'uid-later', blockIndex: 80 }
    ])

    const headings = container.querySelectorAll('.mu-container > h2')
    expect(headings[0].getAttribute(TOC_HEADING_SLUG_ATTRIBUTE)).toBe('uid-middle')
    expect(headings[1].getAttribute(TOC_HEADING_SLUG_ATTRIBUTE)).toBe('uid-later')
  })

  it('tracks active virtualized headings from document-level offsets', () => {
    const container = document.createElement('div')
    container.scrollTop = 850
    const onActiveChange = vi.fn()
    const offsets = new Map([[2, 0], [40, 800], [80, 1600]])
    const sync = createTocScrollSync(
      container,
      onActiveChange,
      40,
      (blockIndex) => offsets.get(blockIndex) ?? null
    )
    sync.update([
      { slug: 'uid-first', blockIndex: 2 },
      { slug: 'uid-middle', blockIndex: 40 },
      { slug: 'uid-later', blockIndex: 80 }
    ])
    sync.attach()
    sync.refresh()

    expect(onActiveChange).toHaveBeenLastCalledWith('uid-middle')
    sync.destroy()
  })

  it('falls back to DOM heading positions when the virtual offset provider is inactive', () => {
    const container = document.createElement('div')
    const root = document.createElement('div')
    const firstHeading = document.createElement('h1')
    const secondHeading = document.createElement('h2')
    root.className = 'mu-container'
    root.append(firstHeading, secondHeading)
    container.append(root)
    document.body.append(container)
    container.scrollTop = 0

    const rect = (top: number): DOMRect => ({
      top,
      bottom: top + 40,
      height: 40,
      left: 0,
      right: 700,
      width: 700,
      x: 0,
      y: top,
      toJSON: () => ({})
    } as DOMRect)
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(rect(0))
    vi.spyOn(firstHeading, 'getBoundingClientRect').mockReturnValue(rect(0))
    vi.spyOn(secondHeading, 'getBoundingClientRect').mockReturnValue(rect(500))
    const onActiveChange = vi.fn()
    const sync = createTocScrollSync(container, onActiveChange, 40, () => null)
    sync.update([
      { slug: 'uid-first', blockIndex: 0 },
      { slug: 'uid-second', blockIndex: 1 }
    ])
    sync.attach()
    sync.refresh()

    expect(onActiveChange).toHaveBeenLastCalledWith('uid-first')
    sync.destroy()
    container.remove()
  })

  it('reads current virtual offsets on scroll after measured geometry changes', async() => {
    const container = document.createElement('div')
    container.scrollTop = 850
    const onActiveChange = vi.fn()
    const offsets = new Map([[2, 0], [40, 800], [80, 1600]])
    const sync = createTocScrollSync(
      container,
      onActiveChange,
      40,
      (blockIndex) => offsets.get(blockIndex) ?? null
    )
    sync.update([
      { slug: 'uid-first', blockIndex: 2 },
      { slug: 'uid-middle', blockIndex: 40 },
      { slug: 'uid-later', blockIndex: 80 }
    ])
    sync.attach()
    sync.refresh()
    expect(onActiveChange).toHaveBeenLastCalledWith('uid-middle')

    // Exact block measurements can move virtual offsets without rebuilding the
    // desktop TOC cache. The next scroll frame must use the live offsets.
    offsets.set(40, 400)
    offsets.set(80, 800)
    container.dispatchEvent(new Event('scroll'))
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))

    expect(onActiveChange).toHaveBeenLastCalledWith('uid-later')
    sync.destroy()
  })

  it('shifts cached headings locally when a preceding diagram changes size', () => {
    const container = document.createElement('div')
    const root = document.createElement('div')
    const diagram = document.createElement('figure')
    const firstHeading = document.createElement('h1')
    const secondHeading = document.createElement('h2')
    root.className = 'mu-container'
    diagram.className = 'mu-diagram-block'
    firstHeading.textContent = 'First'
    secondHeading.textContent = 'Second'
    root.append(diagram, firstHeading, secondHeading)
    container.append(root)
    document.body.append(container)
    container.scrollTop = 350

    const rect = (top: number): DOMRect => ({
      top,
      bottom: top + 40,
      height: 40,
      left: 0,
      right: 700,
      width: 700,
      x: 0,
      y: top,
      toJSON: () => ({})
    } as DOMRect)
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(rect(0))
    vi.spyOn(firstHeading, 'getBoundingClientRect').mockReturnValue(rect(-350))
    const secondRect = vi.spyOn(secondHeading, 'getBoundingClientRect').mockReturnValue(rect(-50))
    const onActiveChange = vi.fn()
    const sync = createTocScrollSync(container, onActiveChange)
    sync.update([{ slug: 'first' }, { slug: 'second' }])
    sync.attach()
    sync.refresh()
    secondRect.mockClear()
    onActiveChange.mockClear()

    sync.reconcile([{
      element: diagram,
      index: 0,
      previous: { top: -250, height: 100, bottom: -150 },
      next: { top: -250, height: 220, bottom: -30 },
      delta: 120
    }])

    expect(secondRect).not.toHaveBeenCalled()
    expect(onActiveChange).toHaveBeenCalledWith('first')
    sync.destroy()
    container.remove()
  })
})
