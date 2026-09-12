import { describe, expect, it, vi } from 'vitest'
import type { KeyedTocNode } from '@/util/tocKeys'
import {
  createTocRefreshScheduler,
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
})
