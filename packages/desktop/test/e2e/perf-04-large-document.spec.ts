import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { performance } from 'node:perf_hooks'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  closeElectron,
  expectNoRendererErrors,
  launchElectron,
  placeCaretInEditor,
  sendIpcToRenderer,
  waitForEditor,
  waitForMenuReady
} from './helpers'
import {
  createLargeDocumentFixture,
  standardLargeDocumentFixtures,
  type LargeDocumentFixture
} from '../performance/fixtures'

type LongTaskEntry = { duration: number; startTime: number }

type OperationMetric = {
  name: string
  durationMs: number
  longTasksOver50Ms: LongTaskEntry[]
}

type FixtureMetric = {
  kind: LargeDocumentFixture['kind']
  bytes: number
  openMs: number
  operations: OperationMetric[]
}

type PerformanceState = {
  longTasks: LongTaskEntry[]
  observer?: PerformanceObserver
}

const runPerformanceLane = process.env.INKIVA_RUN_PERF === 'true'
const typingMarker = 'INKIVA_UNIQUE_PERF_EDIT_MARKER'
const pasteMarker = 'INKIVA_UNIQUE_PERF_PASTE_MARKER'

const tempDirectory = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-perf-04-'))

const writeFixture = (directory: string, fixture: LargeDocumentFixture): string => {
  const filename = path.join(directory, `${fixture.kind}.md`)
  fs.writeFileSync(filename, fixture.markdown, 'utf8')
  return filename
}

const installLongTaskProbe = async(page: Page): Promise<void> => {
  await page.evaluate(() => {
    const state = globalThis as typeof globalThis & { __inkiva_perf_04__?: PerformanceState }
    if (state.__inkiva_perf_04__) return

    const longTasks: LongTaskEntry[] = []
    const observer =
      typeof PerformanceObserver === 'undefined'
        ? undefined
        : new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            longTasks.push({ duration: entry.duration, startTime: entry.startTime })
          }
        })

    try {
      observer?.observe({ entryTypes: ['longtask'] })
    } catch {
      // Older Chromium builds may not expose longtask entries. The benchmark
      // still reports operation timings in that environment.
    }
    state.__inkiva_perf_04__ = { longTasks, observer }
  })
}

const readLongTasks = async(page: Page, startIndex: number): Promise<LongTaskEntry[]> =>
  await page.evaluate((index) => {
    const state = (
      globalThis as typeof globalThis & {
        __inkiva_perf_04__?: PerformanceState
      }
    ).__inkiva_perf_04__
    return state?.longTasks.slice(index) ?? []
  }, startIndex)

const waitForPaint = async(page: Page): Promise<void> => {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
  )
}

const readEditorText = (page: Page): Promise<string> =>
  page.evaluate(() => document.querySelector('.editor-component')?.textContent ?? '')

const measureOperation = async(
  page: Page,
  name: string,
  operation: () => Promise<void>
): Promise<OperationMetric> => {
  const before = await page.evaluate(() => {
    const state = (
      globalThis as typeof globalThis & {
        __inkiva_perf_04__?: PerformanceState
      }
    ).__inkiva_perf_04__
    return state?.longTasks.length ?? 0
  })
  const start = performance.now()
  await operation()
  await waitForPaint(page)
  const durationMs = performance.now() - start
  const longTasksOver50Ms = (await readLongTasks(page, before)).filter(
    (entry) => entry.duration > 50
  )
  return { name, durationMs, longTasksOver50Ms }
}

const runFixture = async(fixture: LargeDocumentFixture): Promise<FixtureMetric> => {
  const directory = tempDirectory()
  const filename = writeFixture(directory, fixture)
  let app: ElectronApplication | undefined

  try {
    const openStart = performance.now()
    const launched = await launchElectron([filename], {
      suppressErrorDialog: true,
      waitForReady: false,
      waitForEditorTimeout: 120000
    })
    app = launched.app
    const { page } = launched
    await waitForEditor(page, 120000)
    await waitForMenuReady(launched.app)
    const openMs = performance.now() - openStart
    await installLongTaskProbe(page)
    await placeCaretInEditor(page)

    const operations: OperationMetric[] = []
    operations.push(
      await measureOperation(page, 'typing', async() => {
        await page.keyboard.insertText(typingMarker)
        await expect.poll(() => readEditorText(page), { timeout: 30000 }).toContain(typingMarker)
      })
    )

    operations.push(
      await measureOperation(page, 'undo', async() => {
        await sendIpcToRenderer(launched.app, 'mt::editor-edit-action', 'undo')
        await expect
          .poll(() => readEditorText(page), { timeout: 30000 })
          .not.toContain(typingMarker)
      })
    )

    operations.push(
      await measureOperation(page, 'redo', async() => {
        await sendIpcToRenderer(launched.app, 'mt::editor-edit-action', 'redo')
        await expect.poll(() => readEditorText(page), { timeout: 30000 }).toContain(typingMarker)
      })
    )

    operations.push(
      await measureOperation(page, 'paste', async() => {
        await page.evaluate((value) => {
          const target = document.querySelector('.editor-component span.mu-paragraph-content')
          if (!target) throw new Error('editor content target not found')
          const dataTransfer = new DataTransfer()
          dataTransfer.setData('text/plain', value)
          target.dispatchEvent(
            new ClipboardEvent('paste', {
              clipboardData: dataTransfer,
              bubbles: true,
              cancelable: true
            })
          )
        }, pasteMarker)
        await expect.poll(() => readEditorText(page), { timeout: 30000 }).toContain(pasteMarker)
      })
    )

    operations.push(
      await measureOperation(page, 'search', async() => {
        await sendIpcToRenderer(launched.app, 'mt::editor-edit-action', 'find')
        const input = page.locator('.search-bar .search input')
        await expect(input).toBeVisible({ timeout: 10000 })
        await input.fill('Paragraph')
        await expect(page.locator('.search-bar .search-result')).not.toHaveText('0 / 0', {
          timeout: 30000
        })
        await page.keyboard.press('Escape')
        await expect(page.locator('.search-bar')).toBeHidden({ timeout: 10000 })
      })
    )

    operations.push(
      await measureOperation(page, 'scroll', async() => {
        await page.evaluate(() => {
          const editor = document.querySelector('.editor-component') as HTMLElement | null
          if (!editor) throw new Error('editor container not found')
          editor.scrollTop = editor.scrollHeight
          editor.dispatchEvent(new Event('scroll'))
        })
      })
    )

    operations.push(
      await measureOperation(page, 'save', async() => {
        await sendIpcToRenderer(launched.app, 'mt::editor-ask-file-save')
        await expect
          .poll(() => (fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8') : ''), {
            timeout: 30000
          })
          .toContain(typingMarker)
        await expect
          .poll(() => (fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8') : ''), {
            timeout: 30000
          })
          .toContain(pasteMarker)
      })
    )

    await expectNoRendererErrors(launched.app)
    return { kind: fixture.kind, bytes: fixture.bytes, openMs, operations }
  } finally {
    if (app) await closeElectron(app)
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

test.describe('@perf PERF-04 large-document performance', () => {
  test.skip(!runPerformanceLane, 'Run with INKIVA_RUN_PERF=true')
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(180000)

  test('reports open and edit-path timings for all standard size tiers', async() => {
    const fixtures = standardLargeDocumentFixtures()
    const metrics: FixtureMetric[] = []
    for (const fixture of fixtures) metrics.push(await runFixture(fixture))

    await test.info().attach('perf-04-large-document.json', {
      body: JSON.stringify(
        {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          platform: process.platform,
          node: process.version,
          metrics
        },
        null,
        2
      ),
      contentType: 'application/json'
    })

    expect(metrics).toHaveLength(3)
    expect(metrics.every(({ openMs, operations }) => openMs > 0 && operations.length === 7)).toBe(
      true
    )
  })

  test('keeps extreme fixture shapes available for focused runs', async() => {
    const shapes = [
      'long-paragraph',
      'huge-table',
      'deep-lists',
      'many-headings',
      'many-code-blocks',
      'many-images',
      'many-diagrams'
    ] as const
    for (const kind of shapes) {
      const fixture = createLargeDocumentFixture(kind)
      expect(fixture.bytes).toBeGreaterThan(0)
      expect(fixture.markers).toHaveLength(1)
    }
  })
})
