import assert from 'node:assert/strict'
import test from 'node:test'
import { mergePerformanceTraceReports } from './trace-input.js'

const trace = (events: unknown[]) => ({
  schemaVersion: 1,
  traceId: 'trace-1',
  process: 'renderer',
  startedAtEpochMs: 100,
  timeOriginEpochMs: 50,
  events
})

test('merges category reports by trace id without aggregating raw events', () => {
  const result = mergePerformanceTraceReports([
    {
      schemaVersion: 1,
      generatedAtEpochMs: 200,
      traces: [trace([{ name: 'metric_sample', metadata: { metric: 'a', unit: 'ms', value: 1 } }])]
    },
    {
      schemaVersion: 1,
      generatedAtEpochMs: 300,
      traces: [trace([{ name: 'metric_sample', metadata: { metric: 'a', unit: 'ms', value: 2 } }])]
    }
  ])

  assert.equal(result.generatedAtEpochMs, 300)
  assert.equal(result.traces.length, 1)
  assert.equal(result.traces[0]?.events.length, 2)
  assert.deepEqual(
    result.traces[0]?.events.map(event => (event as { metadata?: { value?: number } }).metadata?.value),
    [1, 2]
  )
})

test('retains independent traces and rejects an empty capture', () => {
  const first = trace([])
  const second = { ...trace([]), traceId: 'trace-2', process: 'main' }
  const result = mergePerformanceTraceReports([
    { schemaVersion: 1, generatedAtEpochMs: 100, traces: [first, second] }
  ])

  assert.deepEqual(result.traces.map(item => item.traceId), ['trace-1', 'trace-2'])
  assert.throws(() => mergePerformanceTraceReports([]), /at least one trace report/)
})

test('rejects malformed category reports instead of producing a partial gate input', () => {
  assert.throws(
    () => mergePerformanceTraceReports([{ schemaVersion: 1, generatedAtEpochMs: 1, traces: [] }]),
    /at least one trace/
  )
  assert.throws(
    () => mergePerformanceTraceReports([{ schemaVersion: 2, generatedAtEpochMs: 1, traces: [trace([])] }]),
    /schemaVersion/
  )
  assert.throws(
    () => mergePerformanceTraceReports([{ schemaVersion: 1, generatedAtEpochMs: 1, traces: [{ ...trace([]), events: {} }] }]),
    /events must be an array/
  )
})
