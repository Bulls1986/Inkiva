import assert from 'node:assert/strict'
import { test } from 'node:test'
import { evaluatePerformanceGateInput } from './evaluate.js'

const environment = {
  os: 'Windows 11 64-bit',
  cpu: '4-core low-voltage x86',
  memory: '8 GB',
  disk: 'SATA SSD',
  gpu: 'integrated',
  display: '1920x1080@60Hz',
  power: 'Balanced',
  network: 'offline',
  runner: 'reference-low-end'
}

const gate = {
  id: 'input-p95',
  metric: 'core.input.latency',
  unit: 'ms',
  statistic: 'p95',
  operator: 'lt',
  limit: 8
}

const config = {
  schemaVersion: 1,
  minimumSamples: 20,
  levels: {
    P0: { gates: [gate] },
    P1: { gates: [gate] },
    P2: { gates: [gate] },
    P3: { gates: [gate] }
  }
}

const report = (samples: number[]) => ({
  schemaVersion: 1,
  productVersion: '0.3.0',
  suite: 'desktop',
  level: 'P0',
  generatedAt: '2026-09-14T00:00:00.000Z',
  environment,
  metrics: {
    'core.input.latency': {
      unit: 'ms',
      samples
    }
  }
})

test('evaluates a complete raw report against every declared gate', () => {
  const result = evaluatePerformanceGateInput(report(Array.from({ length: 20 }, () => 4)), config)

  assert.equal(result.passed, true)
  assert.deepEqual(result.failures, [])
  assert.equal(result.observed['input-p95'], 4)
})

test('fails closed when a required metric is absent', () => {
  const incomplete = { ...report(Array.from({ length: 20 }, () => 4)), metrics: {} }
  const result = evaluatePerformanceGateInput(incomplete, config)

  assert.equal(result.passed, false)
  assert.equal(result.failures[0]?.code, 'metric-missing')
})

test('fails closed when the gate configuration is invalid', () => {
  const result = evaluatePerformanceGateInput(report(Array.from({ length: 20 }, () => 4)), {
    ...config,
    regressionPolicy: 'warning-only'
  })

  assert.equal(result.passed, false)
  assert.equal(result.failures[0]?.code, 'invalid-config')
})
