import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  SOAK_SCHEMA_VERSION,
  compareSoakReports,
  validateSoakReport,
  validateThresholdConfig,
  type SoakReport
} from './compare'

const reportSchema = JSON.parse(
  readFileSync(new URL('./schema.json', import.meta.url), 'utf8')
) as Record<string, unknown>
const thresholdsDocument = JSON.parse(
  readFileSync(new URL('./thresholds.json', import.meta.url), 'utf8')
) as unknown
const thresholds = validateThresholdConfig(thresholdsDocument)

const report = (value: number, name = 'desktop.perf-04.large.open'): SoakReport => ({
  schemaVersion: SOAK_SCHEMA_VERSION,
  suite: 'desktop',
  generatedAt: '2026-09-14T00:00:00.000Z',
  commit: 'commit-test',
  metrics: [{ name, unit: 'ms', value }]
})

test('keeps the machine-readable schema and blocking policy auditable', () => {
  assert.equal(reportSchema.type, 'object')
  assert.deepEqual(reportSchema.required, ['schemaVersion', 'suite', 'generatedAt', 'metrics'])
  const properties = reportSchema.properties as Record<string, Record<string, unknown>>
  assert.equal(properties.schemaVersion.const, SOAK_SCHEMA_VERSION)
  assert.equal((properties.metrics.items as Record<string, unknown>).additionalProperties, false)
  assert.equal(thresholds.maxRelativeRegression, 0.1)
  assert.equal(thresholds.regressionPolicy, 'blocking')
  assert.deepEqual(thresholds.absoluteGates, [])
})

test('rejects malformed reports instead of silently comparing them', () => {
  assert.throws(
    () =>
      validateSoakReport({ ...report(10), metrics: [{ name: 'x', unit: 'seconds', value: 10 }] }),
    /invalid unit/
  )
  assert.throws(() => validateSoakReport({ ...report(10), extra: true }), /unknown field/)
  assert.throws(
    () => validateThresholdConfig({ ...thresholds, absoluteGates: ['max-ms'] }),
    /absoluteGates/
  )
})

test('blocks only when regression is strictly greater than ten percent', () => {
  const atBoundary = compareSoakReports(report(110), report(100), thresholds)
  assert.equal(atBoundary.status, 'compared')
  assert.equal(atBoundary.failures.length, 0)

  const overBoundary = compareSoakReports(report(110.01), report(100), thresholds)
  assert.equal(atBoundary.passed, true)
  assert.equal(overBoundary.passed, false)
  assert.equal(overBoundary.failures.length, 1)
  assert.equal(overBoundary.failures[0]?.name, 'desktop.perf-04.large.open')
  assert.ok((overBoundary.failures[0]?.relativeChange ?? 0) > thresholds.maxRelativeRegression)
})

test('turns a large numeric regression into a hard-gate failure', () => {
  const comparison = compareSoakReports(report(10_000), report(100), thresholds)
  assert.equal(comparison.status, 'compared')
  assert.equal(comparison.passed, false)
  assert.equal(comparison.failures.length, 1)
  assert.equal(comparison.threshold, 0.1)
})

test('fails closed when the baseline is unavailable', () => {
  const comparison = compareSoakReports(report(100), undefined, thresholds)
  assert.equal(comparison.status, 'baseline-unavailable')
  assert.equal(comparison.passed, false)
  assert.equal(comparison.failures.length, 0)
  assert.deepEqual(comparison.skippedMetrics, [
    { name: 'desktop.perf-04.large.open', reason: 'baseline-missing' }
  ])
})

test('fails closed when no metrics can be compared', () => {
  const current = report(100, 'desktop.current')
  const baseline = report(100, 'desktop.baseline')
  const comparison = compareSoakReports(current, baseline, thresholds)
  assert.equal(comparison.status, 'no-comparable-metrics')
  assert.equal(comparison.passed, false)
})

test('rejects warning-only threshold policy', () => {
  assert.throws(
    () => validateThresholdConfig({ ...thresholds, regressionPolicy: 'warning-only' }),
    /blocking/
  )
})
