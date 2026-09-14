import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  calculateStatistics,
  evaluatePerformanceGate,
  parsePerformanceGateConfig,
  type DegradationConfig,
  type GateDefinition,
  type GateLevel,
  type MetricSeries,
  type PerformanceGateConfig,
  type PerformanceGateEnvironment,
  type PerformanceGateReport,
  validatePerformanceGateConfig,
} from './contract.js'

const environment: PerformanceGateEnvironment = {
  os: 'Windows 11 64-bit',
  cpu: '4-core low-voltage x86',
  memory: '8 GB',
  disk: 'SATA SSD',
  gpu: 'integrated graphics',
  display: '1920x1080 @ 60Hz',
  power: 'Balanced',
  network: 'offline',
  runner: 'performance-gate-unit',
}

function report(
  level: GateLevel,
  metrics: Record<string, MetricSeries>,
): PerformanceGateReport {
  return {
    schemaVersion: 1,
    productVersion: '0.3.0',
    suite: 'contract',
    level,
    generatedAt: '2026-09-14T00:00:00.000Z',
    environment,
    metrics,
  }
}

function series(samples: number[], unit: MetricSeries['unit'] = 'ms'): MetricSeries {
  return { unit, samples }
}

function levelConfig(
  gates: GateDefinition[],
  degradation?: DegradationConfig,
): PerformanceGateConfig['levels'][GateLevel] {
  return degradation === undefined ? { gates } : { gates, degradation }
}

function configFor(
  gates: GateDefinition[],
  degradation?: DegradationConfig,
): PerformanceGateConfig {
  return {
    schemaVersion: 1,
    minimumSamples: 20,
    levels: {
      P0: levelConfig(gates),
      P1: levelConfig(gates),
      P2: levelConfig(gates, degradation),
      P3: levelConfig(gates),
    },
  }
}

function constantSamples(value: number, count = 20): number[] {
  return Array.from({ length: count }, () => value)
}

test('statistics use deterministic interpolated percentiles', () => {
  const statistics = calculateStatistics(series(Array.from({ length: 20 }, (_, index) => index + 1)))
  assert.equal(statistics.min, 1)
  assert.equal(statistics.p50, 10.5)
  assert.equal(statistics.p95, 19.05)
  assert.equal(statistics.p99, 19.81)
  assert.equal(statistics.max, 20)
  assert.equal(statistics.count, 20)
})

test('canonical thresholds validate and cover every release level', async () => {
  const raw = await readFile(new URL('./thresholds.json', import.meta.url), 'utf8')
  const config = parsePerformanceGateConfig(JSON.parse(raw))
  for (const level of ['P0', 'P1', 'P2', 'P3'] as const) {
    assert.ok(config.levels[level].gates.length > 0, level + ' must have hard gates')
  }
  assert.equal(config.minimumSamples, 20)
  assert.equal(config.levels.P2.degradation?.maxRelativeIncrease, 0.25)
})

test('a report passes when every absolute gate passes', () => {
  const config = configFor([
    {
      id: 'input-p95',
      metric: 'input',
      unit: 'ms',
      statistic: 'p95',
      operator: 'lt',
      limit: 8,
    },
  ])
  const result = evaluatePerformanceGate(
    report('P0', { input: series(constantSamples(1)) }),
    config,
  )
  assert.equal(result.passed, true)
  assert.deepEqual(result.failures, [])
})

test('missing required metrics fail closed', () => {
  const config = configFor([
    {
      id: 'input-p95',
      metric: 'input',
      unit: 'ms',
      statistic: 'p95',
      operator: 'lt',
      limit: 8,
    },
  ])
  const result = evaluatePerformanceGate(report('P0', {}), config)
  assert.equal(result.passed, false)
  assert.equal(result.failures[0]?.code, 'metric-missing')
})

test('fewer than twenty samples fail closed', () => {
  const config = configFor([
    {
      id: 'input-p95',
      metric: 'input',
      unit: 'ms',
      statistic: 'p95',
      operator: 'lt',
      limit: 8,
    },
  ])
  const result = evaluatePerformanceGate(
    report('P0', { input: series(constantSamples(1, 19)) }),
    config,
  )
  assert.equal(result.passed, false)
  assert.equal(result.failures[0]?.code, 'insufficient-samples')
})

test('a max spike fails even when P95 looks fast', () => {
  const config = configFor([
    {
      id: 'input-p95',
      metric: 'input',
      unit: 'ms',
      statistic: 'p95',
      operator: 'lt',
      limit: 8,
    },
    {
      id: 'input-max',
      metric: 'input',
      unit: 'ms',
      statistic: 'max',
      operator: 'lt',
      limit: 32,
    },
  ])
  const result = evaluatePerformanceGate(
    report('P0', { input: series([...constantSamples(1, 19), 100]) }),
    config,
  )
  assert.equal(result.passed, false)
  assert.equal(result.failures.some((failure) => failure.gateId === 'input-max'), true)
})

test('P2 degradation allows exactly twenty-five percent over the P0 baseline', () => {
  const degradation: DegradationConfig = {
    metrics: [{ metric: 'input', statistic: 'p95' }],
    maxRelativeIncrease: 0.25,
  }
  const config = configFor(
    [
      {
        id: 'input-p95',
        metric: 'input',
        unit: 'ms',
        statistic: 'p95',
        operator: 'lt',
        limit: 16,
      },
    ],
    degradation,
  )
  const result = evaluatePerformanceGate(
    report('P2', { input: series(constantSamples(10)) }),
    config,
    { baseline: report('P0', { input: series(constantSamples(8)) }) },
  )
  assert.equal(result.passed, true)
})

test('P2 degradation above twenty-five percent fails', () => {
  const degradation: DegradationConfig = {
    metrics: [{ metric: 'input', statistic: 'p95' }],
    maxRelativeIncrease: 0.25,
  }
  const config = configFor(
    [
      {
        id: 'input-p95',
        metric: 'input',
        unit: 'ms',
        statistic: 'p95',
        operator: 'lt',
        limit: 16,
      },
    ],
    degradation,
  )
  const result = evaluatePerformanceGate(
    report('P2', { input: series(constantSamples(11)) }),
    config,
    { baseline: report('P0', { input: series(constantSamples(8)) }) },
  )
  assert.equal(result.passed, false)
  assert.equal(result.failures.some((failure) => failure.code === 'degradation-failed'), true)
})

test('config with fewer than twenty minimum samples is rejected', () => {
  const config = configFor([
    {
      id: 'input-p95',
      metric: 'input',
      unit: 'ms',
      statistic: 'p95',
      operator: 'lt',
      limit: 8,
    },
  ])
  assert.throws(() => validatePerformanceGateConfig({ ...config, minimumSamples: 19 }))
})
