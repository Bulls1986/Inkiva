import { describe, expect, it } from 'vitest'
import {
  getTabIdsToCloseRight,
  pushClosedTab,
  type TabWorkflowEntry
} from '@/store/tabsWorkflow'

describe('Tabs 2.0 workflow primitives', () => {
  it('returns only tabs to the right of the context-menu target', () => {
    const tabs: TabWorkflowEntry[] = [
      { id: 'left' },
      { id: 'target' },
      { id: 'right-a' },
      { id: 'right-b' }
    ]

    expect(getTabIdsToCloseRight(tabs, 'target')).toEqual(['right-a', 'right-b'])
    expect(getTabIdsToCloseRight(tabs, 'right-b')).toEqual([])
  })

  it('keeps the most recently closed tab first and caps history', () => {
    const history = pushClosedTab(
      [{ id: 'older' }, { id: 'oldest' }],
      { id: 'newest' },
      2
    )

    expect(history).toEqual([{ id: 'newest' }, { id: 'older' }])
  })
})
