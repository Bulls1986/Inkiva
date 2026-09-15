import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('the release workflow contains blocking P1/P2 and opt-in P3 collectors', async() => {
  const workflow = await readFile(
    new URL('../../.github/workflows/performance-gate.yml', import.meta.url),
    'utf8'
  )

  assert.match(workflow, /reference-large:/)
  assert.match(workflow, /needs: reference-p0/)
  assert.match(workflow, /INKIVA_RUN_PERF_LARGE_GATE: 'true'/)
  assert.match(workflow, /INKIVA_PERF_GATE_LEVELS: P1,P2/)
  assert.match(workflow, /P1\.raw\.json/)
  assert.match(workflow, /P2\.raw\.json/)
  assert.match(workflow, /--level P1/)
  assert.match(workflow, /--level P2/)
  assert.match(workflow, /--baseline perf-results\/P0\.report\.json/)
  assert.match(workflow, /run_p3/)
  assert.match(workflow, /INKIVA_PERF_GATE_LEVELS: P3/)
  assert.match(workflow, /P3\.raw\.json/)
  assert.match(workflow, /--level P3/)
})

test('official reference jobs require the Windows 11 reference runner', async() => {
  const workflow = await readFile(
    new URL('../../.github/workflows/performance-gate.yml', import.meta.url),
    'utf8'
  )

  for (const job of ['reference-p0', 'reference-large', 'reference-p3']) {
    const block = workflow.match(new RegExp(`${job}:[\\s\\S]*?(?=\\n  [a-z0-9-]+:|$)`))?.[0]
    assert.ok(block, `${job} job is missing from the workflow`)
    assert.match(block, /runs-on: \[self-hosted, windows, x64, reference-low-end\]/)
    assert.doesNotMatch(block, /runs-on: windows-latest/)
    assert.match(block, /id: reference_environment/)
    assert.match(block, /steps\.reference_environment\.outcome == 'success'/)
  }
})
