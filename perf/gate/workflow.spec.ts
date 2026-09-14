import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('the release workflow contains blocking P1/P2 real collectors', async() => {
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
})
