import type { CDPSession, ElectronApplication, Page } from 'playwright'
import {
  evaluateMemoryLeakSeries,
  createMemoryLeakCyclePlan,
  MEMORY_LEAK_LONG_WINDOW_SIZE,
  type MemoryLeakSeriesEvaluation,
  type MemoryLeakSeriesOptions
} from '../../../../perf/gate/memory'
import { placeCaretInEditor, sendIpcFromRenderer, sendIpcToRenderer } from './helpers'

export type MemoryLeakSampleUnit = 'bytes' | 'count' | 'ratio'

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
  /** Override the number of open/edit/switch/close cycles for a bounded profile. */
  cycleCount?: number
  /** Run setup cycles before collecting the measured heap series. */
  warmupCycleCount?: number
  /** Override the evaluation windows while preserving the default long-gate profile. */
  evaluationOptions?: MemoryLeakSeriesOptions
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
        (tab) => tab.getAttribute('title') === expectedPath && tab.classList.contains('active')
      ),
    pathname,
    { timeout: 30_000 }
  )
}

export const readUsedHeapSize = async(client: CDPSession): Promise<number> => {
  const usage = (await client.send('Runtime.getHeapUsage')) as { usedSize?: unknown }
  const value = usage.usedSize
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('renderer V8 heap usage is unavailable for the memory leak gate')
  }
  return value
}

export const collectGarbage = async(client: CDPSession): Promise<void> => {
  try {
    await client.send('HeapProfiler.collectGarbage')
  } catch (error) {
    throw new Error(
      'renderer garbage collection could not be requested for the memory leak gate: ' +
        (error instanceof Error ? error.message : String(error))
    )
  }
}

export interface RendererHeapSampler {
  sample: () => Promise<number>
  dispose: () => Promise<void>
}

export const createRendererHeapSampler = async(page: Page): Promise<RendererHeapSampler> => {
  const client = await page.context().newCDPSession(page)
  try {
    await client.send('HeapProfiler.enable')
  } catch (error) {
    try {
      await client.detach()
    } catch {
      // Best-effort cleanup after an unavailable CDP heap profiler.
    }
    throw new Error(
      'renderer heap profiler could not be enabled for the memory footprint gate: ' +
        (error instanceof Error ? error.message : String(error))
    )
  }

  let disposed = false
  return {
    sample: async() => {
      if (disposed) throw new Error('renderer heap sampler is already disposed')
      await collectGarbage(client)
      return await readUsedHeapSize(client)
    },
    dispose: async() => {
      if (disposed) return
      disposed = true
      try {
        await client.send('HeapProfiler.disable')
      } catch {
        // The session may already be closed while the app is shutting down.
      }
      try {
        await client.detach()
      } catch {
        // CDP cleanup is best effort after the samples are recorded.
      }
    }
  }
}

const openEditSwitchClose = async(
  app: ElectronApplication,
  page: Page,
  firstPath: string,
  cyclePath: string,
  index: number
): Promise<void> => {
  await sendIpcFromRenderer(page, 'mt::open-file', cyclePath, {})
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
          candidate.getAttribute('title') === expectedPath && candidate.classList.contains('active')
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
  const { app, page, firstPath, cyclePath, recordSample, evaluationOptions = {} } = options
  const heapSamples: number[] = []
  const sampler = await createRendererHeapSampler(page)

  try {
    const longWindowSize = Math.floor(
      evaluationOptions.longWindowSize ?? MEMORY_LEAK_LONG_WINDOW_SIZE
    )
    const cyclePlan = createMemoryLeakCyclePlan({
      longWindowSize,
      cycleCount: options.cycleCount,
      warmupCycleCount: options.warmupCycleCount
    })
    for (let index = 0; index < cyclePlan.warmupCycleCount; index += 1) {
      await openEditSwitchClose(app, page, firstPath, cyclePath, index)
    }
    for (let index = 0; index < cyclePlan.measuredCycleCount; index += 1) {
      await openEditSwitchClose(app, page, firstPath, cyclePath, cyclePlan.warmupCycleCount + index)
      heapSamples.push(await sampler.sample())

      if (heapSamples.length < longWindowSize) continue
      const evaluation = evaluateMemoryLeakSeries(heapSamples, evaluationOptions)
      await recordSample('memory.heapGrowth50', 'ratio', Math.max(0, evaluation.growth50Ratio))
      await recordSample('memory.heapLinearGrowth', 'count', evaluation.linearGrowth50 ? 1 : 0)
      await recordSample('memory.heapLinearGrowth200', 'count', evaluation.linearGrowth200 ? 1 : 0)
    }

    return evaluateMemoryLeakSeries(heapSamples, evaluationOptions)
  } finally {
    await sampler.dispose()
  }
}
