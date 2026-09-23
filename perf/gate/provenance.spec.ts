import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'

import { readBenchmarkProvenance } from './provenance.js'

test('benchmark provenance records injected CI identity and fixture hashes', () => {
  const provenance = readBenchmarkProvenance({
    repoRoot: resolve('.'),
    runMode: 'baseline-02',
    warmState: 'mixed',
    environment: {
      GITHUB_SHA: '0123456789abcdef',
      GITHUB_REF_NAME: 'perf/baseline-02',
      GITHUB_RUN_ID: '12345',
      INKIVA_PERF_GRAPHICS_BACKEND: 'opengl',
      INKIVA_PERF_ELECTRON_VERSION: '42.1.0'
    },
    fixtureHashes: {
      'markdown-50k': 'a'.repeat(64)
    }
  })

  assert.deepEqual(provenance, {
    commit: '0123456789abcdef',
    branch: 'perf/baseline-02',
    nodeVersion: process.version,
    electronVersion: '42.1.0',
    graphicsBackend: 'opengl',
    runMode: 'baseline-02',
    warmState: 'mixed',
    runId: '12345',
    fixtureHashes: {
      'markdown-50k': 'a'.repeat(64)
    }
  })
})

test('benchmark provenance falls back to local git identity without inventing CI values', () => {
  const provenance = readBenchmarkProvenance({
    repoRoot: resolve('.'),
    runMode: 'local-audit',
    warmState: 'cold',
    environment: {
      INKIVA_PERF_ELECTRON_VERSION: '42.1.0'
    }
  })

  assert.match(provenance.commit, /^[a-f0-9]{40}$/)
  assert.ok(provenance.branch.length > 0)
  assert.equal(provenance.runId, 'local')
  assert.equal(provenance.graphicsBackend, 'default')
})
