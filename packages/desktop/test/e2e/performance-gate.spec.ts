import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance as hostPerformance } from 'node:perf_hooks'
import { createMarkdownFixture } from '../../../../perf/gate/fixtures'
import { mergePerformanceTraceReports } from '../../../../perf/gate/trace-input'
import { collectMemoryLeakCycleSamples } from './performanceMemory'
import {
  closeElectron,
  expectNoRendererErrors,
  launchElectron,
  placeCaretInEditor,
  sendIpcToRenderer,
  showSidebarPanel,
  waitForEditor,
  waitForMenuReady
} from './helpers'

type GateLevel = 'P0' | 'P1' | 'P2'
type GateUnit = 'ms' | 'count' | 'bytes' | 'ratio'
type GatePhase = 'startup' | 'document-open' | 'editor' | 'diagram' | 'search' | 'autosave' | 'memory'

const runGate = process.env.INKIVA_RUN_PERF_GATE === 'true'
const SAMPLE_COUNT = 20
const categoryNames = ['startup', 'editor', 'diagrams', 'memory'] as const

interface CaptureDirectory {
  directory: string
  cleanup: () => void
}

interface GateProbe {
  inputDurations: number[]
  maxEventLoopLag: number
  intervalId: number
  inputObserver?: PerformanceObserver
}

const createCaptureDirectory = (): CaptureDirectory => {
  const configured = process.env.INKIVA_PERF_REPORT_DIR?.trim()
  if (configured) {
    fs.mkdirSync(configured, { recursive: true })
    return { directory: configured, cleanup: () => {} }
  }

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-performance-gate-'))
  return {
    directory,
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true })
  }
}

const clearCategoryFiles = (directory: string): void => {
  for (const category of categoryNames) {
    fs.rmSync(path.join(directory, category + '.json'), { force: true })
  }
}

const clearCaptureFiles = (directory: string, level: GateLevel): void => {
  clearCategoryFiles(directory)
  fs.rmSync(path.join(directory, level + '.raw.json'), { force: true })
}

const readCaptureReports = (directory: string): unknown[] =>
  categoryNames.flatMap((category) => {
    const filePath = path.join(directory, category + '.json')
    return fs.existsSync(filePath)
      ? [JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown]
      : []
  })

const appendCapture = (directory: string, level: GateLevel): void => {
  const reports = readCaptureReports(directory)
  if (reports.length === 0) {
    throw new Error('performance gate capture produced no category reports')
  }

  const rawPath = path.join(directory, level + '.raw.json')
  if (fs.existsSync(rawPath)) {
    reports.unshift(JSON.parse(fs.readFileSync(rawPath, 'utf8')) as unknown)
  }
  const merged = mergePerformanceTraceReports(reports)
  fs.writeFileSync(rawPath, JSON.stringify(merged, null, 2) + '\\n', 'utf8')
}

const writeFixtureFile = (directory: string, name: string, markdown: string): string => {
  const filePath = path.join(directory, name + '.md')
  fs.writeFileSync(filePath, markdown, 'utf8')
  return filePath
}

const captureEnvironment = (directory: string): Record<string, string> => ({
  INKIVA_PERF_CAPTURE: 'true',
  INKIVA_PERF_REPORT_DIR: directory,
  INKIVA_PERF_SAMPLE_INTERVAL_MS: '250',
  INKIVA_PERF_OFFLINE: 'true',
  INKIVA_PERF_RUNNER_LABEL: 'reference-low-end'
})

const openCaptured = async(
  filePath: string,
  capture: CaptureDirectory,
  level: GateLevel,
  userDataDir?: string,
  waitForEditorTimeout = 120000
): Promise<{ app: ElectronApplication; page: Page }> => {
  clearCategoryFiles(capture.directory)
  const launched = await launchElectron([filePath], {
    suppressErrorDialog: true,
    waitForReady: false,
    waitForEditorTimeout,
    userDataDir,
    env: captureEnvironment(capture.directory)
  })
  return launched
}

const recordSample = async(
  page: Page,
  metric: string,
  unit: GateUnit,
  value: number,
  phase: GatePhase = 'editor'
): Promise<void> => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('cannot record invalid performance sample for ' + metric)
  }
  const recorded = await page.evaluate(
    ({ metricName, metricUnit, metricValue, metricPhase }) => {
      const bridge = window.__inkivaPerformanceGate
      if (!bridge) return false
      bridge.recordSample(metricName, metricUnit, metricValue, { phase: metricPhase })
      return true
    },
    {
      metricName: metric,
      metricUnit: unit,
      metricValue: value,
      metricPhase: phase
    }
  )
  if (!recorded) throw new Error('renderer performance gate bridge is unavailable')
}

const recordSamples = async(
  page: Page,
  metric: string,
  unit: GateUnit,
  value: number,
  count = SAMPLE_COUNT,
  phase: GatePhase = 'editor'
): Promise<void> => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('cannot record invalid performance sample for ' + metric)
  }
  const recorded = await page.evaluate(
    ({ metricName, metricUnit, metricValue, metricCount, metricPhase }) => {
      const bridge = window.__inkivaPerformanceGate
      if (!bridge) return false
      for (let index = 0; index < metricCount; index += 1) {
        bridge.recordSample(metricName, metricUnit, metricValue, { phase: metricPhase })
      }
      return true
    },
    {
      metricName: metric,
      metricUnit: unit,
      metricValue: value,
      metricCount: count,
      metricPhase: phase
    }
  )
  if (!recorded) throw new Error('renderer performance gate bridge is unavailable')
}

const waitForPaint = async(page: Page): Promise<void> => {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
  )
}

const measurePageAction = async(
  page: Page,
  action: () => Promise<void>
): Promise<number> => {
  const started = await page.evaluate(() => performance.now())
  await action()
  await waitForPaint(page)
  const ended = await page.evaluate(() => performance.now())
  return Math.max(0, ended - started)
}

const installGateProbe = async(page: Page): Promise<void> => {
  await page.evaluate(() => {
    const state = globalThis as typeof globalThis & { __inkiva_gate_probe__?: GateProbe }
    if (state.__inkiva_gate_probe__) return

    const inputDurations: number[] = []
    let inputObserver: PerformanceObserver | undefined
    try {
      inputObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (
            entry.entryType === 'event' &&
            ['beforeinput', 'compositionend', 'input', 'keydown', 'keyup', 'paste'].includes(entry.name) &&
            Number.isFinite(entry.duration) &&
            entry.duration >= 0
          ) {
            inputDurations.push(entry.duration)
          }
        }
      })
      inputObserver.observe({
        type: 'event',
        buffered: true,
        durationThreshold: 0
      } as PerformanceObserverInit)
    } catch {
      try {
        inputObserver?.disconnect()
      } catch {
        // The runtime gate remains valid; unsupported observer entries are
        // intentionally left missing so the official evaluator fails closed.
      }
      inputObserver = undefined
    }

    let expected = performance.now() + 16
    let maxEventLoopLag = 0
    const intervalId = window.setInterval(() => {
      const now = performance.now()
      maxEventLoopLag = Math.max(maxEventLoopLag, Math.max(0, now - expected))
      expected = now + 16
    }, 16)

    state.__inkiva_gate_probe__ = {
      inputDurations,
      maxEventLoopLag,
      intervalId,
      inputObserver
    }

    // Keep the mutable max value observable through the same object.
    const update = (): void => {
      const current = state.__inkiva_gate_probe__
      if (!current) return
      current.maxEventLoopLag = maxEventLoopLag
      window.requestAnimationFrame(update)
    }
    window.requestAnimationFrame(update)
  })
}

const readLatestInputDuration = async(page: Page): Promise<number | undefined> =>
  await page.evaluate(() => {
    const state = (globalThis as typeof globalThis & { __inkiva_gate_probe__?: GateProbe })
      .__inkiva_gate_probe__
    const value = state?.inputDurations[state.inputDurations.length - 1]
    return typeof value === 'number' ? value : undefined
  })

const readMaxEventLoopLag = async(page: Page): Promise<number> =>
  await page.evaluate(() => {
    const state = (globalThis as typeof globalThis & { __inkiva_gate_probe__?: GateProbe })
      .__inkiva_gate_probe__
    return state?.maxEventLoopLag ?? 0
  })

const measureScrollFps = async(page: Page): Promise<number> =>
  await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const editor = document.querySelector('.editor-component') as HTMLElement | null
        if (!editor) {
          resolve(0)
          return
        }
        editor.scrollTop = editor.scrollHeight
        editor.dispatchEvent(new Event('scroll'))
        const started = performance.now()
        let frames = 0
        const tick = (timestamp: number): void => {
          frames += 1
          if (timestamp - started >= 1_000) {
            resolve(Math.max(0, (frames - 1) * 1_000 / (timestamp - started)))
            return
          }
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
  )

const runColdRegularSample = async(
  filePath: string,
  capture: CaptureDirectory,
  iteration: number
): Promise<void> => {
  const startedAt = hostPerformance.now()
  let launched: { app: ElectronApplication; page: Page } | undefined
  try {
    launched = await openCaptured(filePath, capture, 'P0')
    const { app, page } = launched
    await installGateProbe(page)

    await recordSample(page, 'startup.cold.window', 'ms', hostPerformance.now() - startedAt, 'startup')
    await page.waitForSelector('.editor-container', { state: 'visible', timeout: 120000 })
    await recordSample(page, 'startup.cold.shell', 'ms', hostPerformance.now() - startedAt, 'startup')

    await waitForMenuReady(app)
    await recordSample(page, 'startup.cold.actionable', 'ms', hostPerformance.now() - startedAt, 'startup')

    await page.waitForSelector('.editor-component', { state: 'visible', timeout: 120000 })
    await recordSample(
      page,
      'document.regular.firstScreen',
      'ms',
      hostPerformance.now() - startedAt,
      'document-open'
    )
    await waitForEditor(page, 120000)
    const editableMs = hostPerformance.now() - startedAt
    await recordSample(page, 'startup.cold.editable', 'ms', editableMs, 'startup')
    await recordSample(page, 'document.regular.editable', 'ms', editableMs, 'document-open')
    await recordSample(
      page,
      'startup.cold.mainBlock',
      'ms',
      await readMaxEventLoopLag(page),
      'startup'
    )

    await placeCaretInEditor(page)
    const beforeInputCount = await page.evaluate(() => {
      const state = (globalThis as typeof globalThis & { __inkiva_gate_probe__?: GateProbe })
        .__inkiva_gate_probe__
      return state?.inputDurations.length ?? 0
    })
    await page.keyboard.insertText('gate-input-' + iteration)
    await page.waitForFunction(
      (count) => {
        const state = (globalThis as typeof globalThis & { __inkiva_gate_probe__?: GateProbe })
          .__inkiva_gate_probe__
        return (state?.inputDurations.length ?? 0) > count
      },
      beforeInputCount,
      { timeout: 5000 }
    )
    const observedInput = await readLatestInputDuration(page)
    if (observedInput === undefined) {
      throw new Error('Event Timing did not produce a real P0 input sample')
    }
    await recordSample(page, 'document.regular.input', 'ms', observedInput)
    await recordSample(page, 'core.input.latency', 'ms', observedInput)

    const searchDuration = await measurePageAction(page, async() => {
      await sendIpcToRenderer(app, 'mt::editor-edit-action', 'find')
      const input = page.locator('.search-bar .search input')
      await expect(input).toBeVisible({ timeout: 10000 })
      await input.fill('Section')
      await expect(page.locator('.search-bar .search-result')).not.toHaveText('0 / 0', {
        timeout: 30000
      })
      await page.keyboard.press('Escape')
      await expect(page.locator('.search-bar')).toBeHidden({ timeout: 10000 })
    })
    await recordSample(page, 'document.regular.searchFirst', 'ms', searchDuration, 'search')

    const outlineDuration = await measurePageAction(page, async() => {
      await showSidebarPanel(app, page, 'toc')
      await expect(page.locator('.side-bar-toc [data-testid="toc-node-label"]').first()).toBeVisible({
        timeout: 30000
      })
    })
    await recordSample(page, 'document.regular.outlineFirst', 'ms', outlineDuration, 'document-open')

    const headingDuration = await measurePageAction(page, async() => {
      const label = page.locator('.side-bar-toc [data-testid="toc-node-label"]').last()
      await expect(label).toBeVisible({ timeout: 10000 })
      await label.click()
    })
    await recordSample(page, 'core.ui.action', 'ms', headingDuration)
    await recordSample(page, 'document.regular.uiAction', 'ms', headingDuration)

    const scrollFps = await measureScrollFps(page)
    await recordSample(page, 'core.scroll.fps', 'count', scrollFps)
    await recordSample(page, 'document.regular.scrollFps', 'count', scrollFps)

    await placeCaretInEditor(page)
    const undoDuration = await measurePageAction(page, async() => {
      await sendIpcToRenderer(app, 'mt::editor-edit-action', 'undo')
    })
    await recordSample(page, 'document.regular.undo', 'ms', undoDuration)
    const redoDuration = await measurePageAction(page, async() => {
      await sendIpcToRenderer(app, 'mt::editor-edit-action', 'redo')
    })
    await recordSample(page, 'document.regular.redo', 'ms', redoDuration)

    const saveDuration = await measurePageAction(page, async() => {
      await sendIpcToRenderer(app, 'mt::editor-ask-file-save')
      await expect
        .poll(() => (fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''), {
          timeout: 30000
        })
        .toContain('gate-input-' + iteration)
    })
    await recordSample(page, 'document.regular.save', 'ms', saveDuration)
    await expectNoRendererErrors(app)
  } finally {
    if (launched) {
      await closeElectron(launched.app)
      appendCapture(capture.directory, 'P0')
    }
  }
}

const runHotStartupSample = async(
  filePath: string,
  profile: string,
  capture: CaptureDirectory
): Promise<void> => {
  const startedAt = hostPerformance.now()
  let launched: { app: ElectronApplication; page: Page } | undefined
  try {
    launched = await openCaptured(filePath, capture, 'P0', profile)
    const { app, page } = launched
    await recordSample(page, 'startup.hot.window', 'ms', hostPerformance.now() - startedAt, 'startup')
    await waitForMenuReady(app)
    await recordSample(page, 'startup.hot.actionable', 'ms', hostPerformance.now() - startedAt, 'startup')
    await waitForEditor(page, 120000)
    await expectNoRendererErrors(app)
  } finally {
    if (launched) {
      await closeElectron(launched.app)
      appendCapture(capture.directory, 'P0')
    }
  }
}

const runMemorySample = async(
  filePath: string,
  capture: CaptureDirectory
): Promise<void> => {
  let launched: { app: ElectronApplication; page: Page } | undefined
  try {
    launched = await openCaptured(filePath, capture, 'P0')
    await waitForEditor(launched.page, 120000)
    const cyclePath = path.join(path.dirname(filePath), 'memory-cycle.md')
    fs.writeFileSync(
      cyclePath,
      fs.readFileSync(filePath, 'utf8'),
      'utf8'
    )
    await collectMemoryLeakCycleSamples({
      app: launched.app,
      page: launched.page,
      firstPath: filePath,
      cyclePath,
      recordSample: (metric, unit, value) =>
        recordSample(launched!.page, metric, unit, value, 'memory')
    })
    await pageWait(launched.page, 18_000)
    await expectNoRendererErrors(launched.app)
  } finally {
    if (launched) {
      await closeElectron(launched.app)
      appendCapture(capture.directory, 'P0')
    }
  }
}

const pageWait = async(page: Page, durationMs: number): Promise<void> => {
  await page.waitForTimeout(durationMs)
}

test.describe('@perf-gate P0 Milk Gate', () => {
  test.skip(!runGate, 'Run with INKIVA_RUN_PERF_GATE=true')
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(1_200_000)

  test('collects 20 cold/hot startup and regular-document samples from real actions', async() => {
    const capture = createCaptureDirectory()
    const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-gate-p0-'))
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-gate-p0-profile-'))
    const fixture = createMarkdownFixture('regular')
    const filePath = writeFixtureFile(fixtureDirectory, fixture.id, fixture.markdown)

    try {
      clearCaptureFiles(capture.directory, 'P0')
      for (let iteration = 0; iteration < SAMPLE_COUNT; iteration += 1) {
        await runColdRegularSample(filePath, capture, iteration)
        await runHotStartupSample(filePath, profile, capture)
      }
      await runMemorySample(filePath, capture)

      const rawPath = path.join(capture.directory, 'P0.raw.json')
      expect(fs.existsSync(rawPath)).toBe(true)
      const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8')) as {
        traces?: Array<{ events?: Array<{ name?: string; metadata?: { metric?: string } }> }>
      }
      const metrics = new Set(
        raw.traces?.flatMap((trace) =>
          (trace.events ?? []).flatMap((event) =>
            event.name === 'metric_sample' && event.metadata?.metric
              ? [event.metadata.metric]
              : []
          )
        )
      )
      expect(metrics).toEqual(
        expect
          .arrayContaining([
            'startup.cold.window',
            'startup.hot.window',
            'document.regular.firstScreen',
            'document.regular.input',
            'document.regular.searchFirst',
            'document.regular.outlineFirst',
            'document.regular.save',
            'document.regular.undo',
            'document.regular.redo',
            'memory.heapLinearGrowth200'
          ])
      )
    } finally {
      capture.cleanup()
      fs.rmSync(fixtureDirectory, { recursive: true, force: true })
      fs.rmSync(profile, { recursive: true, force: true })
    }
  })
})
