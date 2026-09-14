import { describe, expect, it } from 'vitest'

import { createDiagramHeightHintCache } from '../diagramHeightHint'

describe('diagram height hint cache', () => {
  it('keeps valid rendered heights, rejects invalid values, and bounds retained entries', () => {
    const cache = createDiagramHeightHintCache(2)

    cache.set('diagram-a', 640)
    cache.set('invalid-zero', 0)
    cache.set('invalid-negative', -1)
    cache.set('invalid-nan', Number.NaN)
    cache.set('invalid-infinity', Number.POSITIVE_INFINITY)

    expect(cache.get('diagram-a')).toBe(640)
    expect(cache.get('invalid-zero')).toBeUndefined()
    expect(cache.get('invalid-negative')).toBeUndefined()
    expect(cache.get('invalid-nan')).toBeUndefined()
    expect(cache.get('invalid-infinity')).toBeUndefined()

    cache.set('diagram-b', 320)
    cache.set('diagram-c', 480)

    expect(cache.get('diagram-a')).toBeUndefined()
    expect(cache.get('diagram-b')).toBe(320)
    expect(cache.get('diagram-c')).toBe(480)
  })
})
