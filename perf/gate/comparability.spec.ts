import assert from 'node:assert/strict'
import test from 'node:test'

import type { PerformanceGateReport } from './contract.js'
import { compareBenchmarkReportsForPooling } from './comparability.js'

const makeReport = (): PerformanceGateReport => ({
  schemaVersion: 1,
  productVersion: '0.4.0',
  suite: 'baseline-02',
  level: 'P1',
  generatedAt: '2026-09-23T00:00:00.000Z',
  environment: {
    os: 'Windows 11 64-bit',
    cpu: 'reference cpu',
    memory: '8 GB',
    disk: 'SATA SSD',
    gpu: 'integrated graphics',
    display: '1920x1080 @ 60Hz',
    power: 'Balanced',
    network: 'offline',
    runner: 'reference-low-end'
  },
  provenance: {
    commit: 'a'.repeat(40),
    branch: 'develop',
    nodeVersion: 'v24.21.0',
    electronVersion: '42.1.0',
    graphicsBackend: 'default',
    runMode: 'baseline-02',
    warmState: 'warm',
    runId: 'run-1',
    fixtureHashes: {
      'markdown-50k': 'b'.repeat(64)
    }
  },
  metrics: {
    input: { unit: 'ms', samples: Array.from({ length: 20 }, () => 1) }
  }
})

test('identical benchmark contracts are comparable despite run and branch identity', () => {
  const left = makeReport()
  const right = makeReport()
  right.provenance!.runId = 'run-2'
  right.provenance!.branch = 'perf/repeatability'

  assert.deepEqual(compareBenchmarkReportsForPooling(left, right), {
    comparable: true,
    reasons: []
  })
})

test('default GPU and OpenGL reports are never pooled', () => {
  const left = makeReport()
  const right = makeReport()
  right.provenance!.graphicsBackend = 'opengl'

  const result = compareBenchmarkReportsForPooling(left, right)
  assert.equal(result.comparable, false)
  assert.deepEqual(result.reasons, ['provenance.graphicsBackend differs'])
})

test('fixture content identity is part of the comparability contract', () => {
  const left = makeReport()
  const right = makeReport()
  right.provenance!.fixtureHashes!['markdown-50k'] = 'c'.repeat(64)

  const result = compareBenchmarkReportsForPooling(left, right)
  assert.equal(result.comparable, false)
  assert.deepEqual(result.reasons, ['provenance.fixtureHashes.markdown-50k differs'])
})

test('missing provenance prevents authoritative pooling', () => {
  const left = makeReport()
  const right = makeReport()
  delete right.provenance

  const result = compareBenchmarkReportsForPooling(left, right)
  assert.equal(result.comparable, false)
  assert.deepEqual(result.reasons, ['provenance is missing'])
})

test('runtime, environment and warm-state differences are reported explicitly', () => {
  const left = makeReport()
  const right = makeReport()
  right.environment.power = 'High performance'
  right.provenance!.nodeVersion = 'v25.0.0'
  right.provenance!.warmState = 'cold'

  const result = compareBenchmarkReportsForPooling(left, right)
  assert.equal(result.comparable, false)
  assert.deepEqual(result.reasons, [
    'environment.power differs',
    'provenance.nodeVersion differs',
    'provenance.warmState differs'
  ])
})
