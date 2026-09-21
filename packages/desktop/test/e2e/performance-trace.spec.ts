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
    fs.mkdirSync(directory, { recursive: true })
    fs.rmSync(path.join(directory, 'startup.json'), { force: true })
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

test('@perf writes a correlated startup report when performance capture is enabled', async() => {
  const { directory, cleanup } = createReportDirectory()
  let launched: Awaited<ReturnType<typeof launchElectron>> | undefined
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-perf-trace-'))
  const fixturePath = path.join(fixtureDirectory, 'startup.md')
  fs.writeFileSync(fixturePath, ['# Startup trace', '', 'A document-backed shell.', ''].join('\n'), 'utf8')

  try {
    launched = await launchElectron([fixturePath], {
      env: {
        INKIVA_PERF_CAPTURE: 'true',
        INKIVA_PERF_REPORT_DIR: directory
      }
    })
    await expect(launched.page.locator('.editor-container')).toBeVisible()
    await expect
      .poll(
        () => launched!.page.locator('[data-editor-editable-at]').first().getAttribute('data-editor-editable-at'),
        { timeout: 10000 }
      )
      .not.toBeNull()
    // Renderer performance events are batched to keep instrumentation off the
    // editor hot path. Force that batch across IPC, then issue a main-process
    // invoke as an ordering barrier before closing the app. This verifies the
    // asynchronous transport contract without relying on an arbitrary sleep.
    await launched.page.evaluate(() => {
      const gate = (
        window as typeof window & {
          __inkivaPerformanceGate?: {
            recordSample(metric: string, unit: 'count', value: number): void
          }
        }
      ).__inkivaPerformanceGate
      if (!gate) throw new Error('performance gate bridge is unavailable')
      gate.recordSample('e2e.performance.flush-barrier', 'count', 0)
    })
    await launched.page.evaluate(() =>
      window.electron.ipcRenderer.invoke('mt::win::is-maximized')
    )
  } finally {
    if (launched) await closeElectron(launched.app)
    fs.rmSync(fixtureDirectory, { recursive: true, force: true })
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
        'app_shell_mounted',
        'document_editable'
      ])
    )
    expect(events.every((event) => typeof event.timestampEpochMs === 'number')).toBe(true)
    expect(events.every((event) => event.traceId.length > 0)).toBe(true)
  } finally {
    cleanup()
  }
})
