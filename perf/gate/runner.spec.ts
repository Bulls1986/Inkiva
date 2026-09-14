import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import type { PerformanceGateEnvironment } from './contract.js'
import {
  createPerformanceGateReport,
  PerformanceSampleCollector,
  readPerformanceGateReport,
  writePerformanceGateReport,
} from './runner.js'

const environment: PerformanceGateEnvironment = {
  os: 'Windows 11 64-bit',
  cpu: '4-core low-voltage x86',
  memory: '8 GB',
  disk: 'SATA SSD',
  gpu: 'integrated graphics',
  display: '1920x1080 @ 60Hz',
  power: 'Balanced',
  network: 'offline',
  runner: 'runner-unit',
}

const metadata = {
  productVersion: '0.3.0',
  suite: 'runner-contract',
  level: 'P0' as const,
  environment,
  generatedAt: '2026-09-14T00:00:00.000Z',
}

const twentySamples = (value: number): number[] => Array.from({ length: 20 }, () => value)

test('collector preserves raw samples and returns defensive copies', () => {
  const collector = new PerformanceSampleCollector()
  collector.addMany('input', 'ms', [3, 1, 2])
  assert.deepEqual(collector.toMetrics().input?.samples, [3, 1, 2])
  const snapshot = collector.toMetrics()
  snapshot.input?.samples.push(99)
  assert.equal(collector.sampleCount('input'), 3)
})

test('collector rejects invalid samples and unit changes', () => {
  const collector = new PerformanceSampleCollector()
  assert.throws(() => collector.add('input', 'ms', Number.NaN))
  assert.throws(() => collector.add('input', 'ms', -1))
  collector.add('input', 'ms', 1)
  assert.throws(() => collector.add('input', 'count', 1))
})

test('report creation is fail-closed when a metric has fewer than twenty samples', () => {
  const collector = new PerformanceSampleCollector()
  collector.addMany('input', 'ms', twentySamples(1).slice(0, 19))
  assert.throws(() => createPerformanceGateReport(collector, metadata))
})

test('report creation keeps all raw samples and round-trips through disk', () => {
  const collector = new PerformanceSampleCollector()
  collector.addMany('input', 'ms', twentySamples(3))
  collector.addMany('frames', 'ms', twentySamples(16))
  const report = createPerformanceGateReport(collector, metadata)
  assert.equal(report.metrics.input?.samples.length, 20)
  assert.deepEqual(report.metrics.input?.samples, twentySamples(3))

  const directory = mkdtempSync(join(tmpdir(), 'inkiva-performance-gate-'))
  const reportPath = join(directory, 'report.json')
  try {
    writePerformanceGateReport(reportPath, report)
    const diskReport = readPerformanceGateReport(reportPath)
    assert.deepEqual(diskReport, report)
    assert.equal(JSON.parse(readFileSync(reportPath, 'utf8')).metrics.input.samples.length, 20)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('collector exposes deterministic metric names and can be cleared', () => {
  const collector = new PerformanceSampleCollector()
  collector.addMany('zeta', 'count', twentySamples(0))
  collector.addMany('alpha', 'ratio', twentySamples(0.1))
  assert.deepEqual(collector.metricNames(), ['alpha', 'zeta'])
  collector.clear()
  assert.deepEqual(collector.metricNames(), [])
})
