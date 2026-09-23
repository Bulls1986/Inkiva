import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { test } from 'node:test'
import os from 'node:os'
import path from 'node:path'

import {
  evaluateFastOffscreenImage,
  selectFastOffscreenImage,
  type FastOffscreenImageState
} from './fast-media'
import { FAST_GATE_REQUIRED_METRICS } from './fast-policy'
import {
  createFastPerformanceGateReport,
  evaluateFastPerformanceGate,
  runFastPerformanceGateCli
} from './fast-runner'

const environment = {
  os: 'linux',
  cpu: 'ci',
  memory: 'ci',
  disk: 'ci',
  gpu: 'ci',
  display: 'ci',
  power: 'ci',
  network: 'offline',
  runner: 'fast-pr-smoke'
}

const metricUnit = (metric: string): 'ms' | 'count' | 'ratio' => {
  if (metric === 'memory.heapLinearGrowth') return 'count'
  if (metric === 'memory.heapGrowth50') return 'ratio'
  if (
    metric.startsWith('stability.') ||
    metric === 'tabs.8.freeze' ||
    metric === 'document.50k.scrollFps' ||
    metric === 'diagram.firstScreenSyncRender' ||
    metric.startsWith('image.')
  ) {
    return 'count'
  }
  return 'ms'
}

const passingValue = (metric: string): number => {
  if (metric === 'document.50k.scrollFps') return 55
  if (
    metric.startsWith('stability.') ||
    metric.startsWith('image.') ||
    metric === 'diagram.firstScreenSyncRender' ||
    metric === 'tabs.8.freeze'
  ) {
    return 0
  }
  if (metric === 'memory.heapGrowth50') return 0.1
  if (metric === 'memory.heapLinearGrowth') return 0
  return 1
}

const report = (overrides: Record<string, number[]> = {}) => ({
  schemaVersion: 1,
  productVersion: '0.3.0',
  suite: 'desktop-fast-pr-smoke',
  level: 'P0',
  generatedAt: '2026-09-15T00:00:00.000Z',
  environment,
  metrics: Object.fromEntries(
    FAST_GATE_REQUIRED_METRICS.map((metric) => [
      metric,
      {
        unit: metricUnit(metric),
        samples: overrides[metric] ?? Array.from({ length: 20 }, () => passingValue(metric))
      }
    ])
  )
})

const rawReport = () => ({
  schemaVersion: 1,
  generatedAtEpochMs: 1,
  traces: [
    {
      schemaVersion: 1,
      traceId: 'fast-renderer',
      process: 'renderer',
      startedAtEpochMs: 0,
      timeOriginEpochMs: 0,
      events: FAST_GATE_REQUIRED_METRICS.flatMap((metric) =>
        Array.from({ length: 20 }, (_, index) => ({
          name: 'metric_sample',
          metadata: {
            metric,
            unit: metricUnit(metric),
            value: passingValue(metric)
          },
          timestampEpochMs: index
        }))
      )
    }
  ]
})

test('fast runner evaluates every required hard metric', () => {
  const result = evaluateFastPerformanceGate(report())

  assert.equal(result.passed, true)
  assert.deepEqual(result.failures, [])
})

test('50K scroll gate accepts 55 FPS and rejects 54 FPS', () => {
  const atCeiling = evaluateFastPerformanceGate(
    report({ 'document.50k.scrollFps': Array.from({ length: 20 }, () => 55) })
  )
  const belowCeiling = evaluateFastPerformanceGate(
    report({ 'document.50k.scrollFps': Array.from({ length: 20 }, () => 55).with(0, 54) })
  )

  assert.equal(atCeiling.passed, true)
  assert.equal(belowCeiling.passed, false)
  assert.equal(
    belowCeiling.failures.some(
      (failure) =>
        failure.code === 'threshold-failed' && failure.metric === 'document.50k.scrollFps'
    ),
    true
  )
})

test('fast runner converts real raw metric samples into a passing report', () => {
  const result = createFastPerformanceGateReport(rawReport(), {
    productVersion: '0.3.0',
    suite: 'desktop-fast-pr-smoke',
    level: 'P0',
    environment
  })

  assert.equal(result.metrics['save.50k']?.samples.length, 20)
  assert.equal(evaluateFastPerformanceGate(result).passed, true)
})

test('fast runner rejects malformed raw metric samples', () => {
  const input = rawReport() as unknown as { traces: Array<{ events: unknown[] }> }
  input.traces[0].events.push({
    name: 'metric_sample',
    metadata: { metric: 'unknown.metric', unit: 'invalid', value: 0 },
    timestampEpochMs: 21
  })

  assert.throws(
    () =>
      createFastPerformanceGateReport(input, {
        productVersion: '0.3.0',
        suite: 'desktop-fast-pr-smoke',
        level: 'P0',
        environment
      }),
    /metric_sample unit is invalid/
  )
})

test('fast runner CLI writes a report and rejects alternate thresholds', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'inkiva-fast-runner-'))
  const inputPath = path.join(directory, 'capture.json')
  const outputPath = path.join(directory, 'evaluation.json')
  const reportOutputPath = path.join(directory, 'report.json')
  const environment = {
    INKIVA_PERF_MODE: 'pr-smoke',
    INKIVA_PERF_RUNNER_LABEL: 'fast-pr-smoke',
    INKIVA_PERF_ELECTRON_VERSION: '42.1.0',
    GITHUB_SHA: '0123456789abcdef',
    GITHUB_REF_NAME: 'unit-test'
  }

  try {
    writeFileSync(inputPath, JSON.stringify(rawReport()), 'utf8')
    const result = runFastPerformanceGateCli(
      [
        '--input',
        inputPath,
        '--thresholds',
        path.resolve('perf/soak/thresholds-fast.json'),
        '--output',
        outputPath,
        '--report-output',
        reportOutputPath
      ],
      environment
    )

    assert.equal(result.passed, true)
    assert.equal(JSON.parse(readFileSync(outputPath, 'utf8')).passed, true)
    const diskReport = JSON.parse(readFileSync(reportOutputPath, 'utf8'))
    assert.equal(diskReport.level, 'P0')
    assert.equal(diskReport.productVersion, '0.4.0')
    assert.equal(typeof diskReport.provenance?.commit, 'string')
    assert.equal(diskReport.provenance?.runMode, 'pr-smoke')
    assert.equal(diskReport.provenance?.graphicsBackend, 'default')
    assert.throws(
      () =>
        runFastPerformanceGateCli(
          [
            '--input',
            inputPath,
            '--thresholds',
            path.resolve('perf/gate/thresholds.json'),
            '--output',
            outputPath,
            '--report-output',
            reportOutputPath
          ],
          environment
        ),
      /only thresholds-fast\.json may be used/
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('fast runner fails closed when a required metric is missing', () => {
  const incomplete = report()
  delete incomplete.metrics['save.50k']

  const result = evaluateFastPerformanceGate(incomplete)

  assert.equal(result.passed, false)
  assert.equal(
    result.failures.some(
      (failure) => failure.code === 'metric-missing' && failure.metric === 'save.50k'
    ),
    true
  )
})

test('fast runner keeps stability failures blocking', () => {
  const crashed = report({
    'stability.crash': Array.from({ length: 19 }, () => 0).concat(1)
  })

  const result = evaluateFastPerformanceGate(crashed)

  assert.equal(result.passed, false)
  assert.equal(
    result.failures.some(
      (failure) => failure.code === 'threshold-failed' && failure.metric === 'stability.crash'
    ),
    true
  )
})

test('fast media probe recognizes a pending wrapper before its img exists', () => {
  const state: FastOffscreenImageState = {
    top: 900,
    lazy: 'pending',
    loadStarted: null,
    hasImage: false,
    complete: false,
    naturalWidth: 0
  }

  assert.equal(selectFastOffscreenImage([state], 720), state)
  assert.deepEqual(evaluateFastOffscreenImage(state), { request: 0, decode: 0 })
})

test('fast media probe fails closed after an offscreen load starts or decodes', () => {
  const started: FastOffscreenImageState = {
    top: 900,
    lazy: 'pending',
    loadStarted: '123.4',
    hasImage: false,
    complete: false,
    naturalWidth: 0
  }
  const decoded: FastOffscreenImageState = {
    top: 900,
    lazy: null,
    loadStarted: '123.4',
    hasImage: true,
    complete: true,
    naturalWidth: 1
  }

  assert.deepEqual(evaluateFastOffscreenImage(started), { request: 1, decode: 0 })
  assert.deepEqual(evaluateFastOffscreenImage(decoded), { request: 1, decode: 1 })
})
