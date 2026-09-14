import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { PerformanceReport } from '@shared/types/performance'
import { closeElectron, launchElectron } from './helpers'

const isCi = process.env.CI === 'true'

const createReportDirectory = (): { directory: string; cleanup: () => void } => {
  if (isCi) {
    const directory = path.resolve(__dirname, '../../test-results/perf-results')
    fs.rmSync(directory, { recursive: true, force: true })
    return {
      directory,
      cleanup: () => {}
    }
  }

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-perf-results-'))
  return {
    directory,
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true })
  }
}

test('writes a correlated startup report when performance capture is enabled', async() => {
  const { directory, cleanup } = createReportDirectory()
  let launched: Awaited<ReturnType<typeof launchElectron>> | undefined

  try {
    launched = await launchElectron([], {
      env: {
        INKIVA_PERF_CAPTURE: 'true',
        INKIVA_PERF_REPORT_DIR: directory
      }
    })
    await expect(launched.page.locator('.editor-container')).toBeVisible()
  } finally {
    if (launched) await closeElectron(launched.app)
  }

  try {
    const reportPath = path.join(directory, 'startup.json')
    expect(fs.existsSync(reportPath)).toBe(true)

    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as PerformanceReport
    const events = report.traces.flatMap((trace) => trace.events)
    const eventNames = events.map((event) => event.name)

    expect(report.schemaVersion).toBe(1)
    expect(report.traces.length).toBeGreaterThan(0)
    expect(eventNames).toEqual(
      expect.arrayContaining([
        'process_entry',
        'electron_ready',
        'browser_window_created',
        'renderer_bootstrap_start',
        'app_shell_mounted'
      ])
    )
    expect(events.every((event) => typeof event.timestampEpochMs === 'number')).toBe(true)
    expect(events.every((event) => event.traceId.length > 0)).toBe(true)
  } finally {
    cleanup()
  }
})
