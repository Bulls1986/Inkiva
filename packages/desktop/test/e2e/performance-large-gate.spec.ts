import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance as hostPerformance } from 'node:perf_hooks'

import {
  createHeadingStormFixture,
  createMarkdownFixture,
  createWorkspaceFixture,
  type HeadingStormCount,
  type MarkdownDocumentTier,
  type WorkspaceNodeCount
} from '../../../../perf/gate/fixtures'
import {
  LARGE_GATE_SAMPLE_COUNT,
  getLargeGateCollectionContract,
  parseLargeGateLevels
} from '../../../../perf/gate/large-collection'
import {
  getLargeGateScenario,
  RUNTIME_COLLECTED_METRICS,
  type LargeGateLevel
} from '../../../../perf/gate/large-scenarios'
import {
  measureEditorMilestones,
  type EditorMilestoneDurations,
  type EditorMilestoneTimestamps
} from '../../../../perf/gate/editorMilestones'
import { mergePerformanceTraceReports } from '../../../../perf/gate/trace-input'
import {
  collectMemoryLeakCycleSamples,
  createRendererHeapSampler
} from './performanceMemory'
import {
  calculateHeapDelta,
  MEMORY_FOOTPRINT_SAMPLE_COUNT
} from '../../../../perf/gate/memory'
import {
  closeElectron,
  expectNoRendererErrors,
  getRendererErrors,
  launchElectron,
  placeCaretInEditor,
  sendIpcToRenderer,
  showSidebarPanel,
  waitForEditor,
  waitForWorkspaceReady
} from './helpers'

type GateUnit = 'ms' | 'count' | 'bytes' | 'ratio'
type GatePhase = 'startup' | 'document-open' | 'editor' | 'diagram' | 'search' | 'autosave' | 'memory'

const runLargeGate = process.env.INKIVA_RUN_PERF_LARGE_GATE === 'true'
const enabledLevels = runLargeGate
  ? parseLargeGateLevels(process.env.INKIVA_PERF_GATE_LEVELS)
  : []
const SAMPLE_COUNT = LARGE_GATE_SAMPLE_COUNT
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

interface WorkspaceData {
  root: string
  firstFile: string
  hotDirectory: string
  hotChildren: number
}

const createCaptureDirectory = (): CaptureDirectory => {
  const configured = process.env.INKIVA_PERF_REPORT_DIR?.trim()
  if (configured) {
    fs.mkdirSync(configured, { recursive: true })
    return { directory: configured, cleanup: () => {} }
  }

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-performance-large-'))
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

const clearCaptureFiles = (directory: string, level: LargeGateLevel): void => {
  clearCategoryFiles(directory)
  fs.rmSync(path.join(directory, getLargeGateCollectionContract(level).rawFile), { force: true })
}

const readCaptureReports = (directory: string): unknown[] =>
  categoryNames.flatMap((category) => {
    const reportPath = path.join(directory, category + '.json')
    return fs.existsSync(reportPath)
      ? [JSON.parse(fs.readFileSync(reportPath, 'utf8')) as unknown]
      : []
  })

const appendCapture = (directory: string, level: LargeGateLevel): void => {
  const reports = readCaptureReports(directory)
  if (reports.length === 0) {
    throw new Error('large performance gate capture produced no category reports')
  }

  const rawPath = path.join(directory, getLargeGateCollectionContract(level).rawFile)
  if (fs.existsSync(rawPath)) {
    reports.unshift(JSON.parse(fs.readFileSync(rawPath, 'utf8')) as unknown)
  }
  const merged = mergePerformanceTraceReports(reports)
  fs.writeFileSync(rawPath, JSON.stringify(merged, null, 2) + '\n', 'utf8')
}

const captureEnvironment = (directory: string): Record<string, string> => ({
  INKIVA_PERF_CAPTURE: 'true',
  INKIVA_PERF_REPORT_DIR: directory,
  INKIVA_PERF_SAMPLE_INTERVAL_MS: '250',
  INKIVA_PERF_OFFLINE: 'true',
  INKIVA_PERF_RUNNER_LABEL: 'reference-low-end'
})

const launchCaptured = async(
  args: string[],
  capture: CaptureDirectory,
  waitForEditorTimeout = 180000
): Promise<{ app: ElectronApplication; page: Page }> => {
  clearCategoryFiles(capture.directory)
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
        metadata: { collector: 'large-real-action' }
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

const measurePageAction = async(page: Page, action: () => Promise<void>): Promise<number> => {
  const started = await page.evaluate(() => performance.now())
  await action()
  await waitForPaint(page)
  const ended = await page.evaluate(() => performance.now())
  return Math.max(0, ended - started)
}

const installGateProbe = async(page: Page): Promise<void> => {
  await page.evaluate(() => {
    const state = globalThis as typeof globalThis & { __inkiva_large_gate_probe__?: GateProbe }
    if (state.__inkiva_large_gate_probe__) return

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
        // Unsupported observer entries remain missing so the evaluator fails closed.
      }
      inputObserver = undefined
    }

    let expected = performance.now() + 16
    const stateValue = {
      inputDurations,
      maxEventLoopLag: 0,
      intervalId: 0,
      inputObserver
    }
    state.__inkiva_large_gate_probe__ = stateValue
    stateValue.intervalId = window.setInterval(() => {
      const now = performance.now()
      stateValue.maxEventLoopLag = Math.max(stateValue.maxEventLoopLag, Math.max(0, now - expected))
      expected = now + 16
    }, 16)
  })
}

const readInputCount = async(page: Page): Promise<number> =>
  await page.evaluate(() => {
    const state = (globalThis as typeof globalThis & { __inkiva_large_gate_probe__?: GateProbe })
      .__inkiva_large_gate_probe__
    return state?.inputDurations.length ?? 0
  })

const readLatestInputDuration = async(page: Page): Promise<number | undefined> =>
  await page.evaluate(() => {
    const state = (globalThis as typeof globalThis & { __inkiva_large_gate_probe__?: GateProbe })
      .__inkiva_large_gate_probe__
    const value = state?.inputDurations[state.inputDurations.length - 1]
    return typeof value === 'number' ? value : undefined
  })

const readMaxEventLoopLag = async(page: Page): Promise<number> =>
  await page.evaluate(() => {
    const state = (globalThis as typeof globalThis & { __inkiva_large_gate_probe__?: GateProbe })
      .__inkiva_large_gate_probe__
    return state?.maxEventLoopLag ?? 0
  })

const measureInput = async(
  page: Page,
  metric?: string,
  iteration = 0
): Promise<number> => {
  await placeCaretInEditor(page)
  const beforeCount = await readInputCount(page)
  await page.keyboard.insertText('large-gate-input-' + iteration)
  await page.waitForFunction(
    (count) => {
      const state = (globalThis as typeof globalThis & { __inkiva_large_gate_probe__?: GateProbe })
        .__inkiva_large_gate_probe__
      return (state?.inputDurations.length ?? 0) > count
    },
    beforeCount,
    { timeout: 5000 }
  )
  const duration = await readLatestInputDuration(page)
  if (duration === undefined) {
    throw new Error('Event Timing did not produce a real input sample')
  }
  if (metric) await recordSample(page, metric, 'ms', duration)
  return duration
}

const measureElementScrollFps = async(page: Page, selector: string): Promise<number> =>
  await page.evaluate(
    (targetSelector) =>
      new Promise<number>((resolve) => {
        const element = document.querySelector(targetSelector) as HTMLElement | null
        if (!element) {
          resolve(0)
          return
        }
        const maximum = Math.max(0, element.scrollHeight - element.clientHeight)
        const started = { value: 0 }
        let frames = 0
        const tick = (timestamp: number): void => {
          if (started.value === 0) started.value = timestamp
          frames += 1
          element.scrollTop = maximum > 0
            ? (element.scrollTop + Math.max(1, maximum / 45)) % (maximum + 1)
            : element.scrollTop
          if (timestamp - started.value >= 1_000) {
            resolve(Math.max(0, (frames - 1) * 1_000 / (timestamp - started.value)))
            return
          }
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
    selector
  )

const measureSaveEditorLock = async(
  page: Page,
  app: ElectronApplication,
  iteration: number
): Promise<number> => {
  await placeCaretInEditor(page)
  const beforeCount = await readInputCount(page)
  let inputWorked = true
  try {
    const savePromise = sendIpcToRenderer(app!, 'mt::editor-ask-file-save')
    const inputPromise = page.keyboard.insertText('save-lock-' + iteration)
    await Promise.all([savePromise, inputPromise])
    await page.waitForFunction(
      (count) => {
        const state = (globalThis as typeof globalThis & { __inkiva_large_gate_probe__?: GateProbe })
          .__inkiva_large_gate_probe__
        return (state?.inputDurations.length ?? 0) > count
      },
      beforeCount,
      { timeout: 5000 }
    )
  } catch {
    inputWorked = false
  }
  return inputWorked ? 0 : 1
}

const collectFrameDurations = async(page: Page): Promise<number[]> =>
  await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const values: number[] = []
        let previous: number | undefined
        let frames = 0
        const tick = (timestamp: number): void => {
          if (previous !== undefined) values.push(Math.max(0, timestamp - previous))
          previous = timestamp
          frames += 1
          if (frames >= 25) {
            resolve(values)
            return
          }
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
  )

const readCurrentPath = async(page: Page): Promise<string | null> =>
  await page.evaluate(() => {
    const root = document.querySelector('#app') as
      | (Element & {
        __vue_app__?: { config?: { globalProperties?: Record<string, unknown> } }
      })
      | null
    const pinia = root?.__vue_app__?.config?.globalProperties?.$pinia as
      | { _s?: Map<string, { currentFile?: { pathname?: string } | null }> }
      | undefined
    return pinia?._s?.get('editor')?.currentFile?.pathname ?? null
  })

interface EditorMilestoneRead {
  timestamps: EditorMilestoneTimestamps
  durations: EditorMilestoneDurations
}

const readEditorMilestones = async(
  page: Page,
  minimumOpenStartAt = 0,
  timeout = 180000
): Promise<EditorMilestoneRead> => {
  await page.waitForFunction(
    (minimum) => {
      const element = document.querySelector('.editor-component')
      if (!element) return false
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
    },
    minimumOpenStartAt,
    { timeout }
  )

  const timestamps = await page.evaluate(() => {
    const element = document.querySelector('.editor-component')
    if (!element) throw new Error('editor component is missing for performance milestones')
    return {
      openStartAt: Number(element.getAttribute('data-editor-open-start-at')),
      firstScreenAt: Number(element.getAttribute('data-editor-first-screen-at')),
      editableAt: Number(element.getAttribute('data-editor-editable-at'))
    }
  }) as EditorMilestoneTimestamps

  return {
    timestamps,
    durations: measureEditorMilestones(timestamps)
  }
}

const activateFile = async(
  app: ElectronApplication,
  page: Page,
  filePath: string
): Promise<EditorMilestoneDurations> => {
  const startedAt = await page.evaluate(() => performance.now())
  await sendIpcToRenderer(app!, 'mt::open-file', filePath, {})
  await expect.poll(() => readCurrentPath(page), { timeout: 180000 }).toBe(filePath)
  const milestones = await readEditorMilestones(page, startedAt)
  return {
    firstScreenMs: Math.max(0, milestones.timestamps.firstScreenAt - startedAt),
    editableMs: Math.max(0, milestones.timestamps.editableAt - startedAt)
  }
}

const writeDocumentSet = (
  root: string,
  tier: MarkdownDocumentTier,
  count: number
): string[] => {
  const fixture = createMarkdownFixture(tier)
  const paths: string[] = []
  for (let index = 0; index < count; index += 1) {
    const filePath = path.join(root, tier + '-' + String(index).padStart(2, '0') + '.md')
    fs.writeFileSync(filePath, fixture.markdown, 'utf8')
    paths.push(filePath)
  }
  return paths
}

const writeHeadingSet = (root: string, headingCount: HeadingStormCount, count: number): string[] => {
  const fixture = createHeadingStormFixture(headingCount)
  const paths: string[] = []
  for (let index = 0; index < count; index += 1) {
    const filePath = path.join(
      root,
      'heading-' + String(headingCount) + '-' + String(index).padStart(2, '0') + '.md'
    )
    fs.writeFileSync(filePath, fixture.markdown, 'utf8')
    paths.push(filePath)
  }
  return paths
}

const writeWorkspace = (
  targetNodes: WorkspaceNodeCount,
  hotChildren: number
): WorkspaceData => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-large-workspace-'))
  const fixture = createWorkspaceFixture(targetNodes)
  const directories = fixture.nodes.filter((node) => node.kind === 'directory')
  for (const directory of directories) {
    fs.mkdirSync(path.join(root, directory.path.replace(/^workspace[\\/]/, '')), { recursive: true })
  }

  const firstDirectory = directories[0]
  if (!firstDirectory) throw new Error('workspace fixture has no directory')
  const firstDirectoryPath = path.join(
    root,
    firstDirectory.path.replace(/^workspace[\\/]/, '')
  )
  const fileCount = fixture.fileCount
  const boundedHotChildren = Math.min(hotChildren, fileCount)
  let firstFile = ''
  for (let index = 0; index < fileCount; index += 1) {
    const directory =
      index < boundedHotChildren
        ? firstDirectory
        : directories[1 + ((index - boundedHotChildren) % Math.max(1, directories.length - 1))] ??
          firstDirectory
    const directoryPath = path.join(root, directory.path.replace(/^workspace[\\/]/, ''))
    const fileName =
      index < boundedHotChildren
        ? 'hot-' + String(index).padStart(6, '0') + '.md'
        : 'note-' + String(index).padStart(7, '0') + '.md'
    const filePath = path.join(directoryPath, fileName)
    const marker = index === 0 ? 'workspace-target' : 'workspace-note-' + String(index % 20)
    fs.writeFileSync(
      filePath,
      '# Workspace note ' + index + '\n\n' + marker + '\n',
      'utf8'
    )
    if (index === 0) firstFile = filePath
  }

  return {
    root,
    firstFile,
    hotDirectory: firstDirectoryPath,
    hotChildren: boundedHotChildren
  }
}

const writeTabSet = (
  root: string,
  count = 8,
  tier: MarkdownDocumentTier = '50k'
): string[] => {
  const fixture = createMarkdownFixture(tier)
  const paths: string[] = []
  for (let index = 0; index < count; index += 1) {
    const filePath = path.join(root, 'tab-' + String(index) + '.md')
    fs.writeFileSync(filePath, fixture.markdown, 'utf8')
    paths.push(filePath)
  }
  return paths
}

const readRawMetricCounts = (directory: string, level: LargeGateLevel): Map<string, number> => {
  const rawPath = path.join(directory, getLargeGateCollectionContract(level).rawFile)
  if (!fs.existsSync(rawPath)) throw new Error('raw report is missing: ' + rawPath)
  const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8')) as {
    traces?: Array<{ events?: Array<{ name?: string; metadata?: { metric?: string } }> }>
  }
  const counts = new Map<string, number>()
  for (const trace of raw.traces ?? []) {
    for (const event of trace.events ?? []) {
      if (event.name !== 'metric_sample' || !event.metadata?.metric) continue
      counts.set(event.metadata.metric, (counts.get(event.metadata.metric) ?? 0) + 1)
    }
  }
  return counts
}

const assertRawCoverage = (directory: string, level: LargeGateLevel): void => {
  const counts = readRawMetricCounts(directory, level)
  const required = new Set([
    ...getLargeGateScenario(level).metrics,
    ...RUNTIME_COLLECTED_METRICS
  ])
  const missing = [...required].filter((metric) => (counts.get(metric) ?? 0) < SAMPLE_COUNT)
  if (missing.length > 0) {
    throw new Error(
      level + ' real collector did not produce 20 raw samples for: ' +
        missing.map((metric) => metric + '=' + String(counts.get(metric) ?? 0)).join(', ')
    )
  }
}

const collectDocumentTier = async(
  level: LargeGateLevel,
  tier: MarkdownDocumentTier,
  capture: CaptureDirectory
): Promise<void> => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-large-docs-'))
  const paths = writeDocumentSet(fixtureRoot, tier, SAMPLE_COUNT)
  let app: ElectronApplication | undefined
  try {
    const launched = await launchCaptured([fixtureRoot, paths[0] as string], capture)
    app = launched.app
    const { page } = launched
    await installGateProbe(page)
    await page.waitForSelector('.editor-component', { state: 'visible', timeout: 180000 })
    await waitForEditor(page, 180000)
    const initialMilestones = await readEditorMilestones(page)
    const initialFirstScreen = initialMilestones.durations.firstScreenMs
    const initialEditable = initialMilestones.durations.editableMs
    await recordSample(
      page,
      'document.' + tier + '.firstScreen',
      'ms',
      initialFirstScreen,
      'document-open'
    )
    await recordSample(page, 'document.' + tier + '.editable', 'ms', initialEditable, 'document-open')

    for (let index = 0; index < paths.length; index += 1) {
      const filePath = paths[index] as string
      if (index > 0) {
        const openDurations = await activateFile(app!, page, filePath)
        await recordSample(
          page,
          'document.' + tier + '.firstScreen',
          'ms',
          openDurations.firstScreenMs,
          'document-open'
        )
        await recordSample(
          page,
          'document.' + tier + '.editable',
          'ms',
          openDurations.editableMs,
          'document-open'
        )
      }

      await showSidebarPanel(app!, page, 'files')
      const outlineDuration = await measurePageAction(page, async() => {
        await showSidebarPanel(app!, page, 'toc')
        await expect(page.locator('.side-bar-toc [data-testid="toc-node-label"]').first()).toBeVisible({
          timeout: 180000
        })
      })
      if (tier === '50k' || tier === '100k' || tier === '500k' || (level === 'P3' && tier === '1m')) {
        await recordSample(page, 'document.' + tier + '.outlineFirst', 'ms', outlineDuration, 'document-open')
      }
      if (tier === '50k') {
        await recordSample(page, 'document.50k.lightIndex', 'ms', outlineDuration, 'document-open')
      }
      if (tier === '500k' || (level === 'P3' && tier === '1m')) {
        const fullOutlineDuration = await measurePageAction(page, async() => {
          await page.locator('[data-testid="toc-expand-all"]').click()
          await expect(page.locator('.side-bar-toc [data-testid="toc-node-label"]').first()).toBeVisible({
            timeout: 180000
          })
        })
        await recordSample(
          page,
          'document.' + tier + '.outlineFull',
          'ms',
          fullOutlineDuration,
          'document-open'
        )
      }

      if (level === 'P3' && tier === '1m') {
        const rendererHang = page.isClosed()
          ? 1
          : (await readMaxEventLoopLag(page)) > 100 ? 1 : 0
        await recordSample(page, 'document.1m.rendererHang', 'count', rendererHang)
      }

      const headingDuration = await measurePageAction(page, async() => {
        await page.locator('.side-bar-toc [data-testid="toc-node-label"]').last().click()
      })
      await recordSample(page, 'document.' + tier + '.headingJump', 'ms', headingDuration)

      if (tier === '50k' || tier === '100k') {
        const scrollFps = await measureElementScrollFps(page, '.editor-component')
        await recordSample(page, 'document.' + tier + '.scrollFps', 'count', scrollFps)
      }
      if (tier === '500k') {
        const frameDurations = await collectFrameDurations(page)
        for (const duration of frameDurations) {
          await recordSample(page, 'document.500k.frame', 'ms', duration)
        }
      }

      if (tier === '50k' || tier === '500k' || tier === '1m') {
        const inputDuration = await measureInput(
          page,
          'document.' + tier + '.input',
          index
        )
        if (tier === '50k') {
          await recordSample(page, 'core.input.latency', 'ms', inputDuration)
        }
        const searchDuration = await measurePageAction(page, async() => {
          await sendIpcToRenderer(app!, 'mt::editor-edit-action', 'find')
          const input = page.locator('.search-bar .search input')
          await expect(input).toBeVisible({ timeout: 10000 })
          await input.fill('Section')
          await expect(page.locator('.search-bar .search-result')).not.toHaveText('0 / 0', {
            timeout: 180000
          })
          await page.keyboard.press('Escape')
          await expect(page.locator('.search-bar')).toBeHidden({ timeout: 10000 })
        })
        await recordSample(page, 'search.current.' + tier, 'ms', searchDuration, 'search')
        await recordSample(page, 'document.' + tier + '.searchFirst', 'ms', searchDuration, 'search')

        const saveToken = 'large-gate-input-' + String(index)
        const saveDuration = await measurePageAction(page, async() => {
          await sendIpcToRenderer(app!, 'mt::editor-ask-file-save')
          await expect.poll(
            () => (fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''),
            { timeout: 180000 }
          ).toContain(saveToken)
        })
        await recordSample(page, 'save.' + tier, 'ms', saveDuration, 'autosave')

        const normalUndoDuration = await measurePageAction(page, async() => {
          await sendIpcToRenderer(app!, 'mt::editor-edit-action', 'undo')
        })
        await recordSample(page, 'undo.normal', 'ms', normalUndoDuration)
        const normalRedoDuration = await measurePageAction(page, async() => {
          await sendIpcToRenderer(app!, 'mt::editor-edit-action', 'redo')
        })
        await recordSample(page, 'redo.normal', 'ms', normalRedoDuration)

        await placeCaretInEditor(page)
        await page.keyboard.insertText('large-operation-' + 'x'.repeat(512))
        await waitForPaint(page)
        const largeUndoDuration = await measurePageAction(page, async() => {
          await sendIpcToRenderer(app!, 'mt::editor-edit-action', 'undo')
        })
        await recordSample(page, 'undo.large', 'ms', largeUndoDuration)

        const sameEditorRoot = await page.evaluate(() => {
          const root = document.querySelector('.editor-component')?.firstElementChild
          ;(globalThis as typeof globalThis & { __inkiva_undo_root__?: Element }).__inkiva_undo_root__ = root ?? undefined
          return !!root
        })
        if (!sameEditorRoot) throw new Error('editor root was unavailable for undo identity gate')
        await sendIpcToRenderer(app!, 'mt::editor-edit-action', 'undo')
        await waitForPaint(page)
        const rootWasReused = await page.evaluate(() => {
          const state = globalThis as typeof globalThis & { __inkiva_undo_root__?: Element }
          return state.__inkiva_undo_root__ === document.querySelector('.editor-component')?.firstElementChild
        })
        await recordSample(page, 'undo.fullDomRebuild', 'count', rootWasReused ? 0 : 1)
        await sendIpcToRenderer(app!, 'mt::editor-edit-action', 'redo')

        const saveWhileEditing = await measureSaveEditorLock(page, app!, index + 1000)
        await recordSample(page, 'save.editorLock', 'count', saveWhileEditing, 'autosave')
      }
    }
  } finally {
    if (app) {
      await closeElectron(app)
      appendCapture(capture.directory, level)
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
}

const collectHeadingTier = async(
  level: LargeGateLevel,
  headingCount: HeadingStormCount,
  capture: CaptureDirectory
): Promise<void> => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-heading-storm-'))
  const paths = writeHeadingSet(fixtureRoot, headingCount, SAMPLE_COUNT)
  let app: ElectronApplication | undefined
  try {
    const launched = await launchCaptured([fixtureRoot, paths[0] as string], capture, 240000)
    app = launched.app
    const { page } = launched
    await installGateProbe(page)
    await waitForEditor(page, 240000)

    for (let index = 0; index < paths.length; index += 1) {
      const filePath = paths[index] as string
      if (index > 0) await activateFile(app!, page, filePath)
      const outlineDuration = await measurePageAction(page, async() => {
        await showSidebarPanel(app!, page, 'toc')
        await expect(page.locator('.side-bar-toc [data-testid="toc-node-label"]').first()).toBeVisible({
          timeout: 240000
        })
      })
      if (headingCount === 5000) {
        await recordSample(page, 'heading.5k.outlineFirst', 'ms', outlineDuration)
        await recordSample(page, 'heading.5k.index', 'ms', outlineDuration)
        const clickDuration = await measurePageAction(page, async() => {
          await page.locator('.side-bar-toc [data-testid="toc-node-label"]').first().click()
        })
        await recordSample(page, 'heading.5k.click', 'ms', clickDuration)
        const searchDuration = await measurePageAction(page, async() => {
          const search = page.locator('[data-testid="toc-search"]')
          await search.fill('Heading 1')
          await expect(page.locator('.side-bar-toc [data-testid="toc-node-label"]').first()).toBeVisible({
            timeout: 240000
          })
          await search.fill('')
        })
        await recordSample(page, 'heading.5k.search', 'ms', searchDuration, 'search')
        const collapseDuration = await measurePageAction(page, async() => {
          await page.locator('[data-testid="toc-collapse-all"]').click()
          await page.locator('[data-testid="toc-expand-all"]').click()
        })
        await recordSample(page, 'heading.5k.collapse', 'ms', collapseDuration)
        const scrollFps = await measureElementScrollFps(page, '.toc-virtualized-tree')
        await recordSample(page, 'heading.5k.scrollFps', 'count', scrollFps)
        const rows = await page.locator('.toc-virtualized-tree [data-testid="toc-node-label"]').count()
        const viewportRows = await page.locator('.toc-virtualized-tree').evaluate((element) =>
          Math.max(1, Math.floor((element as HTMLElement).clientHeight / 34))
        )
        await recordSample(page, 'heading.5k.domRatio', 'ratio', rows / viewportRows)
      } else {
        const errors = await getRendererErrors(app)
        await recordSample(page, 'heading.10k.crash', 'count', errors.length > 0 ? 1 : 0)
        await recordSample(page, 'heading.10k.oom', 'count', page.isClosed() || app.process().killed ? 1 : 0)
        await recordSample(
          page,
          'heading.10k.rendererHang',
          'count',
          outlineDuration > 100 ? 1 : 0
        )
        await recordSample(page, 'heading.10k.mainBlock', 'ms', await readMaxEventLoopLag(page))
      }
    }
  } finally {
    if (app) {
      await closeElectron(app)
      appendCapture(capture.directory, level)
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
}

const collectTreeSamples = async(
  level: LargeGateLevel,
  targetNodes: WorkspaceNodeCount,
  hotChildren: number,
  capture: CaptureDirectory
): Promise<void> => {
  const workspace = writeWorkspace(targetNodes, hotChildren)
  try {
    for (let iteration = 0; iteration < SAMPLE_COUNT; iteration += 1) {
      let app: ElectronApplication | undefined
      try {
        const started = hostPerformance.now()
        const launched = await launchCaptured([workspace.root, workspace.firstFile], capture, 180000)
        app = launched.app
        const { page } = launched
        await waitForWorkspaceReady(page)
        await showSidebarPanel(app!, page, 'files')
        await expect(page.locator('.tree-virtual-viewport .virtual-tree-row').first()).toBeVisible({
          timeout: 180000
        })
        const firstScreenMetric = targetNodes === 100000
          ? 'tree.100k.shell'
          : 'tree.' + targetNodes / 1000 + 'k.firstScreen'
        await recordSample(page, firstScreenMetric, 'ms', hostPerformance.now() - started)
      } finally {
        if (app) {
          await closeElectron(app)
          appendCapture(capture.directory, level)
        }
      }
    }

    let app: ElectronApplication | undefined
    try {
      const launched = await launchCaptured([workspace.root, workspace.firstFile], capture, 180000)
      app = launched.app
      const { page } = launched
      await installGateProbe(page)
      await waitForWorkspaceReady(page)
      await showSidebarPanel(app!, page, 'files')
      const hotDirectoryName = path.basename(workspace.hotDirectory)
      const folder = page.locator('[data-path*="' + hotDirectoryName + '"] .folder-name')
      await expect(folder).toBeVisible({ timeout: 180000 })
      const expandDuration = await measurePageAction(page, async() => {
        await folder.click()
        await page.waitForFunction(
          (minimumHeight) => {
            const spacer = document.querySelector('.tree-virtual-spacer') as HTMLElement | null
            return (spacer?.clientHeight ?? 0) >= minimumHeight
          },
          workspace.hotChildren * 30,
          { timeout: 180000 }
        )
      })
      if (targetNodes === 10000) {
        await recordSample(page, 'tree.10k.expand', 'ms', expandDuration)
        await recordSample(page, 'tree.10k.expand1k', 'ms', expandDuration)
      } else {
        await recordSample(page, 'tree.50k.expand5k', 'ms', expandDuration)
      }

      const treeSearchDuration = await measurePageAction(page, async() => {
        await sendIpcToRenderer(app!, 'mt::show-command-palette')
        const input = page.locator('input.search').first()
        await expect(input).toBeVisible({ timeout: 10000 })
        await input.fill('hot-0000')
        await expect(
          page.locator('[data-testid="command-palette-option"]').filter({ hasText: 'hot-0000.md' }).first()
        ).toBeVisible({ timeout: 180000 })
        await page.keyboard.press('Escape')
      })
      await recordSample(
        page,
        targetNodes === 10000 ? 'tree.10k.search' : 'tree.50k.searchFirst',
        'ms',
        treeSearchDuration,
        'search'
      )

      const treeSelector = '.tree-virtual-viewport'
      const scrollFps = await measureElementScrollFps(page, treeSelector)
      await recordSample(page, targetNodes === 10000 ? 'tree.10k.scrollFps' : 'tree.50k.scrollFps', 'count', scrollFps)

      const visibleRows = await page.locator('.tree-virtual-viewport .virtual-tree-row').count()
      const viewportRows = await page.locator('.tree-virtual-viewport').evaluate((element) =>
        Math.max(1, Math.floor((element as HTMLElement).clientHeight / 30))
      )
      if (targetNodes === 10000) {
        await recordSample(page, 'tree.10k.domRatio', 'ratio', visibleRows / viewportRows)
      }
      if (targetNodes === 100000) {
        await recordSample(page, 'tree.100k.domRatio', 'ratio', visibleRows / viewportRows)
        await sendIpcToRenderer(app!, 'mt::new-untitled-tab', true, '100k workspace tab\n')
        await expect(page.locator('.tabs-container > li')).toHaveCount(2, { timeout: 180000 })
        for (let index = 0; index < SAMPLE_COUNT; index += 1) {
          const tabSwitchDuration = await measurePageAction(page, async() => {
            await sendIpcToRenderer(app!, 'mt::switch-tab-by-index', index % 2)
          })
          await recordSample(page, 'tree.100k.tabSwitch', 'ms', tabSwitchDuration)
          await recordSample(page, 'tree.100k.freeze', 'count', tabSwitchDuration > 100 ? 1 : 0)
          await recordSample(
            page,
            'tree.100k.rendererHang',
            'count',
            page.isClosed() || (await readMaxEventLoopLag(page)) > 100 ? 1 : 0
          )
          const editorInput = await measureInput(page, 'tree.100k.editorInput', index + 7000)
          await recordSample(page, 'core.input.latency', 'ms', editorInput)
        }
      }

      if (targetNodes === 50000 || targetNodes === 100000) {
        for (let index = 0; index < SAMPLE_COUNT; index += 1) {
          const baseline = await measureInput(page, undefined, index + 2000)
          fs.writeFileSync(
            path.join(workspace.hotDirectory, 'watcher-' + String(index).padStart(4, '0') + '.md'),
            '# Watcher ' + index + '\n',
            'utf8'
          )
          const stressed = await measureInput(page, undefined, index + 3000)
          const degradation = Math.max(0, (stressed - baseline) / Math.max(0.1, baseline))
          if (targetNodes === 50000) {
            await recordSample(page, 'tree.50k.inputDegradation', 'ratio', degradation)
          }
          await recordSample(page, 'background.editorDegradation', 'ratio', degradation)
        }
      }

      const folderSearchInput = page.locator('.side-bar-search input.search-input')
      await showSidebarPanel(app!, page, 'search')
      for (let index = 0; index < SAMPLE_COUNT; index += 1) {
        const searchDuration = await measurePageAction(page, async() => {
          await folderSearchInput.fill('workspace-target')
          await expect(page.locator('.side-bar-search .search-result-item').first()).toBeVisible({
            timeout: 180000
          })
        })
        await recordSample(page, 'search.folder.firstBatch', 'ms', searchDuration, 'search')
        const editorInput = await measureInput(page, undefined, index + 4000)
        await recordSample(page, 'search.editorInput', 'ms', editorInput, 'search')
        await folderSearchInput.fill('')
      }
    } finally {
      if (app) {
        await closeElectron(app)
        appendCapture(capture.directory, level)
      }
    }
  } finally {
    fs.rmSync(workspace.root, { recursive: true, force: true })
  }
}

const collectMemoryFootprintSamples = async(
  level: LargeGateLevel,
  capture: CaptureDirectory
): Promise<void> => {
  const singleRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-memory-single-'))
  const singleFile = path.join(singleRoot, 'memory-single-50k.md')
  fs.writeFileSync(singleFile, createMarkdownFixture('50k').markdown, 'utf8')

  try {
    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
      let app: ElectronApplication | undefined
      try {
        const launched = await launchCaptured([singleRoot], capture, 180000)
        app = launched.app
        const { page } = launched
        await waitForWorkspaceReady(page)
        const sampler = await createRendererHeapSampler(page)
        try {
          const baseline = await sampler.sample()
          await activateFile(app, page, singleFile)
          const loaded = await sampler.sample()
          await recordSample(
            page,
            'memory.single50kDelta',
            'bytes',
            calculateHeapDelta(baseline, loaded),
            'memory'
          )
        } finally {
          await sampler.dispose()
        }
      } finally {
        if (app) {
          await closeElectron(app)
          appendCapture(capture.directory, level)
        }
      }
    }
  } finally {
    fs.rmSync(singleRoot, { recursive: true, force: true })
  }

  const tabsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-memory-tabs-'))
  const tabPaths = writeTabSet(tabsRoot, 8, '50k')
  let app: ElectronApplication | undefined
  try {
    const launched = await launchCaptured([tabsRoot], capture, 180000)
    app = launched.app
    const { page } = launched
    await waitForWorkspaceReady(page)
    const sampler = await createRendererHeapSampler(page)
    try {
      // Each cycle has its own idle baseline and then exercises the complete
      // eight-tab lifecycle. This keeps both footprint metrics backed by 20
      // independent real observations instead of cloning one measurement.
      for (let cycle = 0; cycle < MEMORY_FOOTPRINT_SAMPLE_COUNT; cycle += 1) {
        const baseline = await sampler.sample()
        for (const filePath of tabPaths) await activateFile(app, page, filePath)
        await expect(page.locator('.tabs-container > li')).toHaveCount(8, { timeout: 180000 })
        const loaded = await sampler.sample()
        await recordSample(
          page,
          'memory.tabs8Delta',
          'bytes',
          calculateHeapDelta(baseline, loaded),
          'memory'
        )

        for (let index = 0; index < tabPaths.length; index += 1) {
          await sendIpcToRenderer(app, 'mt::editor-close-tab')
          await expect(page.locator('.tabs-container > li')).toHaveCount(
            tabPaths.length - index - 1,
            { timeout: 180000 }
          )
        }
        await waitForPaint(page)
        const editorDomCount = await page.locator('.editor-component').count()
        await recordSample(
          page,
          'memory.closedTabsEditorDom',
          'count',
          editorDomCount,
          'memory'
        )
      }
    } finally {
      await sampler.dispose()
    }
  } finally {
    if (app) {
      await closeElectron(app)
      appendCapture(capture.directory, level)
    }
    fs.rmSync(tabsRoot, { recursive: true, force: true })
  }
}

const collectTabSamples = async(
  level: LargeGateLevel,
  capture: CaptureDirectory,
  tabTier: MarkdownDocumentTier = '50k'
): Promise<void> => {
  for (let iteration = 0; iteration < SAMPLE_COUNT; iteration += 1) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-tabs-open-'))
    const paths = writeTabSet(root, 8, tabTier)
    let app: ElectronApplication | undefined
    try {
      const launched = await launchCaptured([root, paths[0] as string], capture, 180000)
      app = launched.app
      const { page } = launched
      await waitForEditor(page, 180000)
      const initialMilestones = await readEditorMilestones(page)
      await recordSample(
        page,
        'tabs.8.openFirst',
        'ms',
        initialMilestones.durations.editableMs,
        'document-open'
      )
      for (let index = 1; index < paths.length; index += 1) {
        const duration = await activateFile(app!, page, paths[index] as string)
        await recordSample(
          page,
          index <= 3 ? 'tabs.8.open2to4' : 'tabs.8.open5to8',
          'ms',
          duration.editableMs,
          'document-open'
        )
      }
    } finally {
      if (app) {
        await closeElectron(app)
        appendCapture(capture.directory, level)
      }
      fs.rmSync(root, { recursive: true, force: true })
    }
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-tabs-interaction-'))
  const paths = writeTabSet(root, 8, tabTier)
  let app: ElectronApplication | undefined
  try {
    const launched = await launchCaptured([root, paths[0] as string], capture, 180000)
    app = launched.app
    const { page } = launched
    await installGateProbe(page)
    await waitForEditor(page, 180000)
    for (let index = 1; index < paths.length; index += 1) {
      await activateFile(app!, page, paths[index] as string)
    }
    await expect(page.locator('.tabs-container > li')).toHaveCount(8)
    const lifecycle = await page.locator('.tabs-container > li').evaluateAll((tabs) =>
      tabs.map((tab) => tab.getAttribute('data-tab-lifecycle'))
    )
    expect(lifecycle.filter((state) => state === 'active')).toHaveLength(1)
    expect(lifecycle.filter((state) => state === 'warm').length).toBeLessThanOrEqual(2)
    expect(lifecycle.filter((state) => state === 'cold').length).toBeGreaterThanOrEqual(5)

    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
      const warm = page.locator('.tabs-container > li[data-tab-lifecycle="warm"]').first()
      const cold = page.locator('.tabs-container > li[data-tab-lifecycle="cold"]').first()
      if (await warm.count() === 0 || await cold.count() === 0) {
        throw new Error('8-tab lifecycle did not expose warm and cold tabs')
      }

      const warmDuration = await measurePageAction(page, async() => {
        await warm.click()
        await expect(warm).toHaveClass(/active/)
      })
      await recordSample(page, 'tabs.8.warmSwitch', 'ms', warmDuration)
      const coldDuration = await measurePageAction(page, async() => {
        await cold.click()
        await expect(cold).toHaveClass(/active/)
      })
      await recordSample(page, 'tabs.8.coldSwitch', 'ms', coldDuration)
      const switchDuration = await measurePageAction(page, async() => {
        await page.locator('.tabs-container > li').nth((index + 1) % 8).click()
      })
      await recordSample(page, 'tabs.8.switch', 'ms', switchDuration)
      await recordSample(page, 'core.ui.action', 'ms', switchDuration)
      await recordSample(page, 'tabs.8.freeze', 'count', switchDuration > 100 ? 1 : 0)
      const inputDuration = await measureInput(page, 'tabs.8.input', index + 5000)
      await recordSample(page, 'core.input.latency', 'ms', inputDuration)
    }
  } finally {
    if (app) {
      await closeElectron(app)
      appendCapture(capture.directory, level)
    }
    fs.rmSync(root, { recursive: true, force: true })
  }
}

const collectDiagramImageSamples = async(
  level: LargeGateLevel,
  capture: CaptureDirectory
): Promise<void> => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-diagram-image-'))
  const imageData =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
  fs.writeFileSync(path.join(root, 'fixture-image.png'), Buffer.from(imageData, 'base64'))
  const diagrams = Array.from({ length: 20 }, (_, index) =>
    [
      '## Diagram ' + index,
      '',
      '![Image ' + index + '](fixture-image.png)',
      '',
      String.fromCharCode(96).repeat(3) + 'mermaid',
      'flowchart LR',
      '  Start' + index + ' --> End' + index,
      String.fromCharCode(96).repeat(3),
      ''
    ].join('\n')
  ).join('\n')
  const filePath = path.join(root, 'diagram-image.md')
  fs.writeFileSync(filePath, '# Diagram image gate\n\n' + diagrams, 'utf8')

  try {
    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
      let app: ElectronApplication | undefined
      try {
        const launched = await launchCaptured([filePath], capture, 180000)
        app = launched.app
        const { page } = launched
        await installGateProbe(page)
        await page.waitForSelector('.editor-component', { state: 'visible', timeout: 180000 })
        const editorMilestones = await readEditorMilestones(page)
        const earliestImageLoadStart = await page.evaluate(() => {
          const starts = Array.from(document.querySelectorAll('.mu-inline-image'))
            .map((wrapper) => Number(wrapper.getAttribute('data-image-load-start')))
            .filter((value) => Number.isFinite(value))
          if (starts.length === 0) {
            throw new Error('diagram image gate produced no real image-load-start milestone')
          }
          return Math.min(...starts)
        })
        const editorReadyBeforeLoad = Math.max(
          0,
          editorMilestones.timestamps.editableAt - earliestImageLoadStart
        )
        await recordSample(page, 'image.editorReadyBeforeLoad', 'ms', editorReadyBeforeLoad, 'diagram')
        const placeholderDuration = await measurePageAction(page, async() => {
          await expect(page.locator('.mu-diagram-block').first()).toBeAttached({ timeout: 180000 })
          await expect(page.locator('.mu-diagram-preview').first()).toBeAttached({ timeout: 180000 })
        })
        await recordSample(page, 'diagram.placeholder', 'ms', placeholderDuration, 'diagram')
        const firstDiagramRenderStart = Number(
          await page.locator('.mu-diagram-preview').first().getAttribute('data-diagram-first-render-start')
        )
        if (!Number.isFinite(firstDiagramRenderStart)) {
          throw new Error('diagram preview did not expose a real first-render milestone')
        }
        await recordSample(
          page,
          'diagram.firstScreenSyncRender',
          'count',
          firstDiagramRenderStart < editorMilestones.timestamps.editableAt ? 1 : 0,
          'diagram'
        )
        const imageStates = await page.locator('.mu-inline-image img').evaluateAll((images) =>
          images.map((image) => {
            const wrapper = image.closest('.mu-inline-image')
            return {
              complete: (image as HTMLImageElement).complete,
              naturalWidth: (image as HTMLImageElement).naturalWidth,
              top: (image as HTMLElement).getBoundingClientRect().top,
              lazy: wrapper?.getAttribute('data-image-lazy'),
              loadStarted: wrapper?.getAttribute('data-image-load-start')
            }
          })
        )
        const viewportHeight = page.viewportSize()?.height ?? 720
        const offscreen = imageStates.find((image) => image.top > viewportHeight)
        if (!offscreen) {
          throw new Error('diagram image gate produced no measurable offscreen image')
        }
        const offscreenLazy = offscreen.lazy === 'pending'
        await recordSample(
          page,
          'image.offscreenRequest',
          'count',
          offscreenLazy && !offscreen.loadStarted ? 0 : 1,
          'diagram'
        )
        await recordSample(
          page,
          'image.offscreenDecode',
          'count',
          offscreenLazy && !offscreen.complete && offscreen.naturalWidth <= 0 ? 0 : 1,
          'diagram'
        )
        const attempts = Number(
          await page.locator('.mu-diagram-preview').first().getAttribute('data-diagram-render-attempts') ?? '0'
        )
        await page.waitForTimeout(500)
        const attemptsAfterWait = Number(
          await page.locator('.mu-diagram-preview').first().getAttribute('data-diagram-render-attempts') ?? '0'
        )
        await recordSample(
          page,
          'diagram.errorRetry',
          'count',
          Math.max(0, attemptsAfterWait - Math.max(1, attempts)),
          'diagram'
        )
      } finally {
        if (app) {
          await closeElectron(app)
          appendCapture(capture.directory, level)
        }
      }
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

const collectCombinationSamples = async(
  level: LargeGateLevel,
  capture: CaptureDirectory,
  targetNodes: WorkspaceNodeCount = 50000,
  tabTier: MarkdownDocumentTier = '50k'
): Promise<void> => {
  const workspace = writeWorkspace(targetNodes, 5000)
  const tabPaths = writeTabSet(workspace.root, 8, tabTier)
  const comboFile = path.join(workspace.root, 'combination-2k-headings.md')
  fs.writeFileSync(comboFile, createHeadingStormFixture(2000).markdown, 'utf8')
  let app: ElectronApplication | undefined
  try {
    const launched = await launchCaptured([workspace.root, workspace.firstFile], capture, 240000)
    app = launched.app
    const { page } = launched
    await installGateProbe(page)
    await waitForWorkspaceReady(page)
    await waitForEditor(page, 240000)
    for (const filePath of tabPaths) await activateFile(app!, page, filePath)
    await activateFile(app!, page, comboFile)
    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
      const hotTabDuration = await measurePageAction(page, async() => {
        await page.locator('.tabs-container > li').nth(index % 8).click()
      })
      await recordSample(page, 'combo.hotTab', 'ms', hotTabDuration)
      await recordSample(page, 'combo.freeze', 'count', hotTabDuration > 100 ? 1 : 0)
      await activateFile(app!, page, comboFile)
      const inputDuration = await measureInput(page, undefined, index + 6000)
      await recordSample(page, 'combo.input', 'ms', inputDuration)
      await recordSample(page, 'core.input.latency', 'ms', inputDuration)
      const fps = await measureElementScrollFps(page, '.editor-component')
      await recordSample(page, 'combo.scrollFps', 'count', fps)
      const errors = await getRendererErrors(app)
      await recordSample(page, 'combo.crash', 'count', errors.length > 0 ? 1 : 0)
      await recordSample(page, 'combo.rendererHang', 'count', page.isClosed() || hotTabDuration > 100 ? 1 : 0)
    }
  } finally {
    if (app) {
      await closeElectron(app)
      appendCapture(capture.directory, level)
    }
    fs.rmSync(workspace.root, { recursive: true, force: true })
  }
}

const collectMemoryLeakSamples = async(
  level: LargeGateLevel,
  capture: CaptureDirectory
): Promise<void> => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-memory-leak-'))
  const firstPath = path.join(root, 'memory-first.md')
  const cyclePath = path.join(root, 'memory-cycle.md')
  const markdown = createMarkdownFixture('regular').markdown
  fs.writeFileSync(firstPath, markdown, 'utf8')
  fs.writeFileSync(cyclePath, markdown, 'utf8')
  let app: ElectronApplication | undefined

  try {
    const launched = await launchCaptured([firstPath], capture, 180000)
    app = launched.app
    const { page } = launched
    await waitForEditor(page, 180000)
    await collectMemoryLeakCycleSamples({
      app,
      page,
      firstPath,
      cyclePath,
      recordSample: (metric, unit, value) =>
        recordSample(page, metric, unit, value, 'memory')
    })
    await expectNoRendererErrors(app)
  } finally {
    if (app) {
      await closeElectron(app)
      appendCapture(capture.directory, level)
    }
    fs.rmSync(root, { recursive: true, force: true })
  }
}

const collectLevel = async(level: LargeGateLevel, capture: CaptureDirectory): Promise<void> => {
  clearCaptureFiles(capture.directory, level)

  if (level === 'P1') {
    await collectDocumentTier(level, '50k', capture)
    await collectDocumentTier(level, '100k', capture)
    await collectDocumentTier(level, '500k', capture)
    await collectDocumentTier(level, '1m', capture)
    await collectTreeSamples(level, 10000, 1000, capture)
    await collectTabSamples(level, capture)
    await collectMemoryFootprintSamples(level, capture)
    await collectMemoryLeakSamples(level, capture)
    assertRawCoverage(capture.directory, level)
    return
  }

  if (level === 'P3') {
    await collectDocumentTier(level, '1m', capture)
    await collectHeadingTier(level, 5000, capture)
    await collectHeadingTier(level, 10000, capture)
    await collectTreeSamples(level, 100000, 5000, capture)
    await collectTabSamples(level, capture, '100k')
    await collectDiagramImageSamples(level, capture)
    await collectCombinationSamples(level, capture, 100000, '100k')
    await collectMemoryLeakSamples(level, capture)
    assertRawCoverage(capture.directory, level)
    return
  }

  await collectDocumentTier(level, '50k', capture)
  await collectDocumentTier(level, '500k', capture)
  await collectDocumentTier(level, '1m', capture)
  await collectHeadingTier(level, 5000, capture)
  await collectHeadingTier(level, 10000, capture)
  await collectTreeSamples(level, 50000, 5000, capture)
  await collectTabSamples(level, capture)
  await collectMemoryFootprintSamples(level, capture)
  await collectDiagramImageSamples(level, capture)
  await collectCombinationSamples(level, capture)
  await collectMemoryLeakSamples(level, capture)
  assertRawCoverage(capture.directory, level)
}

test.describe('@perf-gate-large P1/P2/P3 real scenario matrix', () => {
  test.skip(!runLargeGate, 'Run with INKIVA_RUN_PERF_LARGE_GATE=true')
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(3_600_000)

  for (const level of ['P1', 'P2', 'P3'] as const) {
    test(level + ' collects real large-scenario raw samples', async() => {
      test.skip(!enabledLevels.includes(level), 'level is not selected')
      const capture = createCaptureDirectory()
      try {
        await collectLevel(level, capture)
        expect(fs.existsSync(path.join(capture.directory, getLargeGateCollectionContract(level).rawFile))).toBe(true)
      } finally {
        capture.cleanup()
      }
    })
  }
})
