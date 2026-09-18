import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getLargeGateShards,
  mergeLargeGateShardReports,
  parseLargeGateShard
} from './large-shards.js'

const metricEvent = (metric: string) => ({
  name: 'metric_sample',
  metadata: { metric, unit: 'ms', value: 1 }
})

const report = (metrics: string[], traceId: string) => ({
  schemaVersion: 1,
  generatedAtEpochMs: 1,
  traces: [
    {
      schemaVersion: 1,
      traceId,
      process: 'renderer',
      startedAtEpochMs: 1,
      timeOriginEpochMs: 1,
      events: metrics.flatMap((metric) => Array.from({ length: 20 }, () => metricEvent(metric)))
    }
  ]
})

test('declares independently runnable P1 and P2 shard plans', () => {
  assert.deepEqual(getLargeGateShards('P1'), [
    'doc-50k',
    'doc-100k',
    'doc-large',
    'tree',
    'tabs-open',
    'tabs-switch',
    'memory-footprint',
    'memory-leak'
  ])
  assert.equal(getLargeGateShards('P2').includes('diagrams'), true)
  assert.deepEqual(getLargeGateShards('P3'), [])
})

test('parses only shards valid for the selected gate level', () => {
  assert.equal(parseLargeGateShard('P1', 'tree'), 'tree')
  assert.equal(parseLargeGateShard('P1', undefined), null)
  assert.throws(() => parseLargeGateShard('P1', 'headings'), /shard is unknown/)
})

test('merged shard coverage remains fail-closed at twenty raw samples', async () => {
  const { getLargeGateScenario, RUNTIME_COLLECTED_METRICS } = await import('./large-scenarios.js')
  const required = [
    ...new Set([...getLargeGateScenario('P1').metrics, ...RUNTIME_COLLECTED_METRICS])
  ]
  const midpoint = Math.ceil(required.length / 2)
  const merged = mergeLargeGateShardReports(
    [report(required.slice(0, midpoint), 'shard-a'), report(required.slice(midpoint), 'shard-b')],
    'P1'
  )
  assert.equal(merged.traces.length, 2)

  assert.throws(
    () => mergeLargeGateShardReports([report(required.slice(1), 'incomplete')], 'P1'),
    /real collector did not produce 20 raw samples/
  )
})
