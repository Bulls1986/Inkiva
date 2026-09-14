import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { parsePerformanceGateConfig, type GateLevel } from './contract.js'
import {
  LARGE_GATE_SCENARIOS,
  RUNTIME_COLLECTED_METRICS,
  getLargeGateScenario
} from './large-scenarios.js'

const levels = ['P1', 'P2'] as const

test('large-gate manifest declares the real fixture matrix', () => {
  assert.deepEqual(
    LARGE_GATE_SCENARIOS.map((scenario) => scenario.id),
    [
      'p1-documents',
      'p1-tree-tabs-search',
      'p2-documents-headings',
      'p2-tree-tabs-background',
      'p2-diagrams-images',
      'p2-combination'
    ]
  )
  assert.deepEqual(getLargeGateScenario('P1').fixtures, [
    '50k-markdown',
    '100k-markdown',
    '10k-workspace',
    '8x50k-tabs'
  ])
  assert.deepEqual(getLargeGateScenario('P2').fixtures, [
    '500k-markdown',
    '5k-heading-storm',
    '10k-heading-storm',
    '50k-workspace',
    '8x50k-tabs',
    'diagram-image-document',
    '50k-workspace-combination'
  ])
})

test('large-gate manifest covers every non-runtime P1/P2 threshold metric', async() => {
  const thresholds = JSON.parse(
    await readFile(new URL('./thresholds.json', import.meta.url), 'utf8')
  ) as unknown
  const config = parsePerformanceGateConfig(thresholds)
  const runtimeMetrics = new Set(RUNTIME_COLLECTED_METRICS)
  const declaredMetrics = new Set(
    LARGE_GATE_SCENARIOS.flatMap((scenario) => scenario.metrics)
  )

  for (const level of levels) {
    for (const gate of config.levels[level].gates) {
      if (runtimeMetrics.has(gate.metric)) continue
      assert.equal(
        declaredMetrics.has(gate.metric),
        true,
        level + ' metric is not assigned to a real scenario: ' + gate.metric
      )
    }
  }
})

test('manifest metrics are unique and assigned to the correct release levels', () => {
  const seen = new Set<string>()
  for (const scenario of LARGE_GATE_SCENARIOS) {
    for (const metric of scenario.metrics) {
      assert.equal(seen.has(metric), false, 'duplicate scenario metric: ' + metric)
      seen.add(metric)
      assert.equal(
        scenario.level === 'P1' || scenario.level === 'P2',
        true,
        'large scenario must belong to P1 or P2'
      )
    }
  }

  for (const level of levels satisfies readonly GateLevel[]) {
    assert.ok(getLargeGateScenario(level).metrics.length > 0)
  }
})
