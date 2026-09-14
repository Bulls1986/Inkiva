import assert from 'node:assert/strict'
import test from 'node:test'

import { calculateHeapDelta } from './memory.js'

test('heap footprint delta is measured from the idle baseline without negative noise', () => {
  assert.equal(calculateHeapDelta(100, 125), 25)
  assert.equal(calculateHeapDelta(125, 100), 0)
})

test('heap footprint delta rejects invalid CDP values', () => {
  assert.throws(() => calculateHeapDelta(-1, 10))
  assert.throws(() => calculateHeapDelta(10, Number.NaN))
  assert.throws(() => calculateHeapDelta(Number.POSITIVE_INFINITY, 10))
})
