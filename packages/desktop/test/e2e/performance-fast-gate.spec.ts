import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
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
  sendIpcToRenderer,
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
  expectedAt: number
  intervalId: number
  inputObserver?: PerformanceObserver
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
  // Save/search timings include the next paint because they measure the
  // user-visible result. Placeholder timing ends at attachment itself; adding
  // two paint boundaries there measures the probe instead of placeholder
  // creation and can fail the <50 ms gate on a nominal 60 Hz frame budget.
  if (settleAfterAction) await waitForPaint(page)
  const endedAt = await page.evaluate(() => performance.now())
  return Math.max(0, endedAt - startedAt)
}

const installFastGateProbe = async(page: Page): Promise<void> => {
  await page.evaluate(() => {
    const state = globalThis as typeof globalThis & {
      __inkiva_fast_gate_probe__?: FastGateProbe
    }
    if (state.__inkiva_fast_gate_probe__) return

    const inputDurations: number[] = []
    let inputObserver: PerformanceObserver | undefined
    try {
      inputObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (
            entry.entryType === 'event' &&
            ['beforeinput', 'compositionend', 'input', 'keydown', 'keyup', 'paste'].includes(
              entry.name
            )
          ) {
            const timing = entry as PerformanceEntry & { processingStart?: unknown }
            const latency =
              typeof timing.processingStart === 'number' &&
              Number.isFinite(timing.processingStart) &&
              timing.processingStart >= entry.startTime
                ? timing.processingStart - entry.startTime
                : entry.duration
            if (Number.isFinite(latency) && latency >= 0) inputDurations.push(latency)
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
        // Unsupported observer entries remain missing so the evaluator fails closed.
      }
      inputObserver = undefined
    }

    const probe: FastGateProbe = {
      inputDurations,
      maxEventLoopLag: 0,
      expectedAt: performance.now() + 16,
      intervalId: 0,
      inputObserver
    }
    state.__inkiva_fast_gate_probe__ = probe
    probe.intervalId = window.setInterval(() => {
      const now = performance.now()
      probe.maxEventLoopLag = Math.max(probe.maxEventLoopLag, Math.max(0, now - probe.expectedAt))
      probe.expectedAt = now + 16
    }, 16)
  })
}

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
    probe.maxEventLoopLag = 0
    probe.expectedAt = performance.now() + 16
  })
}

const measureInput = async(page: Page, iteration: number): Promise<number> => {
  await placeCaretInEditor(page)
  const beforeCount = await readInputCount(page)
  await page.keyboard.insertText('fast-gate-input-' + String(iteration))
  await page.waitForFunction(
    (minimumCount) => {
      const state = globalThis as typeof globalThis & {
        __inkiva_fast_gate_probe__?: FastGateProbe
      }
      return (state.__inkiva_fast_gate_probe__?.inputDurations.length ?? 0) > minimumCount
    },
    beforeCount,
    { timeout: 5_000 }
  )
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
            resolve(Math.max(0, ((frames - 1) * 1_000) / (timestamp - startedAt)))
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
  return {
    firstScreenMs: Math.max(0, milestones.timestamps.firstScreenAt - startedAt),
    editableMs: Math.max(0, milestones.timestamps.editableAt - startedAt)
  }
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
      const saveDuration = await measurePageAction(page, async() => {
        await sendIpcToRenderer(app as ElectronApplication, 'mt::editor-ask-file-save')
        await expect
          .poll(() => (fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''), {
            timeout: 60_000
          })
          .toContain(saveToken)
      })
      await recordSample(page, 'save.50k', 'ms', saveDuration, 'autosave')

      await showSidebarPanel(app, page, 'search')
      const searchInput = page.locator('.side-bar-search input.search-input')
      const searchPath = fixtures.searchDocuments[index] as string
      const searchToken = 'fast-folder-search-token-' + String(index)
      const searchDuration = await measurePageAction(page, async() => {
        await searchInput.fill(searchToken)
        await expect
          .poll(
            () =>
              page
                .locator('.side-bar-search .search-result[title]')
                .evaluateAll((items) =>
                  items
                    .map((item) => item.getAttribute('title'))
                    .filter((title): title is string => title !== null)
                ),
            { timeout: 60_000 }
          )
          .toContain(searchPath)
      })
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
      await collectDiagramSamples(fixtures, capture, startedAt)
      await collectMemorySamples(fixtures, capture, startedAt)
      expect(fs.existsSync(path.join(capture.directory, 'fast.raw.json'))).toBe(true)
    } finally {
      capture.cleanup()
      fs.rmSync(fixtures.root, { recursive: true, force: true })
    }
  })
})
