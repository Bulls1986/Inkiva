import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  createPerformanceGateReportFromTrace,
  evaluatePerformanceGateInput,
  runPerformanceGateCli
} from './evaluate.js'

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

const metadata = {
  productVersion: '0.3.0',
  suite: 'desktop',
  level: 'P0' as const,
  environment
}

const trace = (samples: number[]) => ({
  schemaVersion: 1,
  traces: [{
    events: samples.map((value) => ({
      name: 'metric_sample',
      metadata: {
        metric: 'core.input.latency',
        unit: 'ms',
        value
      }
    }))
  }]
})

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

test('converts raw metric samples into a canonical report without aggregating them', () => {
  const canonical = createPerformanceGateReportFromTrace(
    trace(Array.from({ length: 20 }, () => 4)),
    metadata
  )

  assert.equal(canonical.level, 'P0')
  assert.deepEqual(canonical.metrics['core.input.latency'], {
    unit: 'ms',
    samples: Array.from({ length: 20 }, () => 4)
  })
})

test('CLI writes and evaluates a canonical report from a raw trace', () => {
  const directory = mkdtempSync(join(tmpdir(), 'inkiva-gate-cli-'))
  try {
    const inputPath = join(directory, 'trace.json')
    const metadataPath = join(directory, 'metadata.json')
    const thresholdsPath = join(directory, 'thresholds.json')
    const reportPath = join(directory, 'report.json')
    const evaluationPath = join(directory, 'evaluation.json')
    writeFileSync(inputPath, JSON.stringify(trace(Array.from({ length: 20 }, () => 4))))
    writeFileSync(metadataPath, JSON.stringify(metadata))
    writeFileSync(thresholdsPath, JSON.stringify(config))

    const result = runPerformanceGateCli([
      '--input', inputPath,
      '--metadata', metadataPath,
      '--thresholds', thresholdsPath,
      '--report-output', reportPath,
      '--output', evaluationPath
    ])

    assert.equal(result.passed, true)
    const writtenReport = JSON.parse(readFileSync(reportPath, 'utf8')) as typeof report
    assert.equal(writtenReport.metrics['core.input.latency']?.samples.length, 20)
    assert.equal(JSON.parse(readFileSync(evaluationPath, 'utf8')).passed, true)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('raw trace CLI input fails closed without explicit metadata', () => {
  const directory = mkdtempSync(join(tmpdir(), 'inkiva-gate-cli-metadata-'))
  try {
    const inputPath = join(directory, 'trace.json')
    const thresholdsPath = join(directory, 'thresholds.json')
    writeFileSync(inputPath, JSON.stringify(trace(Array.from({ length: 20 }, () => 4))))
    writeFileSync(thresholdsPath, JSON.stringify(config))

    assert.throws(
      () => runPerformanceGateCli([
        '--input', inputPath,
        '--thresholds', thresholdsPath,
        '--output', join(directory, 'evaluation.json')
      ]),
      /metadata/
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('fails closed when the gate configuration is invalid', () => {
  const result = evaluatePerformanceGateInput(report(Array.from({ length: 20 }, () => 4)), {
    ...config,
    regressionPolicy: 'warning-only'
  })

  assert.equal(result.passed, false)
  assert.equal(result.failures[0]?.code, 'invalid-config')
})
