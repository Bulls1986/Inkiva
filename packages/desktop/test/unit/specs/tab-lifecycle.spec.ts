import { describe, expect, it } from 'vitest'
import { buildTabLifecycle, DEFAULT_MAX_WARM_TABS } from '@/store/tabLifecycle'

describe('tab lifecycle policy', () => {
  it('keeps one active tab and caps warm resources at two', () => {
    const snapshot = buildTabLifecycle({
      tabIds: ['a', 'b', 'c', 'd', 'e'],
      activeId: 'a',
      activationOrder: ['a', 'c', 'b']
    })

    expect(snapshot.activeId).toBe('a')
    expect(snapshot.warmIds).toEqual(['c', 'b'])
    expect(snapshot.coldIds).toEqual(['d', 'e'])
    expect(snapshot.byId).toEqual({
      a: 'active',
      b: 'warm',
      c: 'warm',
      d: 'cold',
      e: 'cold'
    })
  })

  it('promotes the activated tab and demotes the previous active tab', () => {
    const first = buildTabLifecycle({
      tabIds: ['a', 'b', 'c', 'd'],
      activeId: 'a',
      activationOrder: ['a']
    })
    const second = buildTabLifecycle({
      tabIds: ['a', 'b', 'c', 'd'],
      activeId: 'c',
      activationOrder: ['c', ...first.activationOrder]
    })

    expect(second.activeId).toBe('c')
    expect(second.activationOrder.slice(0, 3)).toEqual(['c', 'a', 'b'])
    expect(second.byId).toEqual({
      a: 'warm',
      b: 'warm',
      c: 'active',
      d: 'cold'
    })
  })

  it('falls back to a known tab and never emits unknown lifecycle entries', () => {
    const snapshot = buildTabLifecycle({
      tabIds: ['a', 'b'],
      activeId: 'missing',
      activationOrder: ['missing', 'b', 'a']
    })

    expect(snapshot.activeId).toBe('a')
    expect(snapshot.activationOrder).toEqual(['a', 'b'])
    expect(Object.keys(snapshot.byId)).toEqual(['a', 'b'])
    expect(snapshot.byId.missing).toBeUndefined()
  })

  it('handles empty tabs and an explicit zero-warm policy', () => {
    expect(buildTabLifecycle({ tabIds: [] })).toEqual({
      activeId: null,
      warmIds: [],
      coldIds: [],
      activationOrder: [],
      byId: {}
    })

    const snapshot = buildTabLifecycle({
      tabIds: ['a', 'b'],
      activeId: 'a',
      maxWarmTabs: 0
    })
    expect(snapshot.warmIds).toEqual([])
    expect(snapshot.coldIds).toEqual(['b'])
  })

  it('keeps all tabs cold when there is no active editor surface', () => {
    const snapshot = buildTabLifecycle({
      tabIds: ['a', 'b', 'c'],
      activeId: null,
      activationOrder: ['c', 'b', 'a']
    })

    expect(snapshot.activeId).toBeNull()
    expect(snapshot.warmIds).toEqual([])
    expect(snapshot.coldIds).toEqual(['a', 'b', 'c'])
    expect(snapshot.byId).toEqual({
      a: 'cold',
      b: 'cold',
      c: 'cold'
    })
  })

  it('does not mutate caller arrays and rejects invalid warm limits', () => {
    const tabIds = ['a', 'b']
    const activationOrder = ['b', 'a']
    buildTabLifecycle({ tabIds, activationOrder })
    expect(tabIds).toEqual(['a', 'b'])
    expect(activationOrder).toEqual(['b', 'a'])
    expect(DEFAULT_MAX_WARM_TABS).toBe(2)

    expect(() => buildTabLifecycle({ tabIds, maxWarmTabs: -1 })).toThrow()
    expect(() => buildTabLifecycle({ tabIds, maxWarmTabs: 1.5 })).toThrow()
  })
})
