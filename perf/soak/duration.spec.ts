import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import {
  SOAK_DURATION_MS,
  SOAK_PR_SMOKE_DURATION_MS,
  SOAK_WORKFLOW_TIMEOUT_MINUTES,
  resolveSoakDurationMs
} from './duration'

test('the release soak duration is exactly eight hours', () => {
  assert.equal(SOAK_DURATION_MS, 8 * 60 * 60 * 1000)
  assert.equal(SOAK_WORKFLOW_TIMEOUT_MINUTES, 510)
})

test('the PR lane is the only explicitly short soak mode', () => {
  assert.equal(resolveSoakDurationMs({}), SOAK_DURATION_MS)
  assert.equal(
    resolveSoakDurationMs({ INKIVA_PERF_SOAK_MODE: 'pr-smoke' }),
    SOAK_PR_SMOKE_DURATION_MS
  )
  assert.equal(
    resolveSoakDurationMs({ INKIVA_PERF_SOAK_MODE: 'unexpected' }),
    SOAK_DURATION_MS
  )
})

test('the soak workflow keeps the full-run timeout and enables the real scenario', async() => {
  const workflow = await readFile(new URL('../../.github/workflows/perf-soak.yml', import.meta.url), 'utf8')
  assert.match(workflow, /timeout-minutes:\s*510/)
  assert.match(workflow, /INKIVA_RUN_PERF_SOAK:\s*['"]true['"]/)
  assert.match(workflow, /INKIVA_PERF_SOAK_MODE:/)
})
