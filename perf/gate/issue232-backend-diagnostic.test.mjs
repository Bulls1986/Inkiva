import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('issue 232 B/A/B retains raw traces without changing the canonical gate', async () => {
  const workflow = await readFile(
    new URL('../../.github/workflows/performance-fast-gate.yml', import.meta.url),
    'utf8'
  )
  const [requiredJob, diagnosticJob] = workflow.split(/\r?\n {2}issue232-frame-ab:\r?\n/)
  assert.ok(diagnosticJob, 'an isolated, non-release graphics diagnosis job must exist')
  assert.match(requiredJob, /desktop-fast:/)
  assert.match(requiredJob, /xvfb-run --auto-servernum pnpm test:e2e:perf:fast/)
  assert.match(requiredJob, /--thresholds perf\/soak\/thresholds-fast\.json/)
  assert.match(diagnosticJob, /github\.head_ref == 'fix\/issue-232-perf-trace-identity'/)
  assert.match(diagnosticJob, /runs-on: ubuntu-24\.04/)
  assert.match(diagnosticJob, /for variant in opengl-1 default opengl-2/)
  assert.match(diagnosticJob, /INKIVA_PERF_GRAPHICS_BACKEND/)
  assert.match(diagnosticJob, /xvfb-run --auto-servernum pnpm test:e2e:perf:fast/)
  assert.ok(diagnosticJob.includes('cp "$INKIVA_PERF_REPORT_DIR/fast.raw.json" "perf-results/issue232-$variant/fast.raw.json"'))
  assert.match(diagnosticJob, /--input perf-results\/issue232-\$variant\/fast\.raw\.json/)
  assert.match(diagnosticJob, /--thresholds perf\/soak\/thresholds-fast\.json/)
  assert.match(diagnosticJob, /upload-artifact@/)
  assert.match(diagnosticJob, /if: always\(\)/)
  assert.doesNotMatch(diagnosticJob, /continue-on-error:/)
  assert.doesNotMatch(diagnosticJob, /--disable-gpu|--disable-background-timer-throttling|--no-sandbox/)
})