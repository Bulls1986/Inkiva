import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('the release workflow shards blocking P1/P2 gates and keeps opt-in P3', async () => {
  const workflow = await readFile(
    new URL('../../.github/workflows/performance-gate.yml', import.meta.url),
    'utf8'
  )

  assert.match(workflow, /reference-large-shards:/)
  assert.match(workflow, /fail-fast: false/)
  assert.match(workflow, /level: P1, shard: doc-50k/)
  assert.match(workflow, /level: P1, shard: memory-leak/)
  assert.match(workflow, /level: P2, shard: headings/)
  assert.match(workflow, /level: P2, shard: combination/)
  assert.match(workflow, /INKIVA_PERF_GATE_LEVELS: \$\{\{ matrix\.level \}\}/)
  assert.match(workflow, /INKIVA_PERF_GATE_SHARD: \$\{\{ matrix\.shard \}\}/)
  assert.match(workflow, /perf-large-\$\{\{ matrix\.level \}\}-\$\{\{ matrix\.shard \}\}/)

  // Preserve the existing required-check identity while moving collection into
  // parallel matrix jobs. The finalizer remains fail-closed on missing shards,
  // merged raw coverage, and threshold evaluation.
  assert.match(workflow, /reference-large:/)
  assert.match(workflow, /name: Reference Windows P1\/P2 Large Gates/)
  assert.match(workflow, /needs: \[reference-p0, reference-large-shards\]/)
  assert.match(workflow, /reference-large:[\s\S]*?if: always\(\)/)
  assert.match(workflow, /mergePerformanceGateShards\.ts.*--level P1/)
  assert.match(workflow, /mergePerformanceGateShards\.ts.*--level P2/)
  assert.match(workflow, /P1\.raw\.json/)
  assert.match(workflow, /P2\.raw\.json/)
  assert.match(workflow, /--baseline perf-results\/P0\.report\.json/)

  assert.match(workflow, /run_p3/)
  assert.match(workflow, /INKIVA_PERF_GATE_LEVELS: P3/)
  assert.match(workflow, /P3\.raw\.json/)
  assert.match(workflow, /--level P3/)
})
