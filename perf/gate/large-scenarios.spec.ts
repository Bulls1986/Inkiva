import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { parsePerformanceGateConfig, type GateLevel } from './contract.js'
import {
  LARGE_GATE_SCENARIOS,
  RUNTIME_COLLECTED_METRICS,
  getLargeGateScenario
} from './large-scenarios.js'

const levels = ['P1', 'P2', 'P3'] as const

test('large-gate manifest declares the real fixture matrix', () => {
  assert.deepEqual(
    LARGE_GATE_SCENARIOS.map((scenario) => scenario.id),
    [
      'p1-documents',
      'p1-tree-tabs-search',
      'p2-documents-headings',
      'p2-tree-tabs-background',
      'p2-diagrams-images',
      'p2-combination',
      'p3-documents-headings',
      'p3-tree-tabs-background',
      'p3-diagrams-combination'
    ]
  )
  assert.deepEqual(getLargeGateScenario('P1').fixtures, [
    '50k-markdown',
    '100k-markdown',
    '1m-markdown',
    '10k-workspace',
    '8x50k-tabs'
  ])
  assert.deepEqual(getLargeGateScenario('P2').fixtures, [
    '500k-markdown',
    '5k-heading-storm',
    '10k-heading-storm',
    '1m-markdown',
    '50k-workspace',
    '8x50k-tabs',
    'diagram-image-document',
    '50k-workspace-combination'
  ])
  assert.deepEqual(getLargeGateScenario('P3').fixtures, [
    '1m-markdown',
    '5k-heading-storm',
    '10k-heading-storm',
    '100k-workspace',
    '8x100k-tabs',
    'diagram-image-document',
    '100k-workspace-combination'
  ])
})

test('large-gate manifest covers every non-runtime P1/P2/P3 threshold metric', async() => {
  const thresholds = JSON.parse(
    await readFile(new URL('./thresholds.json', import.meta.url), 'utf8')
  ) as unknown
  const config = parsePerformanceGateConfig(thresholds)
  const runtimeMetrics = new Set(RUNTIME_COLLECTED_METRICS)

  for (const level of levels) {
    const declaredMetrics = new Set(getLargeGateScenario(level).metrics)
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

test('manifest metrics are unique within each release level', () => {
  for (const level of levels satisfies readonly GateLevel[]) {
    const seen = new Set<string>()
    const scenarios = LARGE_GATE_SCENARIOS.filter((scenario) => scenario.level === level)
    for (const scenario of scenarios) {
      for (const metric of scenario.metrics) {
        assert.equal(seen.has(metric), false, level + ' duplicate scenario metric: ' + metric)
        seen.add(metric)
      }
    }
    assert.ok(seen.size > 0)
  }
})
