import { expect, test } from '@playwright/test'
import type { ElectronApplication, Locator, Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance as hostPerformance } from 'node:perf_hooks'

import { createMarkdownFixture } from '../../../../perf/gate/fixtures'
import {
  measureEditorMilestones,
  type EditorMilestoneDurations,
  type EditorMilestoneTimestamps
} from '../../../../perf/gate/editorMilestones'
import { mergePerformanceTraceReports } from '../../../../perf/gate/trace-input'
import {
  evaluateFastOffscreenImage,
  selectFastOffscreenImage
} from '../../../../perf/soak/fast-media'
import { FAST_GATE_DURATION_MS, FAST_GATE_MODE } from '../../../../perf/soak/fast-policy'
import { collectMemoryLeakCycleSamples } from './performanceMemory'
import {
  closeElectron,
  expectNoRendererErrors,
  getRendererErrors,
  launchElectron,
  placeCaretInEditor,
  sendIpcFromRenderer,
  showSidebarPanel,
  waitForEditor,
  waitForWorkspaceReady
} from './helpers'

type GateUnit = 'ms' | 'count' | 'bytes' | 'ratio'
type GatePhase =
  | 'startup'
  | 'document-open'
  | 'editor'
  | 'diagram'
  | 'search'
  | 'save'
  | 'autosave'
  | 'memory'

const SAMPLE_COUNT = 20
const FAST_MEMORY_WINDOW_SIZE = SAMPLE_COUNT
const FAST_MEMORY_CYCLE_COUNT = FAST_MEMORY_WINDOW_SIZE + SAMPLE_COUNT - 1
const STABILITY_OBSERVATION_WINDOW_MS = 128
const runFastGate = process.env.INKIVA_RUN_PERF_FAST_GATE === 'true'
const categoryNames = ['startup', 'editor', 'diagrams', 'memory'] as const

interface CaptureDirectory {
  directory: string
  cleanup: () => void
}

interface FastFixtures {
  root: string
  documents: string[]
  searchDocuments: string[]
  diagram: string
  memoryFirst: string
  memoryCycle: string
}

interface FastGateProbe {
  inputDurations: number[]
  maxEventLoopLag: number
  longTaskObserver?: PerformanceObserver
  inputCleanup?: () => void
}

interface RendererActionMeasurement {
  startedAt?: number
  durationMs?: number
  error?: string
  cleanup?: () => void
}

const createCaptureDirectory = (): CaptureDirectory => {
  const configured = process.env.INKIVA_PERF_REPORT_DIR?.trim()
  if (configured) {
    fs.mkdirSync(configured, { recursive: true })
    return { directory: configured, cleanup: () => {} }
  }

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-performance-fast-'))
  return {
    directory,
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true })
  }
}

const clearCaptureFiles = (directory: string): void => {
  for (const category of categoryNames) {
    fs.rmSync(path.join(directory, category + '.json'), { force: true })
  }
  fs.rmSync(path.join(directory, 'fast.raw.json'), { force: true })
}

const readCaptureReports = (directory: string): unknown[] =>
  categoryNames.flatMap((category) => {
    const reportPath = path.join(directory, category + '.json')
    return fs.existsSync(reportPath)
      ? [JSON.parse(fs.readFileSync(reportPath, 'utf8')) as unknown]
      : []
  })

const appendCapture = (directory: string): void => {
  const reports = readCaptureReports(directory)
  if (reports.length === 0) {
    throw new Error('fast performance gate capture produced no category reports')
  }

  const rawPath = path.join(directory, 'fast.raw.json')
  if (fs.existsSync(rawPath)) {
    reports.unshift(JSON.parse(fs.readFileSync(rawPath, 'utf8')) as unknown)
  }
  const merged = mergePerformanceTraceReports(reports)
  fs.writeFileSync(rawPath, JSON.stringify(merged, null, 2) + '\n', 'utf8')
}

const captureEnvironment = (directory: string): Record<string, string> => ({
  INKIVA_PERF_CAPTURE: 'true',
  INKIVA_PERF_MODE: FAST_GATE_MODE,
  INKIVA_PERF_REPORT_DIR: directory,
  INKIVA_PERF_SAMPLE_INTERVAL_MS: '250',
  INKIVA_PERF_MAX_RENDERER_EVENTS: '50000',
  INKIVA_PERF_OFFLINE: 'true',
  INKIVA_PERF_RUNNER_LABEL: 'fast-pr-smoke'
})

const performanceGraphicsSwitches = (): string[] =>
  process.env.INKIVA_PERF_GRAPHICS_BACKEND === 'opengl' ? ['--use-angle=gl'] : []

const launchCaptured = async(
  args: string[],
  capture: CaptureDirectory,
  waitForEditorTimeout = 60_000
): Promise<{ app: ElectronApplication; page: Page }> => {
  for (const category of categoryNames) {
    fs.rmSync(path.join(capture.directory, category + '.json'), { force: true })
  }
  return await launchElectron(args, {
    suppressErrorDialog: true,
    waitForReady: false,
    waitForEditorTimeout,
    electronSwitches: performanceGraphicsSwitches(),
    env: captureEnvironment(capture.directory)
  })
}

const recordSample = async(
  page: Page,
  metric: string,
  unit: GateUnit,
  value: number,
  phase: GatePhase = 'editor'
): Promise<void> => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('invalid real performance sample for ' + metric)
  }
  const recorded = await page.evaluate(
    ({ metricName, metricUnit, metricValue, metricPhase }) => {
      const bridge = window.__inkivaPerformanceGate
      if (!bridge) return false
      bridge.recordSample(metricName, metricUnit, metricValue, {
        phase: metricPhase,
        metadata: { collector: 'fast-real-action' }
      })
      return true
    },
    { metricName: metric, metricUnit: unit, metricValue: value, metricPhase: phase }
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
  action: () => Promise<void>,
  settleAfterAction = true
): Promise<number> => {
  const startedAt = await page.evaluate(() => performance.now())
  await action()
  // This helper is only for probes without a renderer-owned completion
  // boundary. Save, folder search, and tab activation use renderer-side
  // timestamps below so controller polling and IPC scheduling are excluded.
  // Placeholder timing ends at attachment itself; adding two paint boundaries
  // there measures the probe instead of placeholder creation and can fail the
  // <50 ms gate on a nominal 60 Hz frame budget.
  if (settleAfterAction) await waitForPaint(page)
  const endedAt = await page.evaluate(() => performance.now())
  return Math.max(0, endedAt - startedAt)
}

const clearRendererActionMeasurement = async(page: Page): Promise<void> => {
  await page.evaluate(() => {
    const state = globalThis as typeof globalThis & {
      __inkiva_fast_gate_action__?: RendererActionMeasurement
    }
    state.__inkiva_fast_gate_action__?.cleanup?.()
    delete state.__inkiva_fast_gate_action__
  }).catch(() => {
    // Preserve the original action failure if the renderer closes.
  })
}

const waitForRendererActionMeasurement = async(page: Page, name: string): Promise<number> => {
  try {
    await page.waitForFunction(
      () => {
        const state = globalThis as typeof globalThis & {
          __inkiva_fast_gate_action__?: RendererActionMeasurement
        }
        const measurement = state.__inkiva_fast_gate_action__
        return (
          typeof measurement?.durationMs === 'number' || typeof measurement?.error === 'string'
        )
      },
      null,
      { timeout: 60_000 }
    )
    const result = await page.evaluate(() => {
      const state = globalThis as typeof globalThis & {
        __inkiva_fast_gate_action__?: RendererActionMeasurement
      }
      const measurement = state.__inkiva_fast_gate_action__
      return {
        durationMs: measurement?.durationMs,
        error: measurement?.error
      }
    })
    if (result.error) throw new Error(name + ' measurement failed: ' + result.error)
    if (typeof result.durationMs !== 'number') {
      throw new Error(name + ' measurement did not produce a duration')
    }
    return result.durationMs
  } finally {
    await clearRendererActionMeasurement(page)
  }
}

const measureFolderSearch = async(
  page: Page,
  searchInput: Locator,
  searchToken: string,
  expectedPath: string
): Promise<number> => {
  await page.evaluate((expectedResultPath) => {
    const state = globalThis as typeof globalThis & {
      __inkiva_fast_gate_action__?: RendererActionMeasurement
    }
    state.__inkiva_fast_gate_action__?.cleanup?.()

    const input = document.querySelector<HTMLInputElement>('.side-bar-search input.search-input')
    const searchRoot = document.querySelector<HTMLElement>('.side-bar-search')
    if (!input || !searchRoot) throw new Error('folder search input is not mounted')

    let observer: MutationObserver | undefined
    let timeoutId: number | undefined
    let settling = false
    const measurement: RendererActionMeasurement = {}
    const cleanup = (): void => {
      input.removeEventListener('input', onInput, true)
      observer?.disconnect()
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
    }
    measurement.cleanup = cleanup

    const normalizeResultPath = (value: string): string => {
      const normalized = value.replace(/\\/g, '/')
      return /^[a-z]:\//i.test(normalized) ? normalized.toLowerCase() : normalized
    }
    const normalizedExpectedPath = normalizeResultPath(expectedResultPath)
    const hasExpectedResult = (): boolean =>
      Array.from(searchRoot.querySelectorAll<HTMLElement>('.search-result[title]')).some((item) => {
        const title = item.getAttribute('title')
        return title !== null && normalizeResultPath(title) === normalizedExpectedPath
      })

    const complete = (): void => {
      const startedAt = measurement.startedAt
      if (settling || typeof startedAt !== 'number') return
      settling = true
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          measurement.durationMs = Math.max(0, performance.now() - startedAt)
          cleanup()
        })
      })
    }

    const onResultMutation = (): void => {
      if (hasExpectedResult()) complete()
    }

    const onInput = (): void => {
      if (measurement.startedAt !== undefined) return
      measurement.startedAt = performance.now()
      observer = new MutationObserver(onResultMutation)
      observer.observe(searchRoot, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['title']
      })
      timeoutId = window.setTimeout(() => {
        if (measurement.durationMs !== undefined) return
        const renderedPaths = Array.from(
          searchRoot.querySelectorAll<HTMLElement>('.search-result[title]')
        )
          .map((item) => item.getAttribute('title'))
          .filter((title): title is string => title !== null)
          .slice(0, 5)
        measurement.error =
          'expected folder result was not rendered; input=' +
          JSON.stringify(input.value) +
          '; renderedPaths=' +
          JSON.stringify(renderedPaths)
        cleanup()
      }, 10_000)
      onResultMutation()
    }

    input.addEventListener('input', onInput, true)
    state.__inkiva_fast_gate_action__ = measurement
  }, expectedPath)

  try {
    await searchInput.fill(searchToken)
    return await waitForRendererActionMeasurement(page, 'folder search')
  } catch (error) {
    await clearRendererActionMeasurement(page)
    throw error
  }
}

const measureManualSave = async(page: Page): Promise<number> => {
  await page.evaluate(() => {
    const state = globalThis as typeof globalThis & {
      __inkiva_fast_gate_action__?: RendererActionMeasurement
    }
    state.__inkiva_fast_gate_action__?.cleanup?.()

    const root = document.querySelector('#app') as
      | (Element & {
        __vue_app__?: { config?: { globalProperties?: Record<string, unknown> } }
      })
      | null
    const pinia = root?.__vue_app__?.config?.globalProperties?.$pinia as
      | {
        _s?: Map<
          string,
          {
            currentFile?: { id?: string } | null
            FILE_SAVE?: () => void
          }
        >
      }
      | undefined
    const editorStore = pinia?._s?.get('editor')
    const tabId = editorStore?.currentFile?.id
    if (!tabId || !editorStore?.FILE_SAVE) {
      throw new Error('active editor store is unavailable for manual save measurement')
    }

    let unsubscribeSaved: (() => void) | undefined
    let unsubscribeFailure: (() => void) | undefined
    let settling = false
    const measurement: RendererActionMeasurement = {}
    const cleanup = (): void => {
      unsubscribeSaved?.()
      unsubscribeFailure?.()
      unsubscribeSaved = undefined
      unsubscribeFailure = undefined
    }
    measurement.cleanup = cleanup

    const complete = (): void => {
      const startedAt = measurement.startedAt
      if (settling || typeof startedAt !== 'number') return
      settling = true
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          measurement.durationMs = Math.max(0, performance.now() - startedAt)
          cleanup()
        })
      })
    }

    unsubscribeSaved = window.electron.ipcRenderer.on('mt::tab-saved', (_, savedTabId) => {
      if (savedTabId === tabId) complete()
    })
    unsubscribeFailure = window.electron.ipcRenderer.on(
      'mt::tab-save-failure',
      (_, failedTabId, message) => {
        if (failedTabId !== tabId) return
        measurement.error = typeof message === 'string' ? message : 'save failed'
        cleanup()
      }
    )

    state.__inkiva_fast_gate_action__ = measurement
    measurement.startedAt = performance.now()
    try {
      editorStore.FILE_SAVE()
    } catch (error) {
      measurement.error = error instanceof Error ? error.message : String(error)
      cleanup()
    }
  })

  try {
    return await waitForRendererActionMeasurement(page, 'manual save')
  } catch (error) {
    await clearRendererActionMeasurement(page)
    throw error
  }
}

const measureTabClick = async(
  page: Page,
  target: Locator,
  waitForActive = false
): Promise<number> => {
  const tabId = await target.getAttribute('data-id')
  if (!tabId) throw new Error('tab click target is missing its data-id')

  await page.evaluate((id) => {
    const state = globalThis as typeof globalThis & {
      __inkiva_fast_gate_action__?: RendererActionMeasurement
    }
    state.__inkiva_fast_gate_action__?.cleanup?.()

    const tab = Array.from(document.querySelectorAll<HTMLElement>('.tabs-container > li')).find(
      (element) => element.getAttribute('data-id') === id
    )
    if (!tab) throw new Error('tab click target is no longer mounted')

    const wasActive = tab.classList.contains('active')
    let observer: MutationObserver | undefined
    let settling = false
    const measurement: RendererActionMeasurement = {}
    const cleanup = (): void => {
      tab.removeEventListener('pointerdown', onPointerDown, true)
      observer?.disconnect()
    }
    measurement.cleanup = cleanup

    const complete = (): void => {
      const startedAt = measurement.startedAt
      if (settling || typeof startedAt !== 'number') return
      settling = true
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          measurement.durationMs = Math.max(0, performance.now() - startedAt)
          cleanup()
        })
      })
    }

    const onTabMutation = (): void => {
      if (tab.classList.contains('active')) complete()
    }

    const onPointerDown = (): void => {
      if (measurement.startedAt !== undefined) return
      measurement.startedAt = performance.now()
      if (wasActive) {
        complete()
        return
      }
      observer = new MutationObserver(onTabMutation)
      observer.observe(tab, { attributes: true, attributeFilter: ['class'] })
      onTabMutation()
    }

    tab.addEventListener('pointerdown', onPointerDown, true)
    state.__inkiva_fast_gate_action__ = measurement
  }, tabId)

  try {
    await target.click({ force: true })
    const duration = await waitForRendererActionMeasurement(page, 'tab activation')
    if (waitForActive) await expect(target).toHaveClass(/active/)
    return duration
  } catch (error) {
    await clearRendererActionMeasurement(page)
    throw error
  }
}

const installFastGateProbe = async(page: Page): Promise<void> => {
  await page.evaluate(() => {
    const state = globalThis as typeof globalThis & {
      __inkiva_fast_gate_probe__?: FastGateProbe
    }
    if (state.__inkiva_fast_gate_probe__) return

    const inputDurations: number[] = []
    const probe: FastGateProbe = {
      inputDurations,
      maxEventLoopLag: 0
    }
    state.__inkiva_fast_gate_probe__ = probe

    try {
      const longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType !== 'longtask' || !Number.isFinite(entry.duration)) continue
          probe.maxEventLoopLag = Math.max(probe.maxEventLoopLag, Math.max(0, entry.duration))
        }
      })
      longTaskObserver.observe({ type: 'longtask', buffered: false } as PerformanceObserverInit)
      probe.longTaskObserver = longTaskObserver
    } catch {
      // Stability measurement is fail-closed when Long Tasks are unavailable.
      probe.maxEventLoopLag = Number.POSITIVE_INFINITY
    }
  })
}

const armFastGateInputProbe = async(page: Page): Promise<void> => {
  await page.evaluate(() => {
    const state = globalThis as typeof globalThis & {
      __inkiva_fast_gate_probe__?: FastGateProbe
    }
    const probe = state.__inkiva_fast_gate_probe__
    if (!probe) throw new Error('fast-gate probe is not installed')

    probe.inputCleanup?.()
    const eventTypes = ['beforeinput', 'compositionend', 'input', 'keydown', 'keyup', 'paste'] as const
    let settled = false
    const cleanup = (): void => {
      for (const type of eventTypes) document.removeEventListener(type, recordInputDelay, true)
      if (probe.inputCleanup === cleanup) probe.inputCleanup = undefined
    }
    const recordInputDelay = (event: Event): void => {
      if (settled) return
      // PerformanceEventTiming cannot expose events below its 16 ms minimum
      // duration threshold, while this gate explicitly requires input p95 <8 ms.
      // Event.timeStamp and performance.now() share Chromium's high-resolution
      // time origin, so this captures the same queueing interval represented by
      // PerformanceEventTiming.processingStart - startTime for every real event.
      const latency = performance.now() - event.timeStamp
      if (!Number.isFinite(latency) || latency < 0) return
      settled = true
      probe.inputDurations.push(latency)
      cleanup()
    }

    probe.inputCleanup = cleanup
    for (const type of eventTypes) document.addEventListener(type, recordInputDelay, true)
  })
}

const drainFastGateInputProbe = async(page: Page): Promise<number> =>
  await page.evaluate(() => {
    const state = globalThis as typeof globalThis & {
      __inkiva_fast_gate_probe__?: FastGateProbe
    }
    return state.__inkiva_fast_gate_probe__?.inputDurations.length ?? 0
  })

const readInputCount = async(page: Page): Promise<number> =>
  await page.evaluate(() => {
    const state = globalThis as typeof globalThis & {
      __inkiva_fast_gate_probe__?: FastGateProbe
    }
    return state.__inkiva_fast_gate_probe__?.inputDurations.length ?? 0
  })

const readLatestInputDuration = async(page: Page): Promise<number | undefined> =>
  await page.evaluate(() => {
    const state = globalThis as typeof globalThis & {
      __inkiva_fast_gate_probe__?: FastGateProbe
    }
    const values = state.__inkiva_fast_gate_probe__?.inputDurations ?? []
    const value = values[values.length - 1]
    return typeof value === 'number' ? value : undefined
  })

const readMaxEventLoopLag = async(page: Page): Promise<number> =>
  await page.evaluate(() => {
    const state = globalThis as typeof globalThis & {
      __inkiva_fast_gate_probe__?: FastGateProbe
    }
    return state.__inkiva_fast_gate_probe__?.maxEventLoopLag ?? 0
  })

const resetFastGateProbe = async(page: Page): Promise<void> => {
  await page.evaluate(() => {
    const state = globalThis as typeof globalThis & {
      __inkiva_fast_gate_probe__?: FastGateProbe
    }
    const probe = state.__inkiva_fast_gate_probe__
    if (!probe) return
    probe.maxEventLoopLag = probe.longTaskObserver ? 0 : Number.POSITIVE_INFINITY
  })
}

const measureInput = async(page: Page, iteration: number): Promise<number> => {
  await placeCaretInEditor(page)
  const beforeCount = await readInputCount(page)
  await armFastGateInputProbe(page)
  await page.keyboard.insertText('fast-gate-input-' + String(iteration))
  await expect
    .poll(() => drainFastGateInputProbe(page), { timeout: 5_000 })
    .toBeGreaterThan(beforeCount)
  const duration = await readLatestInputDuration(page)
  if (duration === undefined) {
    throw new Error('Event Timing did not produce a real fast-gate input sample')
  }
  return duration
}

const measureElementScrollFps = async(page: Page, selector: string): Promise<number> =>
  await page.evaluate(
    (targetSelector) =>
      new Promise<number>((resolve, reject) => {
        const element = document.querySelector(targetSelector) as HTMLElement | null
        if (!element) {
          reject(new Error('scroll target is missing: ' + targetSelector))
          return
        }
        const maximum = Math.max(0, element.scrollHeight - element.clientHeight)
        let startedAt: number | undefined
        let frames = 0
        const tick = (timestamp: number): void => {
          if (startedAt === undefined) startedAt = timestamp
          frames += 1
          element.scrollTop =
            maximum > 0
              ? (element.scrollTop + Math.max(1, maximum / 45)) % (maximum + 1)
              : element.scrollTop
          if (startedAt !== undefined && timestamp - startedAt >= 1_000) {
            // Chromium timestamps can put a nominal 60 Hz sample at 59.998.
            // Round only this sub-frame precision; a real missed frame remains <60.
            resolve(Math.max(0, Math.round(((frames - 1) * 1_000) / (timestamp - startedAt))))
            return
          }
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
    selector
  )

const readEditorMilestones = async(
  page: Page,
  minimumOpenStartAt = 0,
  timeout = 60_000
): Promise<{ timestamps: EditorMilestoneTimestamps; durations: EditorMilestoneDurations }> => {
  try {
    await page.waitForFunction(
      (minimum) => {
        return Array.from(document.querySelectorAll('.editor-component')).some((element) => {
          const openStartAt = Number(element.getAttribute('data-editor-open-start-at'))
          const firstScreenAt = Number(element.getAttribute('data-editor-first-screen-at'))
          const editableAt = Number(element.getAttribute('data-editor-editable-at'))
          return (
            Number.isFinite(openStartAt) &&
            Number.isFinite(firstScreenAt) &&
            Number.isFinite(editableAt) &&
            openStartAt >= minimum &&
            firstScreenAt >= openStartAt &&
            editableAt > firstScreenAt
          )
        })
      },
      minimumOpenStartAt,
      { timeout }
    )
  } catch (error) {
    let diagnostics = 'unavailable'
    try {
      diagnostics = JSON.stringify(
        await page.evaluate(() => ({
          editorCount: document.querySelectorAll('.editor-component').length,
          editorAttributes: Array.from(document.querySelectorAll('.editor-component')).map(
            (element) => ({
              className: element.className,
              openStartAt: element.getAttribute('data-editor-open-start-at'),
              firstScreenAt: element.getAttribute('data-editor-first-screen-at'),
              editableAt: element.getAttribute('data-editor-editable-at')
            })
          ),
          documentReadyState: document.readyState
        }))
      )
    } catch {
      // Preserve the original timeout when the renderer has already closed.
    }
    throw new Error(
      'editor milestones were not observed: ' +
        (error instanceof Error ? error.message : String(error)) +
        '; diagnostics=' +
        diagnostics
    )
  }

  const timestamps = (await page.evaluate(() => {
    const element = Array.from(document.querySelectorAll('.editor-component')).find((candidate) => {
      const openStartAt = Number(candidate.getAttribute('data-editor-open-start-at'))
      const firstScreenAt = Number(candidate.getAttribute('data-editor-first-screen-at'))
      const editableAt = Number(candidate.getAttribute('data-editor-editable-at'))
      return (
        Number.isFinite(openStartAt) &&
        Number.isFinite(firstScreenAt) &&
        Number.isFinite(editableAt) &&
        openStartAt >= 0 &&
        firstScreenAt >= openStartAt &&
        editableAt > firstScreenAt
      )
    })
    if (!element) throw new Error('editor component is missing for fast milestones')
    return {
      openStartAt: Number(element.getAttribute('data-editor-open-start-at')),
      firstScreenAt: Number(element.getAttribute('data-editor-first-screen-at')),
      editableAt: Number(element.getAttribute('data-editor-editable-at'))
    }
  })) as EditorMilestoneTimestamps

  return { timestamps, durations: measureEditorMilestones(timestamps) }
}

const waitForActiveFile = async(page: Page, filePath: string): Promise<void> => {
  await page.waitForFunction(
    (expectedPath) =>
      Array.from(document.querySelectorAll('.tabs-container > li')).some(
        (tab) => tab.getAttribute('title') === expectedPath && tab.classList.contains('active')
      ),
    filePath,
    { timeout: 60_000 }
  )
}

const activateFile = async(
  app: ElectronApplication,
  page: Page,
  filePath: string
): Promise<EditorMilestoneDurations> => {
  const startedAt = await page.evaluate(() => performance.now())
  await sendIpcFromRenderer(page, 'mt::open-file', filePath, {})
  await waitForActiveFile(page, filePath)
  const milestones = await readEditorMilestones(page, startedAt)
  // Keep every sample on the same renderer-owned measurement boundary.
  // startedAt is only a lower bound used to select the new editor instance;
  // the benchmark duration itself starts at the editor's openStartAt milestone.
  return measureEditorMilestones(milestones.timestamps)
}

const readStability = async(
  app: ElectronApplication,
  page: Page
): Promise<{
  crash: number
  rendererCrash: number
  oom: number
  cpuRunaway: number
  rendererHang: number
}> => {
  const errors = await getRendererErrors(app)
  const closed = page.isClosed() || app.process().killed
  const eventLoopLag = closed ? Number.POSITIVE_INFINITY : await readMaxEventLoopLag(page)
  const incident = errors.length > 0 || closed ? 1 : 0
  const hang = closed || eventLoopLag > 100 ? 1 : 0
  return {
    crash: incident,
    rendererCrash: incident,
    oom: closed ? 1 : 0,
    cpuRunaway: eventLoopLag > 100 ? 1 : 0,
    rendererHang: hang
  }
}

const recordStability = async(app: ElectronApplication, page: Page): Promise<void> => {
  // Exclude the just-measured action (for example, a 50k-document rebuild)
  // from the independent hang observation. The interval still fails closed
  // when the renderer cannot service this >100 ms observation window.
  await resetFastGateProbe(page)
  await page.waitForTimeout(STABILITY_OBSERVATION_WINDOW_MS)
  const values = await readStability(app, page)
  await recordSample(page, 'stability.crash', 'count', values.crash, 'memory')
  await recordSample(page, 'stability.rendererCrash', 'count', values.rendererCrash, 'memory')
  await recordSample(page, 'stability.oom', 'count', values.oom, 'memory')
  await recordSample(page, 'stability.cpuRunaway', 'count', values.cpuRunaway, 'memory')
  await recordSample(page, 'stability.rendererHang', 'count', values.rendererHang, 'memory')
}

const writeFixtures = (): FastFixtures => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-fast-gate-fixtures-'))
  const imageData =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
  fs.writeFileSync(path.join(root, 'fixture-image.png'), Buffer.from(imageData, 'base64'))

  const documentMarkdown = createMarkdownFixture('50k').markdown
  const documents = Array.from({ length: SAMPLE_COUNT }, (_, index) => {
    const filePath = path.join(root, 'fast-50k-' + String(index).padStart(2, '0') + '.md')
    fs.writeFileSync(filePath, documentMarkdown, 'utf8')
    return filePath
  })

  const searchDocuments = Array.from({ length: SAMPLE_COUNT }, (_, index) => {
    const filePath = path.join(root, 'search-target-' + String(index).padStart(2, '0') + '.md')
    fs.writeFileSync(
      filePath,
      '# Search target ' + index + '\n\nfast-folder-search-token-' + index + '\n',
      'utf8'
    )
    return filePath
  })

  const fence = String.fromCharCode(96).repeat(3)
  const diagramSections = Array.from({ length: SAMPLE_COUNT }, (_, index) =>
    [
      '## Diagram ' + index,
      '',
      'This section keeps the image below the initial viewport.',
      '',
      '![Image ' + index + '](fixture-image.png)',
      '',
      fence + 'mermaid',
      'flowchart LR',
      '  Start' + index + ' --> End' + index,
      fence,
      ''
    ].join('\n')
  ).join('\n')
  const diagram = path.join(root, 'diagram-image.md')
  fs.writeFileSync(diagram, '# Fast diagram and image gate\n\n' + diagramSections, 'utf8')

  const memoryFirst = path.join(root, 'memory-first.md')
  const memoryCycle = path.join(root, 'memory-cycle.md')
  const memoryMarkdown = createMarkdownFixture('regular').markdown
  fs.writeFileSync(memoryFirst, memoryMarkdown, 'utf8')
  fs.writeFileSync(memoryCycle, memoryMarkdown, 'utf8')

  return { root, documents, searchDocuments, diagram, memoryFirst, memoryCycle }
}

const assertWithinBudget = (startedAt: number): void => {
  const elapsed = hostPerformance.now() - startedAt
  if (elapsed > FAST_GATE_DURATION_MS) {
    throw new Error(
      'fast performance gate exceeded its ' + String(FAST_GATE_DURATION_MS) + ' ms budget'
    )
  }
}

const collectDocumentSamples = async(
  fixtures: FastFixtures,
  capture: CaptureDirectory,
  startedAt: number
): Promise<void> => {
  let app: ElectronApplication | undefined
  try {
    const launched = await launchCaptured([fixtures.root, fixtures.documents[0] as string], capture)
    app = launched.app
    const { page } = launched
    await installFastGateProbe(page)
    await waitForWorkspaceReady(page)
    await waitForEditor(page, 60_000)
    await resetFastGateProbe(page)

    for (let index = 0; index < fixtures.documents.length; index += 1) {
      const filePath = fixtures.documents[index] as string
      const milestones = index === 0 ? await readEditorMilestones(page) : undefined
      const durations = milestones?.durations ?? (await activateFile(app, page, filePath))
      await recordSample(
        page,
        'document.50k.firstScreen',
        'ms',
        durations.firstScreenMs,
        'document-open'
      )
      await recordSample(page, 'document.50k.editable', 'ms', durations.editableMs, 'document-open')

      const inputDuration = await measureInput(page, index)
      await recordSample(page, 'core.input.latency', 'ms', inputDuration, 'editor')

      const saveToken = 'fast-gate-input-' + String(index)
      const saveDuration = await measureManualSave(page)
      await expect
        .poll(() => (fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''), {
          timeout: 60_000
        })
        .toContain(saveToken)
      await recordSample(page, 'save.50k', 'ms', saveDuration, 'save')

      await showSidebarPanel(app, page, 'search')
      const searchInput = page.locator('.side-bar-search input.search-input')
      const searchPath = fixtures.searchDocuments[index] as string
      const searchToken = 'fast-folder-search-token-' + String(index)
      const searchDuration = await measureFolderSearch(page, searchInput, searchToken, searchPath)
      await recordSample(page, 'search.folder.firstBatch', 'ms', searchDuration, 'search')
      await searchInput.fill('')

      const scrollFps = await measureElementScrollFps(page, '.editor-component')
      await recordSample(page, 'document.50k.scrollFps', 'count', scrollFps, 'editor')
      await recordStability(app, page)
      assertWithinBudget(startedAt)
    }

    await expectNoRendererErrors(app)
  } finally {
    if (app) {
      await closeElectron(app)
      appendCapture(capture.directory)
    }
  }
}

const collectTabSwitchSamples = async(
  fixtures: FastFixtures,
  capture: CaptureDirectory,
  startedAt: number
): Promise<void> => {
  let app: ElectronApplication | undefined
  const tabPaths = fixtures.documents.slice(0, 8)
  try {
    const launched = await launchCaptured([fixtures.root, tabPaths[0] as string], capture)
    app = launched.app
    const { page } = launched
    await installFastGateProbe(page)
    await waitForWorkspaceReady(page)
    await waitForEditor(page, 60_000)

    for (let index = 1; index < tabPaths.length; index += 1) {
      const filePath = tabPaths[index] as string
      await sendIpcFromRenderer(page, 'mt::open-file', filePath, {})
      await waitForActiveFile(page, filePath)
    }
    await expect(page.locator('.tabs-container > li')).toHaveCount(8, { timeout: 60_000 })
    await waitForPaint(page)

    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
      const warm = page.locator('.tabs-container > li[data-tab-lifecycle="warm"]').first()
      const cold = page.locator('.tabs-container > li[data-tab-lifecycle="cold"]').first()
      const warmId = await warm.getAttribute('data-id')
      const coldId = await cold.getAttribute('data-id')
      if (!warmId || !coldId) {
        throw new Error('8-tab fast gate did not expose warm and cold tabs')
      }
      // Lifecycle labels are intentionally recomputed after every activation.
      // Keep the clicked tab stable by id; otherwise the locator can resolve
      // to the next warm tab after the click and report a false failure.
      const warmTarget = page.locator(`.tabs-container > li[data-id="${warmId}"]`)
      const coldTarget = page.locator(`.tabs-container > li[data-id="${coldId}"]`)

      const warmDuration = await measureTabClick(page, warmTarget, true)
      await recordSample(page, 'tabs.8.warmSwitch', 'ms', warmDuration)

      const coldDuration = await measureTabClick(page, coldTarget, true)
      await recordSample(page, 'tabs.8.coldSwitch', 'ms', coldDuration)

      const switchDuration = await measureTabClick(
        page,
        page.locator('.tabs-container > li').nth((index + 1) % 8)
      )
      await recordSample(page, 'tabs.8.switch', 'ms', switchDuration)
      await recordSample(page, 'tabs.8.freeze', 'count', switchDuration > 100 ? 1 : 0)
      assertWithinBudget(startedAt)
    }

    await expectNoRendererErrors(app)
  } finally {
    if (app) {
      await closeElectron(app)
      appendCapture(capture.directory)
    }
  }
}

const collectDiagramSamples = async(
  fixtures: FastFixtures,
  capture: CaptureDirectory,
  startedAt: number
): Promise<void> => {
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    let app: ElectronApplication | undefined
    try {
      const launched = await launchCaptured([fixtures.diagram], capture)
      app = launched.app
      const { page } = launched
      await installFastGateProbe(page)
      await waitForEditor(page, 60_000)
      await resetFastGateProbe(page)
      const editorMilestones = await readEditorMilestones(page)

      const placeholderDuration = await measurePageAction(page, async() => {
        await expect(page.locator('.mu-diagram-block').first()).toBeAttached({ timeout: 60_000 })
        await expect(page.locator('.mu-diagram-preview').first()).toBeAttached({ timeout: 60_000 })
      }, false)
      await recordSample(page, 'diagram.placeholder', 'ms', placeholderDuration, 'diagram')

      await expect
        .poll(
          async() =>
            Number(
              await page
                .locator('.mu-diagram-preview')
                .first()
                .getAttribute('data-diagram-first-render-start')
            ),
          { timeout: 60_000 }
        )
        .toBeGreaterThan(0)
      const firstRenderAt = Number(
        await page
          .locator('.mu-diagram-preview')
          .first()
          .getAttribute('data-diagram-first-render-start')
      )
      await recordSample(
        page,
        'diagram.firstScreenSyncRender',
        'count',
        firstRenderAt < editorMilestones.timestamps.editableAt ? 1 : 0,
        'diagram'
      )

      const imageStates = await page.locator('.mu-inline-image').evaluateAll((wrappers) =>
        wrappers.map((wrapper) => {
          const image = wrapper.querySelector('img') as HTMLImageElement | null
          return {
            complete: image?.complete ?? false,
            naturalWidth: image?.naturalWidth ?? 0,
            top: wrapper.getBoundingClientRect().top,
            lazy: wrapper.getAttribute('data-image-lazy'),
            loadStarted: wrapper.getAttribute('data-image-load-start'),
            hasImage: image !== null
          }
        })
      )
      const viewportHeight = page.viewportSize()?.height ?? 720
      const offscreen = selectFastOffscreenImage(imageStates, viewportHeight)
      const offscreenMetrics = evaluateFastOffscreenImage(offscreen)
      await recordSample(
        page,
        'image.offscreenRequest',
        'count',
        offscreenMetrics.request,
        'diagram'
      )
      await recordSample(page, 'image.offscreenDecode', 'count', offscreenMetrics.decode, 'diagram')
      await expectNoRendererErrors(app)
      assertWithinBudget(startedAt)
    } finally {
      if (app) {
        await closeElectron(app)
        appendCapture(capture.directory)
      }
    }
  }
}

const collectMemorySamples = async(
  fixtures: FastFixtures,
  capture: CaptureDirectory,
  startedAt: number
): Promise<void> => {
  let app: ElectronApplication | undefined
  try {
    const launched = await launchCaptured([fixtures.memoryFirst], capture)
    app = launched.app
    const { page } = launched
    await installFastGateProbe(page)
    await waitForEditor(page, 60_000)
    await resetFastGateProbe(page)
    await collectMemoryLeakCycleSamples({
      app,
      page,
      firstPath: fixtures.memoryFirst,
      cyclePath: fixtures.memoryCycle,
      cycleCount: FAST_MEMORY_CYCLE_COUNT,
      warmupCycleCount: FAST_MEMORY_WINDOW_SIZE,
      evaluationOptions: {
        shortWindowSize: FAST_MEMORY_WINDOW_SIZE,
        longWindowSize: FAST_MEMORY_WINDOW_SIZE
      },
      recordSample: (metric, unit, value) => recordSample(page, metric, unit, value, 'memory')
    })
    await recordStability(app, page)
    await expectNoRendererErrors(app)
    assertWithinBudget(startedAt)
  } finally {
    if (app) {
      await closeElectron(app)
      appendCapture(capture.directory)
    }
  }
}

test.describe('@perf-fast-gate PR smoke hard gate', () => {
  test.skip(!runFastGate, 'Run with INKIVA_RUN_PERF_FAST_GATE=true')
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(FAST_GATE_DURATION_MS + 60_000)

  test('collects twenty real samples for every fast hard metric', async() => {
    const capture = createCaptureDirectory()
    const fixtures = writeFixtures()
    const startedAt = hostPerformance.now()
    try {
      clearCaptureFiles(capture.directory)
      await collectDocumentSamples(fixtures, capture, startedAt)
      await collectTabSwitchSamples(fixtures, capture, startedAt)
      await collectDiagramSamples(fixtures, capture, startedAt)
      await collectMemorySamples(fixtures, capture, startedAt)
      expect(fs.existsSync(path.join(capture.directory, 'fast.raw.json'))).toBe(true)
    } finally {
      capture.cleanup()
      fs.rmSync(fixtures.root, { recursive: true, force: true })
    }
  })
})
