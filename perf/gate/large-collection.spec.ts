import assert from 'node:assert/strict'
import test from 'node:test'

import {
  LARGE_GATE_SAMPLE_COUNT,
  getLargeGateCollectionContract,
  parseLargeGateLevels
} from './large-collection.js'

test('large collection defaults to both release levels', () => {
  assert.deepEqual(parseLargeGateLevels(undefined), ['P1', 'P2'])
  assert.deepEqual(parseLargeGateLevels(' P2, P1, P2 '), ['P1', 'P2'])
  assert.deepEqual(parseLargeGateLevels('P3, P1, P3'), ['P1', 'P3'])
})

test('large collection rejects levels without a real large-scenario runner', () => {
  assert.throws(() => parseLargeGateLevels('P0'), /P1, P2, or P3/)
  assert.doesNotThrow(() => parseLargeGateLevels('P3'))
  assert.throws(() => parseLargeGateLevels('P1,unknown'), /unknown/)
})

test('large collection contract requires raw samples and a P0 baseline for P2', () => {
  assert.equal(LARGE_GATE_SAMPLE_COUNT, 20)
  assert.deepEqual(getLargeGateCollectionContract('P1'), {
    level: 'P1',
    rawFile: 'P1.raw.json',
    baselineFile: null,
    minimumSamples: 20
  })
  assert.deepEqual(getLargeGateCollectionContract('P2'), {
    level: 'P2',
    rawFile: 'P2.raw.json',
    baselineFile: 'P0.report.json',
    minimumSamples: 20
  })
  assert.deepEqual(getLargeGateCollectionContract('P3'), {
    level: 'P3',
    rawFile: 'P3.raw.json',
    baselineFile: null,
    minimumSamples: 20
  })
})

test('large release levels require real 200-cycle memory samples', async() => {
  const { getLargeGateScenario } = await import('./large-scenarios.js')

  for (const level of ['P1', 'P2', 'P3'] as const) {
    assert.ok(
      getLargeGateScenario(level).metrics.includes('memory.heapLinearGrowth200'),
      level + ' must collect 200-cycle heap leak samples'
    )
  }
})
