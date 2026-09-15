import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { PerformanceSampleUnit } from '@shared/types/performance'
import { createMarkdownFixture } from '../../../../perf/gate/fixtures'
import { resolveSoakDurationMs } from '../../../../perf/soak/duration'
import {
  closeElectron,
  getRendererErrors,
  launchElectron,
  placeCaretInEditor,
  sendIpcToRenderer,
  showSidebarPanel,
  waitForEditor,
  waitForMenuReady,
  waitForWorkspaceReady
} from './helpers'

type SoakUnit = PerformanceSampleUnit

const runSoakLane = process.env.INKIVA_RUN_PERF_SOAK === 'true'
const soakDurationMs = resolveSoakDurationMs()
const tabSelector = '.tabs-container > li'
const treeRowSelector = '.tree-virtual-viewport .virtual-tree-row'
const tocLabelSelector = '.side-bar-toc [data-testid="toc-node-label"]'

interface CaptureDirectory {
  directory: string
  cleanup: () => void
}

interface SoakWorkspace {
  root: string
  documents: string[]
  watchedPath: string
}

const createCaptureDirectory = (): CaptureDirectory => {
  const configured = process.env.INKIVA_PERF_REPORT_DIR?.trim()
  if (configured) {
    const directory = path.join(configured, 'soak')
    fs.mkdirSync(directory, { recursive: true })
    return { directory, cleanup: () => {} }
  }

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-performance-soak-'))
  return {
    directory,
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true })
  }
}

const writeSoakWorkspace = (): SoakWorkspace => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-soak-workspace-'))
  const notesDirectory = path.join(root, 'notes')
  fs.mkdirSync(notesDirectory, { recursive: true })
  fs.writeFileSync(
    path.join(root, 'fixture-image.png'),
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    )
  )

  const markdown = createMarkdownFixture('50k').markdown + '\n\nsoak-needle\n'
  const documents: string[] = []
  for (let index = 0; index < 8; index += 1) {
    const filePath = path.join(root, 'soak-' + String(index) + '.md')
    fs.writeFileSync(filePath, markdown, 'utf8')
    documents.push(filePath)
  }

  // Keep the long-lived workspace above the renderer's 300-row
  // virtualization threshold so the soak exercises the bounded tree DOM.
  for (let index = 0; index < 320; index += 1) {
    fs.writeFileSync(
      path.join(root, 'tree-note-' + String(index).padStart(4, '0') + '.md'),
      '# Tree note ' + String(index) + '\n\nworkspace-soak\n',
      'utf8'
    )
  }

  const watchedPath = path.join(root, 'a-watched-later.md')
  fs.writeFileSync(watchedPath, '# watcher baseline\\n', 'utf8')

  return {
    root,
    documents,
    watchedPath
  }
}

const readCurrentPath = async(page: Page): Promise<string | null> =>
  page.evaluate(() => {
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

const readDocument = (filePath: string): string =>
  fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''

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
  const startedAt = await page.evaluate(() => performance.now())
  await action()
  await waitForPaint(page)
  const endedAt = await page.evaluate(() => performance.now())
  return Math.max(0, endedAt - startedAt)
}

const recordSample = async(
  page: Page,
  metric: string,
  unit: SoakUnit,
  value: number,
  phase: 'startup' | 'document-open' | 'editor' | 'diagram' | 'search' | 'autosave' | 'memory' = 'editor'
): Promise<void> => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('invalid soak sample for ' + metric)
  }
  const recorded = await page.evaluate(
    ({ metricName, metricUnit, metricValue, metricPhase }) => {
      const bridge = window.__inkivaPerformanceGate
      if (!bridge) return false
      bridge.recordSample(metricName, metricUnit, metricValue, {
        phase: metricPhase,
        metadata: { collector: 'eight-hour-soak' }
      })
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

const waitForTreePath = async(page: Page, expectedPath: string): Promise<void> => {
  await page.waitForFunction(
    (candidatePath) => {
      const normalize = (value: string): string => value.replaceAll('\\', '/')
      const expected = normalize(candidatePath)
      return Array.from(document.querySelectorAll('[data-path]')).some((element) => {
        const actual = element.getAttribute('data-path')
        return actual !== null && normalize(actual) === expected
      })
    },
    expectedPath,
    { timeout: 60000 }
  )
}

const assertHealthy = async(
  app: ElectronApplication,
  page: Page
): Promise<void> => {
  if (page.isClosed() || app.process().killed) {
    throw new Error('desktop soak process or renderer exited during the foreground loop')
  }
  const errors = await getRendererErrors(app)
  if (errors.length > 0) {
    const summary = errors
      .map((error) => (error.name ?? 'Error') + ': ' + (error.message ?? ''))
      .join('\n')
    throw new Error('desktop soak captured renderer errors:\n' + summary)
  }
}

const openDocument = async(
  app: ElectronApplication,
  page: Page,
  filePath: string
): Promise<number> => {
  const duration = await measurePageAction(page, async() => {
    await sendIpcToRenderer(app, 'mt::open-file', filePath, {})
    await expect.poll(() => readCurrentPath(page), { timeout: 60000 }).toBe(filePath)
    await page.waitForSelector('.editor-component', { state: 'attached', timeout: 60000 })
  })
  return duration
}

const saveDocument = async(
  app: ElectronApplication,
  page: Page,
  filePath: string,
  token: string
): Promise<number> => {
  return await measurePageAction(page, async() => {
    await sendIpcToRenderer(app, 'mt::editor-ask-file-save')
    await expect
      .poll(() => readDocument(filePath), { timeout: 60000 })
      .toContain(token)
  })
}

const undoDocument = async(
  app: ElectronApplication,
  page: Page,
  filePath: string,
  token: string
): Promise<number> => {
  const duration = await measurePageAction(page, async() => {
    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'undo')
    await waitForPaint(page)
    await sendIpcToRenderer(app, 'mt::editor-ask-file-save')
    await expect
      .poll(() => readDocument(filePath), { timeout: 60000 })
      .not.toContain(token)
  })
  return duration
}

const exerciseSearch = async(
  app: ElectronApplication,
  page: Page
): Promise<number> => {
  await showSidebarPanel(app, page, 'search')
  const input = page.locator('.side-bar-search input.search-input')
  const result = page.locator('.side-bar-search .search-result-item').first()
  const duration = await measurePageAction(page, async() => {
    await input.fill('soak-needle')
    await expect(result).toBeVisible({ timeout: 60000 })
  })
  await input.fill('')
  return duration
}

const exerciseOutline = async(
  app: ElectronApplication,
  page: Page
): Promise<number> => {
  await showSidebarPanel(app, page, 'toc')
  const labels = page.locator(tocLabelSelector)
  await expect(labels.first()).toBeVisible({ timeout: 60000 })
  return await measurePageAction(page, async() => {
    await labels.last().click()
  })
}

const exerciseTree = async(
  app: ElectronApplication,
  page: Page
): Promise<number> => {
  await showSidebarPanel(app, page, 'files')
  const viewport = page.locator('.tree-virtual-viewport')
  await expect(viewport).toBeVisible({ timeout: 60000 })
  return await measurePageAction(page, async() => {
    await viewport.evaluate((element) => {
      const target = element as HTMLElement
      const maximum = Math.max(0, target.scrollHeight - target.clientHeight)
      target.scrollTop = maximum > 0 ? (target.scrollTop + 180) % (maximum + 1) : 0
      target.dispatchEvent(new Event('scroll'))
    })
  })
}

const exerciseDiagram = async(page: Page): Promise<number> =>
  await measurePageAction(page, async() => {
    await expect(page.locator('.mu-diagram-block').first()).toBeAttached({ timeout: 60000 })
  })

const runSoak = async(
  app: ElectronApplication,
  page: Page,
  workspace: SoakWorkspace
): Promise<number> => {
  await showSidebarPanel(app, page, 'files')
  await expect(page.locator(treeRowSelector).first()).toBeVisible({ timeout: 60000 })

  fs.writeFileSync(workspace.watchedPath, '# watcher start\n', 'utf8')
  await waitForTreePath(page, workspace.watchedPath)

  const initialOutline = await exerciseOutline(app, page)
  await recordSample(page, 'soak.outline', 'ms', initialOutline, 'document-open')
  const initialDiagram = await exerciseDiagram(page)
  await recordSample(page, 'soak.diagram', 'ms', initialDiagram, 'diagram')
  const initialSearch = await exerciseSearch(app, page)
  await recordSample(page, 'soak.search', 'ms', initialSearch, 'search')
  const initialTree = await exerciseTree(app, page)
  await recordSample(page, 'soak.tree', 'ms', initialTree, 'editor')

  for (let index = 1; index < workspace.documents.length; index += 1) {
    const openDuration = await openDocument(app, page, workspace.documents[index] as string)
    await recordSample(page, 'soak.open50k', 'ms', openDuration, 'document-open')
  }
  await expect(page.locator(tabSelector)).toHaveCount(workspace.documents.length, { timeout: 60000 })

  const startedAt = Date.now()
  let cycles = 0
  while (Date.now() - startedAt < soakDurationMs) {
    const targetIndex = cycles % workspace.documents.length
    const targetPath = workspace.documents[targetIndex] as string
    const switchDuration = await measurePageAction(page, async() => {
      await page.locator(tabSelector).nth(targetIndex).click()
      await expect(page.locator(tabSelector).nth(targetIndex)).toHaveClass(/active/)
      await expect.poll(() => readCurrentPath(page), { timeout: 60000 }).toBe(targetPath)
    })
    await recordSample(page, 'soak.tabSwitch', 'ms', switchDuration, 'editor')

    await placeCaretInEditor(page)
    const token = 'inkiva-soak-cycle-' + String(cycles)
    const inputDuration = await measurePageAction(page, async() => {
      await page.keyboard.insertText(token)
    })
    await recordSample(page, 'soak.inputAction', 'ms', inputDuration, 'editor')
    const saveDuration = await saveDocument(app, page, targetPath, token)
    await recordSample(page, 'soak.save', 'ms', saveDuration, 'autosave')
    const undoDuration = await undoDocument(app, page, targetPath, token)
    await recordSample(page, 'soak.undo', 'ms', undoDuration, 'editor')

    if (cycles % 3 === 0) {
      const outlineDuration = await exerciseOutline(app, page)
      await recordSample(page, 'soak.outline', 'ms', outlineDuration, 'document-open')
    }
    if (cycles % 5 === 0) {
      const searchDuration = await exerciseSearch(app, page)
      await recordSample(page, 'soak.search', 'ms', searchDuration, 'search')
    }
    if (cycles % 7 === 0) {
      fs.writeFileSync(
        workspace.watchedPath,
        '# watcher cycle ' + String(cycles) + '\n',
        'utf8'
      )
      await page.waitForTimeout(100)
      const treeDuration = await exerciseTree(app, page)
      await recordSample(page, 'soak.tree', 'ms', treeDuration, 'editor')
    }
    if (cycles % 11 === 0) {
      const diagramDuration = await exerciseDiagram(page)
      await recordSample(page, 'soak.diagram', 'ms', diagramDuration, 'diagram')
    }

    await assertHealthy(app, page)
    cycles += 1
    await page.waitForTimeout(100)
  }

  if (cycles < 20) {
    throw new Error('desktop soak completed fewer than 20 foreground cycles')
  }
  await recordSample(page, 'soak.durationMs', 'ms', Date.now() - startedAt, 'memory')
  await recordSample(page, 'soak.cycles', 'count', cycles, 'memory')
  await assertHealthy(app, page)
  return cycles
}

test.describe('@perf-soak eight-hour desktop stability gate', () => {
  test.skip(!runSoakLane, 'Run with INKIVA_RUN_PERF_SOAK=true')
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(soakDurationMs + 30 * 60 * 1000)

  test('keeps edit, save, navigation, watcher, and diagram paths alive for the full mode duration', async() => {
    const capture = createCaptureDirectory()
    const workspace = writeSoakWorkspace()
    let app: ElectronApplication | undefined
    try {
      const launched = await launchElectron([workspace.root, workspace.documents[0] as string], {
        suppressErrorDialog: true,
        waitForReady: false,
        waitForEditorTimeout: 180000,
        env: {
          INKIVA_PERF_CAPTURE: 'true',
          INKIVA_PERF_REPORT_DIR: capture.directory,
          INKIVA_PERF_SAMPLE_INTERVAL_MS: '1000',
          INKIVA_PERF_OFFLINE: 'true',
          INKIVA_RUN_PERF_SOAK: 'true'
        }
      })
      app = launched.app
      const { page } = launched
      await waitForWorkspaceReady(page)
      await waitForEditor(page, 180000)
      await waitForMenuReady(app)
      await runSoak(app, page, workspace)
    } finally {
      if (app) await closeElectron(app)
      fs.rmSync(workspace.root, { recursive: true, force: true })
      capture.cleanup()
    }
  })
})
