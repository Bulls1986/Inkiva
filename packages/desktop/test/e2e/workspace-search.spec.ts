import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import {
  launchElectron,
  launchWithMarkdown,
  showSidebarPanel,
  waitForMenuReady,
  waitForWorkspaceReady
} from './helpers'

const SEARCH_BUDGET_MS = 5000

const createWorkspace = (fileCount = 0): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-workspace-search-'))
  fs.mkdirSync(path.join(root, 'notes'), { recursive: true })
  fs.writeFileSync(path.join(root, 'README.md'), '# Workspace\n', 'utf-8')
  fs.writeFileSync(
    path.join(root, 'notes', 'nested-guide.md'),
    '# Nested guide\n\nneedle-target\n',
    'utf-8'
  )
  fs.writeFileSync(path.join(root, 'notes', 'other.md'), '# Other\n', 'utf-8')

  for (let index = 0; index < fileCount; index++) {
    fs.writeFileSync(
      path.join(root, 'indexed-note-' + index + '.md'),
      '# Note ' + index + '\n',
      'utf-8'
    )
  }

  return root
}

const readCurrentPath = (page: Page): Promise<string | null> =>
  page.evaluate(() => {
    const root = document.querySelector('#app') as
      | (Element & {
        __vue_app__?: {
          config?: { globalProperties?: Record<string, unknown> }
        }
      })
      | null
    const pinia = root?.__vue_app__?.config?.globalProperties?.$pinia as
      | { _s?: Map<string, { currentFile?: { pathname?: string } | null }> }
      | undefined
    return pinia?._s?.get('editor')?.currentFile?.pathname ?? null
  })

const openQuickOpen = async(page: Page, query: string): Promise<void> => {
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+P' : 'Control+P')
  const input = page.locator('input.search').first()
  await expect(input).toBeVisible({ timeout: 5000 })
  await input.fill(query)
}

const chooseCommand = async(page: Page, label: string): Promise<void> => {
  const item = page.locator('ul.commands li').filter({ hasText: label }).first()
  await expect(item).toBeVisible({ timeout: 5000 })
  await item.click()
}

test.describe('Typora-style workspace search', () => {
  let app: ElectronApplication | undefined

  test.afterEach(async() => {
    if (app) {
      await app.close().catch(() => {})
      app = undefined
    }
  })

  test('opens Ctrl/Cmd+P fuzzy results and does not duplicate an already-open document', async() => {
    const root = createWorkspace()
    const target = path.join(root, 'notes', 'nested-guide.md')
    const launched = await launchElectron([root])
    app = launched.app
    const { page } = launched
    await waitForWorkspaceReady(page)
    await waitForMenuReady(app)

    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+P' : 'Control+P')
    const quickOpenInput = page.locator('input.search').first()
    await expect(quickOpenInput).toBeVisible({ timeout: 5000 })
    // Two consecutive input events must leave only the newest request visible.
    await quickOpenInput.fill('n')
    await quickOpenInput.fill('ntgd')
    await chooseCommand(page, 'notes/nested-guide.md')
    await expect.poll(() => readCurrentPath(page), { timeout: 5000 }).toBe(target)
    await expect(page.locator('.tabs-container > li')).toHaveCount(1)

    await openQuickOpen(page, 'ntgd')
    await chooseCommand(page, 'notes/nested-guide.md')
    await expect.poll(() => readCurrentPath(page), { timeout: 5000 }).toBe(target)
    await expect(page.locator('.tabs-container > li')).toHaveCount(1)

    fs.rmSync(root, { recursive: true, force: true })
  })

  test('searches the workspace, locates a match, and refreshes after a file is added', async() => {
    const root = createWorkspace()
    const target = path.join(root, 'notes', 'nested-guide.md')
    const launched = await launchElectron([root])
    app = launched.app
    const { page } = launched
    await waitForWorkspaceReady(page)
    await waitForMenuReady(app)
    await showSidebarPanel(app, page, 'search')

    const input = page.locator('.side-bar-search input.search-input')
    await input.fill('needle-target')
    const result = page.locator('.side-bar-search .search-result-item')
    await expect(result).toHaveCount(1, { timeout: 5000 })
    await expect(result.first()).toContainText('nested-guide')

    await result.locator('.matches li').first().click()
    await expect.poll(() => readCurrentPath(page), { timeout: 5000 }).toBe(target)

    const added = path.join(root, 'added-after-search.md')
    fs.writeFileSync(added, '# Added\n\nneedle-target\n', 'utf-8')
    await expect(result).toHaveCount(2, { timeout: 7000 })
    await expect(page.locator('.side-bar-search')).toContainText('added-after-search')

    fs.rmSync(root, { recursive: true, force: true })
  })

  test('uses the current file directory when no project folder is open', async() => {
    const launched = await launchWithMarkdown('# Current file\n\nfallback-needle\n')
    app = launched.app
    const { page, filePath } = launched
    await showSidebarPanel(app, page, 'search')

    const input = page.locator('.side-bar-search input.search-input')
    await input.fill('fallback-needle')
    const result = page.locator('.side-bar-search .search-result-item')
    await expect(result).toHaveCount(1, { timeout: 5000 })
    await result.locator('.matches li').first().click()
    await expect.poll(() => readCurrentPath(page), { timeout: 5000 }).toBe(filePath)
  })

  test('keeps quick-open and full-text search within the performance budget for a large workspace', async() => {
    const root = createWorkspace(1200)
    const largeFile = path.join(root, 'large.md')
    const largeBody = Array.from({ length: 20000 }, (_, index) =>
      index === 19999 ? 'large-file-needle' : 'filler line ' + index
    ).join('\n')
    fs.writeFileSync(largeFile, largeBody, 'utf-8')

    const launched = await launchElectron([root])
    app = launched.app
    const { page } = launched
    await waitForWorkspaceReady(page)
    await waitForMenuReady(app)

    const quickOpenStarted = Date.now()
    await openQuickOpen(page, 'indexed-note-1199')
    await expect(
      page.locator('ul.commands li').filter({ hasText: 'indexed-note-1199.md' })
    ).toBeVisible({ timeout: SEARCH_BUDGET_MS })
    expect(Date.now() - quickOpenStarted).toBeLessThan(SEARCH_BUDGET_MS)
    await page.keyboard.press('Escape')

    await showSidebarPanel(app, page, 'search')
    const textSearchStarted = Date.now()
    await page.locator('.side-bar-search input.search-input').fill('large-file-needle')
    await expect(page.locator('.side-bar-search .search-result-item')).toHaveCount(1, {
      timeout: SEARCH_BUDGET_MS
    })
    expect(Date.now() - textSearchStarted).toBeLessThan(SEARCH_BUDGET_MS)

    fs.rmSync(root, { recursive: true, force: true })
  })
})
