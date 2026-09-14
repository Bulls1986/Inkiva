import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { mergePerformanceTraceReports } from '../../../../perf/gate/trace-input'
import { closeElectron, launchWithMarkdown } from './helpers'

const runGate = process.env.INKIVA_RUN_PERF_GATE === 'true'
const categoryNames = ['startup', 'editor', 'diagrams', 'memory'] as const

const reportDirectory = (): { directory: string; cleanup: () => void } => {
  if (process.env.INKIVA_PERF_REPORT_DIR?.trim()) {
    const directory = process.env.INKIVA_PERF_REPORT_DIR
    fs.mkdirSync(directory, { recursive: true })
    return { directory, cleanup: () => {} }
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-performance-gate-'))
  return {
    directory,
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true })
  }
}

const readCapturedReports = (directory: string): unknown[] =>
  categoryNames.flatMap((category) => {
    const filePath = path.join(directory, category + '.json')
    return fs.existsSync(filePath)
      ? [JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown]
      : []
  })

test.describe('@perf-gate renderer bridge contract', () => {
  test.skip(!runGate, 'Run with INKIVA_RUN_PERF_GATE=true')
  test.describe.configure({ mode: 'serial' })

  test('records a measured sample into the raw trace artifact', async() => {
    const capture = reportDirectory()
    const launched = await launchWithMarkdown('# Gate bridge\n', {
      env: {
        INKIVA_PERF_CAPTURE: 'true',
        INKIVA_PERF_REPORT_DIR: capture.directory,
        INKIVA_PERF_SAMPLE_INTERVAL_MS: '250'
      }
    })

    try {
      await expect
        .poll(() =>
          launched.page.evaluate(() =>
            typeof window.__inkivaPerformanceGate?.recordSample === 'function'
          )
        )
        .toBe(true)

      await launched.page.evaluate(() => {
        window.__inkivaPerformanceGate?.recordSample('core.ui.action', 'ms', 1, {
          phase: 'editor'
        })
      })
    } finally {
      await closeElectron(launched.app)
    }

    try {
      const captured = readCapturedReports(capture.directory)
      expect(captured.length).toBeGreaterThan(0)
      const merged = mergePerformanceTraceReports(captured)
      const values = merged.traces.flatMap((trace) =>
        trace.events.flatMap((event) => {
          const candidate = event as {
            name?: string
            metadata?: { metric?: string; value?: number }
          }
          return candidate.name === 'metric_sample' &&
            candidate.metadata?.metric === 'core.ui.action'
            ? [candidate.metadata.value]
            : []
        })
      )
      expect(values).toContain(1)
    } finally {
      capture.cleanup()
    }
  })
})
