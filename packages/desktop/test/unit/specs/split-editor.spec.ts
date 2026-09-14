import {
  getDefaultSplitTabId,
  normalizeSplitTabId,
  promoteSplitTab,
  toggleSplitEditor,
  type SplitTab
} from '@/util/splitEditor'
import { describe, expect, it } from 'vitest'

const tabs: SplitTab[] = [
  { id: 'a', pathname: '/docs/a.md' },
  { id: 'b', pathname: '/docs/b.md' },
  { id: 'c', pathname: '/docs/c.md' }
]

describe('split editor state', () => {
  it('opens the first other document, or the current document for A|A', () => {
    expect(getDefaultSplitTabId('a', tabs)).toBe('b')
    expect(getDefaultSplitTabId('a', [{ id: 'a', pathname: '/docs/a.md' }])).toBe('a')
    expect(getDefaultSplitTabId(null, tabs)).toBeNull()
  })

  it('normalizes a closed or unknown secondary document', () => {
    expect(normalizeSplitTabId('b', 'a', tabs)).toBe('b')
    expect(normalizeSplitTabId('missing', 'a', tabs)).toBe('b')
    expect(normalizeSplitTabId(null, 'a', tabs)).toBe('b')
    expect(normalizeSplitTabId('b', null, tabs)).toBeNull()
  })

  it('toggles without ever creating more than one secondary pane', () => {
    expect(toggleSplitEditor(false, 'a', tabs)).toEqual({ enabled: true, tabId: 'b' })
    expect(toggleSplitEditor(true, 'a', tabs)).toEqual({ enabled: false, tabId: null })
    expect(toggleSplitEditor(true, null, tabs)).toEqual({ enabled: false, tabId: null })
  })

  it('promotes the secondary document and keeps the old primary as secondary', () => {
    expect(promoteSplitTab('a', 'b', tabs)).toEqual({ primaryId: 'b', secondaryId: 'a' })
    expect(promoteSplitTab('a', 'a', tabs)).toEqual({ primaryId: 'a', secondaryId: 'a' })
    expect(promoteSplitTab(null, 'b', tabs)).toBeNull()
  })
})
