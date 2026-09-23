import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  calculateStatistics,
  evaluatePerformanceGate,
  parsePerformanceGateConfig,
  REFERENCE_ENVIRONMENT,
  validateReferenceEnvironment,
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
  assert.equal(statistics.mean, 10.5)
  assert.ok(Math.abs(statistics.stddev - 5.766281297335398) < 1e-12)
  assert.ok(Math.abs(statistics.cv - 0.549169647365276) < 1e-12)
  assert.equal(statistics.count, 20)
})

test('statistics report zero CV for an all-zero metric', () => {
  const statistics = calculateStatistics(series(constantSamples(0), 'count'))
  assert.equal(statistics.mean, 0)
  assert.equal(statistics.stddev, 0)
  assert.equal(statistics.cv, 0)
})

test('the reference environment contract is explicit and rejects a developer machine', () => {
  assert.doesNotThrow(() => validateReferenceEnvironment(REFERENCE_ENVIRONMENT))
  assert.throws(() => validateReferenceEnvironment({ ...REFERENCE_ENVIRONMENT, os: 'macOS' }))
  assert.throws(() => validateReferenceEnvironment({ ...REFERENCE_ENVIRONMENT, network: 'online' }))
})

test('report provenance accepts exact fixture hashes and rejects malformed hashes', () => {
  const valid = report('P0', { input: series(constantSamples(1)) })
  valid.provenance = {
    commit: '0123456789abcdef',
    branch: 'develop',
    nodeVersion: 'v24.21.0',
    electronVersion: '42.1.0',
    graphicsBackend: 'default',
    runMode: 'reference-p0',
    warmState: 'mixed',
    runId: 'unit',
    fixtureHashes: { 'markdown-50k': 'a'.repeat(64) }
  }
  assert.doesNotThrow(() => evaluatePerformanceGate(valid, configFor([])))

  const invalid = {
    ...valid,
    provenance: {
      ...valid.provenance,
      fixtureHashes: { 'markdown-50k': 'not-a-sha256' }
    }
  }
  const result = evaluatePerformanceGate(invalid as PerformanceGateReport, configFor([]))
  assert.equal(result.passed, false)
  assert.equal(result.failures[0]?.code, 'invalid-report')
})

test('canonical thresholds validate and cover every release level', async() => {
  const raw = await readFile(new URL('./thresholds.json', import.meta.url), 'utf8')
  const config = parsePerformanceGateConfig(JSON.parse(raw))
  for (const level of ['P0', 'P1', 'P2', 'P3'] as const) {
    assert.ok(config.levels[level].gates.length > 0, level + ' must have hard gates')
  }
  assert.equal(config.minimumSamples, 20)
  assert.equal(config.levels.P2.degradation?.maxRelativeIncrease, 0.25)
})

test('every release level includes the 200-cycle memory leak gate', async() => {
  const raw = await readFile(new URL('./thresholds.json', import.meta.url), 'utf8')
  const config = parsePerformanceGateConfig(JSON.parse(raw))

  for (const level of ['P0', 'P1', 'P2', 'P3'] as const) {
    assert.ok(
      config.levels[level].gates.some((gate) => gate.metric === 'memory.heapLinearGrowth200'),
      level + ' must gate 200-cycle heap linear growth'
    )
  }
})

test('controlled slowdown experiment detects a known regression without false-positive control', () => {
  const config = configFor([
    {
      id: 'controlled-input-p95',
      metric: 'input',
      unit: 'ms',
      statistic: 'p95',
      operator: 'lt',
      limit: 20,
    },
  ])

  const control = evaluatePerformanceGate(
    report('P0', { input: series(constantSamples(10)) }),
    config,
  )
  const slowed = evaluatePerformanceGate(
    report('P0', { input: series(constantSamples(25)) }),
    config,
  )

  assert.equal(control.passed, true)
  assert.equal(control.failures.length, 0)
  assert.equal(slowed.passed, false)
  assert.equal(slowed.failures[0]?.code, 'threshold-failed')
  assert.equal(slowed.failures[0]?.metric, 'input')
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
