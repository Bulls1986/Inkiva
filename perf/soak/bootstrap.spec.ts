import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { SOAK_SCHEMA_VERSION, type SoakReport, validateSoakReport } from './compare'
import { bootstrapSoakBaseline } from './bootstrap'

const report = (metrics: SoakReport['metrics']): SoakReport => ({
  schemaVersion: SOAK_SCHEMA_VERSION,
  suite: 'desktop',
  generatedAt: '2026-09-14T00:00:00.000Z',
  commit: 'bootstrap-test',
  metrics
})

test('bootstraps a validated non-empty report only when the output is absent', () => {
  const directory = mkdtempSync(join(process.cwd(), 'perf-soak-bootstrap-'))
  const outputPath = join(directory, 'desktop.json')
  try {
    const current = report([{ name: 'desktop.core.input.latency', unit: 'ms', value: 4 }])
    const bootstrapped = bootstrapSoakBaseline(current, outputPath)
    assert.deepEqual(bootstrapped, current)
    assert.deepEqual(JSON.parse(readFileSync(outputPath, 'utf8')), current)
    assert.throws(
      () => bootstrapSoakBaseline(current, outputPath),
      /refusing to overwrite existing baseline/
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('rejects empty or malformed reports before writing a baseline', () => {
  const directory = mkdtempSync(join(process.cwd(), 'perf-soak-bootstrap-'))
  try {
    assert.throws(
      () => bootstrapSoakBaseline(report([]), join(directory, 'empty.json')),
      /at least one metric/
    )
    assert.throws(
      () => bootstrapSoakBaseline({ suite: 'desktop' }, join(directory, 'bad.json')),
      /performance report/
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('rejects a Muya baseline without the twenty-sample provenance', () => {
  const directory = mkdtempSync(join(process.cwd(), 'perf-soak-bootstrap-'))
  try {
    const muya = {
      ...report([{ name: 'muya.perf.set-content.10000', unit: 'ms', value: 42 }]),
      suite: 'muya' as const,
      environment: { runId: 'bootstrap-test' }
    }
    assert.throws(
      () => bootstrapSoakBaseline(muya, join(directory, 'muya.json')),
      /Muya baseline requires at least 20 samples/
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('keeps baseline identity and explicit bootstrap policy in the workflow', () => {
  const version = JSON.parse(
    readFileSync(new URL('./baseline-version.json', import.meta.url), 'utf8')
  ) as { version?: unknown }
  assert.equal(version.version, 2)

  const workflow = readFileSync(
    new URL('../../.github/workflows/perf-soak.yml', import.meta.url),
    'utf8'
  )
  assert.match(workflow, /bootstrap_baseline/)
  assert.match(workflow, /perf\/soak\/bootstrap\.ts/)
  assert.match(workflow, /hashFiles\([^\n]*baseline-version\.json/)
  assert.match(workflow, /perf\/soak\/baselines\/desktop\.json/)
  assert.match(workflow, /perf\/soak\/baselines\/muya\.json/)
  assert.match(workflow, /steps\.bootstrap\.outcome/)
  assert.match(workflow, /regressionPolicy.*blocking/)
})

test('checked-in baselines are real, non-empty reports with provenance', () => {
  for (const suite of ['desktop', 'muya'] as const) {
    const value = JSON.parse(
      readFileSync(new URL(`./baselines/${suite}.json`, import.meta.url), 'utf8')
    ) as unknown
    const baseline = validateSoakReport(value)

    assert.equal(baseline.suite, suite)
    assert.ok(baseline.metrics.length > 0)
    assert.ok(baseline.commit)
    assert.ok(baseline.environment?.runId)
    if (suite === 'muya') {
      assert.equal(baseline.environment?.sampleCount, '20')
    }
  }
})
