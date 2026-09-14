import type { CDPSession, ElectronApplication, Page } from 'playwright'
import {
  evaluateMemoryLeakSeries,
  MEMORY_LEAK_LONG_WINDOW_SIZE,
  MEMORY_LEAK_SAMPLE_COUNT,
  type MemoryLeakSeriesEvaluation
} from '../../../../perf/gate/memory'
import { placeCaretInEditor, sendIpcToRenderer } from './helpers'

export type MemoryLeakSampleUnit = 'count' | 'ratio'

export type MemoryLeakSampleRecorder = (
  metric: string,
  unit: MemoryLeakSampleUnit,
  value: number
) => Promise<void>

export interface MemoryLeakCycleOptions {
  app: ElectronApplication
  page: Page
  firstPath: string
  cyclePath: string
  recordSample: MemoryLeakSampleRecorder
}

const waitForPaint = async(page: Page): Promise<void> => {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
  )
}

const waitForActiveTab = async(page: Page, pathname: string): Promise<void> => {
  await page.waitForFunction(
    (expectedPath) =>
      Array.from(document.querySelectorAll('.tabs-container > li')).some(
        (tab) =>
          tab.getAttribute('title') === expectedPath &&
          tab.classList.contains('active')
      ),
    pathname,
    { timeout: 30_000 }
  )
}

const readUsedHeapSize = async(page: Page): Promise<number> => {
  const value = await page.evaluate(() => {
    const memory = (
      performance as Performance & {
        memory?: { usedJSHeapSize?: unknown }
      }
    ).memory
    return memory?.usedJSHeapSize
  })
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('renderer usedJSHeapSize is unavailable for the memory leak gate')
  }
  return value
}

const collectGarbage = async(client: CDPSession): Promise<void> => {
  try {
    await client.send('HeapProfiler.collectGarbage')
  } catch (error) {
    throw new Error(
      'renderer garbage collection could not be requested for the memory leak gate: ' +
        (error instanceof Error ? error.message : String(error))
    )
  }
}

const openEditSwitchClose = async(
  app: ElectronApplication,
  page: Page,
  firstPath: string,
  cyclePath: string,
  index: number
): Promise<void> => {
  await sendIpcToRenderer(app, 'mt::open-file', cyclePath, {})
  await waitForActiveTab(page, cyclePath)
  await page.waitForFunction(
    () => document.querySelectorAll('.tabs-container > li').length === 2,
    null,
    { timeout: 10_000 }
  )

  await placeCaretInEditor(page)
  await page.keyboard.insertText('inkiva-memory-cycle-' + String(index))
  await waitForPaint(page)
  await sendIpcToRenderer(app, 'mt::editor-edit-action', 'undo')
  await waitForPaint(page)

  await page.waitForFunction(
    (expectedPath) => {
      const tab = Array.from(document.querySelectorAll('.tabs-container > li')).find(
        (candidate) =>
          candidate.getAttribute('title') === expectedPath &&
          candidate.classList.contains('active')
      )
      return tab != null && !tab.classList.contains('unsaved')
    },
    cyclePath,
    { timeout: 10_000 }
  )

  await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 0)
  await waitForActiveTab(page, firstPath)
  const cycleTab = page.locator('.tabs-container > li').nth(1)
  await cycleTab.locator('.close-icon').click({ force: true })
  await page.waitForFunction(
    (expectedPath) =>
      !Array.from(document.querySelectorAll('.tabs-container > li')).some(
        (tab) => tab.getAttribute('title') === expectedPath
      ),
    cyclePath,
    { timeout: 10_000 }
  )
}

export const collectMemoryLeakCycleSamples = async(
  options: MemoryLeakCycleOptions
): Promise<MemoryLeakSeriesEvaluation> => {
  const { app, page, firstPath, cyclePath, recordSample } = options
  const client = await page.context().newCDPSession(page)
  const heapSamples: number[] = []

  try {
    await client.send('HeapProfiler.enable')
    const cycleCount = MEMORY_LEAK_LONG_WINDOW_SIZE + MEMORY_LEAK_SAMPLE_COUNT - 1
    for (let index = 0; index < cycleCount; index += 1) {
      await openEditSwitchClose(app, page, firstPath, cyclePath, index)
      await collectGarbage(client)
      heapSamples.push(await readUsedHeapSize(page))

      if (heapSamples.length < MEMORY_LEAK_LONG_WINDOW_SIZE) continue
      const evaluation = evaluateMemoryLeakSeries(heapSamples)
      await recordSample(
        'memory.heapGrowth50',
        'ratio',
        Math.max(0, evaluation.growth50Ratio)
      )
      await recordSample(
        'memory.heapLinearGrowth',
        'count',
        evaluation.linearGrowth50 ? 1 : 0
      )
      await recordSample(
        'memory.heapLinearGrowth200',
        'count',
        evaluation.linearGrowth200 ? 1 : 0
      )
    }

    return evaluateMemoryLeakSeries(heapSamples)
  } finally {
    try {
      await client.send('HeapProfiler.disable')
    } catch {
      // The session is detached immediately below; cleanup is best effort.
    }
    await client.detach()
  }
}
