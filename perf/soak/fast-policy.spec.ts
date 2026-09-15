import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  FAST_GATE_REQUIRED_METRICS,
  FAST_GATE_MODE,
  FAST_GATE_DURATION_MS,
  FAST_GATE_WORKFLOW_TIMEOUT_MINUTES,
  resolveFastGateDurationMs,
  resolveFastGateMode
} from './fast-policy'

test('fast performance policy exposes exactly the bounded PR smoke mode', () => {
  assert.equal(FAST_GATE_MODE, 'pr-smoke')
  assert.equal(FAST_GATE_DURATION_MS, 10 * 60 * 1000)
  assert.equal(FAST_GATE_WORKFLOW_TIMEOUT_MINUTES, 15)
  assert.equal(resolveFastGateMode({ INKIVA_PERF_MODE: 'pr-smoke' }), 'pr-smoke')
  assert.equal(resolveFastGateDurationMs({ INKIVA_PERF_MODE: 'pr-smoke' }), FAST_GATE_DURATION_MS)
})

test('fast performance policy rejects missing and legacy long-run modes', () => {
  for (const environment of [
    {},
    { INKIVA_PERF_MODE: 'full' },
    { INKIVA_PERF_MODE: '8h' },
    { INKIVA_PERF_MODE: 'eight-hour' }
  ]) {
    assert.throws(
      () => resolveFastGateMode(environment),
      /only pr-smoke performance mode is supported/
    )
  }
})

test('fast policy requires every hard metric family', () => {
  assert.deepEqual(FAST_GATE_REQUIRED_METRICS, [
    'document.50k.firstScreen',
    'document.50k.editable',
    'core.input.latency',
    'document.50k.scrollFps',
    'diagram.placeholder',
    'diagram.firstScreenSyncRender',
    'image.offscreenRequest',
    'image.offscreenDecode',
    'search.folder.firstBatch',
    'save.50k',
    'memory.heapGrowth50',
    'memory.heapLinearGrowth',
    'stability.crash',
    'stability.rendererCrash',
    'stability.oom',
    'stability.cpuRunaway',
    'stability.rendererHang'
  ])
})

test('workflow is PR-only and invokes the fast hard gate', () => {
  const workflow = readFileSync(
    new URL('../../.github/workflows/performance-fast-gate.yml', import.meta.url),
    'utf8'
  )

  assert.match(workflow, /^name: Performance Fast Gate$/m)
  assert.match(workflow, /pull_request:/)
  assert.doesNotMatch(workflow, /^ {2}schedule:/m)
  assert.doesNotMatch(workflow, /^ {2}workflow_dispatch:/m)
  assert.doesNotMatch(workflow, /INKIVA_PERF_SOAK_MODE/)
  assert.doesNotMatch(
    workflow,
    /eight-hour|8-hour|8 hours|8h|full mode|full-run|timeout-minutes:\s*510/i
  )
  assert.match(workflow, /INKIVA_PERF_MODE:\s*['"]pr-smoke['"]/)
  assert.match(workflow, /timeout-minutes:\s*15/)
  assert.match(workflow, /test:e2e:perf:fast/)
  assert.match(workflow, /thresholds-fast\.json/)
  assert.doesNotMatch(workflow, /::warning::/)
})
