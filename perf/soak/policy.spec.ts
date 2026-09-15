import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  compareSoakReports,
  validateThresholdConfig,
  type SoakReport
} from './compare'

const thresholds = validateThresholdConfig(JSON.parse(
  readFileSync(new URL('./thresholds.json', import.meta.url), 'utf8')
) as unknown)

const report = (metrics: SoakReport['metrics']): SoakReport => ({
  schemaVersion: 1,
  suite: 'desktop',
  generatedAt: '2026-09-14T00:00:00.000Z',
  commit: 'soak-test',
  metrics
})

test('stability and duration are absolute blocking soak gates', () => {
  assert.deepEqual(
    thresholds.absoluteGates.map((gate) => gate.name),
    [
      'soak.durationMs',
      'stability.crash',
      'stability.rendererCrash',
      'stability.oom',
      'memory.heapLinearGrowth',
      'stability.cpuRunaway',
      'stability.rendererHang'
    ]
  )

  const current = report([
    { name: 'soak.durationMs', unit: 'ms', value: 28_800_000 },
    { name: 'stability.crash', unit: 'count', value: 0 },
    { name: 'stability.rendererCrash', unit: 'count', value: 0 },
    { name: 'stability.oom', unit: 'count', value: 0 },
    { name: 'memory.heapLinearGrowth', unit: 'count', value: 0 },
    { name: 'stability.cpuRunaway', unit: 'count', value: 0 },
    { name: 'stability.rendererHang', unit: 'count', value: 0 }
  ])
  const baseline = report([
    { name: 'soak.durationMs', unit: 'ms', value: 28_800_000 },
    { name: 'stability.crash', unit: 'count', value: 0 },
    { name: 'stability.rendererCrash', unit: 'count', value: 0 },
    { name: 'stability.oom', unit: 'count', value: 0 },
    { name: 'memory.heapLinearGrowth', unit: 'count', value: 0 },
    { name: 'stability.cpuRunaway', unit: 'count', value: 0 },
    { name: 'stability.rendererHang', unit: 'count', value: 0 }
  ])
  const comparison = compareSoakReports(current, baseline, thresholds)
  assert.equal(comparison.absoluteFailures.length, 0)
  assert.equal(comparison.passed, true)
})

test('one stability incident blocks even when relative metrics are unchanged', () => {
  const current = report([
    { name: 'soak.durationMs', unit: 'ms', value: 28_800_000 },
    { name: 'stability.crash', unit: 'count', value: 1 },
    { name: 'stability.rendererCrash', unit: 'count', value: 0 },
    { name: 'stability.oom', unit: 'count', value: 0 },
    { name: 'memory.heapLinearGrowth', unit: 'count', value: 0 },
    { name: 'stability.cpuRunaway', unit: 'count', value: 0 },
    { name: 'stability.rendererHang', unit: 'count', value: 0 }
  ])
  const baseline = report(current.metrics)
  const comparison = compareSoakReports(current, baseline, thresholds)
  assert.equal(comparison.absoluteFailures.length, 1)
  assert.equal(comparison.absoluteFailures[0]?.name, 'stability.crash')
  assert.equal(comparison.passed, false)
})
