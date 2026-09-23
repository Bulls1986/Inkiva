import assert from 'node:assert/strict'
import test from 'node:test'

import type { PerformanceGateReport } from './contract.js'
import { analyzeBenchmarkRepeatability } from './repeatability.js'

const makeReport = (runId: string, values: number[]): PerformanceGateReport => ({
  schemaVersion: 1,
  productVersion: '0.4.0',
  suite: 'baseline-02',
  level: 'P1',
  generatedAt: '2026-09-23T00:00:00.000Z',
  environment: {
    os: 'Windows 11 64-bit',
    cpu: 'reference cpu',
    memory: '8 GB',
    disk: 'SATA SSD',
    gpu: 'integrated graphics',
    display: '1920x1080 @ 60Hz',
    power: 'Balanced',
    network: 'offline',
    runner: 'reference-low-end'
  },
  provenance: {
    commit: 'a'.repeat(40),
    sourceCommit: 'a'.repeat(40),
    tree: 'b'.repeat(40),
    branch: 'develop',
    nodeVersion: 'v24.21.0',
    electronVersion: '42.1.0',
    graphicsBackend: 'default',
    runMode: 'baseline-02',
    warmState: 'warm',
    runId,
    fixtureHashes: {
      'markdown-50k': 'b'.repeat(64)
    }
  },
  metrics: {
    input: { unit: 'ms', samples: values }
  }
})

test('repeatability analysis summarizes per-run percentiles and cross-run CV', () => {
  const first = makeReport('run-1', Array.from({ length: 20 }, () => 10))
  const second = makeReport('run-2', Array.from({ length: 20 }, () => 12))

  const result = analyzeBenchmarkRepeatability([first, second], ['input'])
  const input = result.metrics[0]

  assert.equal(result.runCount, 2)
  assert.equal(input?.unit, 'ms')
  assert.deepEqual(input?.p95.values, [10, 12])
  assert.equal(input?.p95.mean, 11)
  assert.equal(input?.p95.stddev, 1)
  assert.ok(Math.abs((input?.p95.cv ?? 0) - (1 / 11)) < 1e-12)
})

test('repeatability analysis rejects graphics-backend pooling', () => {
  const first = makeReport('run-1', Array.from({ length: 20 }, () => 10))
  const second = makeReport('run-2', Array.from({ length: 20 }, () => 10))
  second.provenance!.graphicsBackend = 'opengl'

  assert.throws(
    () => analyzeBenchmarkRepeatability([first, second], ['input']),
    /provenance\.graphicsBackend differs/
  )
})

test('repeatability analysis rejects changed fixtures', () => {
  const first = makeReport('run-1', Array.from({ length: 20 }, () => 10))
  const second = makeReport('run-2', Array.from({ length: 20 }, () => 10))
  second.provenance!.fixtureHashes!['markdown-50k'] = 'c'.repeat(64)

  assert.throws(
    () => analyzeBenchmarkRepeatability([first, second], ['input']),
    /fixtureHashes\.markdown-50k differs/
  )
})

test('repeatability analysis requires at least two runs and a declared metric', () => {
  const report = makeReport('run-1', Array.from({ length: 20 }, () => 10))
  assert.throws(() => analyzeBenchmarkRepeatability([report], ['input']), /at least two/)
  assert.throws(() => analyzeBenchmarkRepeatability([report, report], []), /at least one metric/)
})
