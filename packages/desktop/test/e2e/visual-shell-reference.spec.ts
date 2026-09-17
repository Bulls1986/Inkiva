import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchWithMarkdown } from './helpers'

const readShellMetrics = async(page: Page) =>
  page.evaluate(() => {
    const box = (
      selector: string
    ): { top: number; left: number; right: number; bottom: number; height: number } | null => {
      const element = document.querySelector(selector)
      if (!element) return null
      const { top, left, right, bottom, height } = element.getBoundingClientRect()
      return { top, left, right, bottom, height }
    }

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      titleBar: box('.title-bar-editor-bg'),
      tabsRow: box('[data-testid="document-tabs-row"]'),
      tabs: box('[data-testid="document-tabs"]'),
      workspace: box('.editor-workspace'),
      sidebar: box('.side-bar'),
      editorMiddle: box('.editor-middle'),
      tabsInsideEditor: !!document.querySelector('.editor-middle [data-testid="document-tabs-row"]')
    }
  })

test.describe('reference application shell', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# Reference shell\n\nA calm writing surface.\n')
    app = launched.app
    page = launched.page
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('aligns the document tabs with the sidebar navigation inside the workspace', async() => {
    await expect(page.locator('[data-testid="document-tabs-row"]')).toBeVisible()
    await expect(page.locator('[data-testid="document-tabs"]')).toBeVisible()

    const metrics = await readShellMetrics(page)
    expect(metrics.titleBar).not.toBeNull()
    expect(metrics.tabsRow).not.toBeNull()
    expect(metrics.tabs).not.toBeNull()
    expect(metrics.workspace).not.toBeNull()
    expect(metrics.sidebar).not.toBeNull()
    expect(metrics.editorMiddle).not.toBeNull()
    expect(metrics.tabsInsideEditor).toBe(true)

    const { titleBar, tabsRow, workspace, sidebar, editorMiddle } = metrics
    if (!titleBar || !tabsRow || !workspace || !sidebar || !editorMiddle) {
      throw new Error('Reference shell metrics are incomplete')
    }

    expect(tabsRow.top).toBeGreaterThanOrEqual(titleBar.bottom - 1)
    expect(tabsRow.bottom).toBeLessThanOrEqual(workspace.bottom + 1)
    expect(tabsRow.left).toBeGreaterThanOrEqual(editorMiddle.left - 1)
    expect(tabsRow.right).toBeGreaterThanOrEqual(metrics.viewport.width - 1)
    expect(sidebar.top).toBeGreaterThanOrEqual(titleBar.bottom - 1)
    expect(editorMiddle.top).toBeGreaterThanOrEqual(titleBar.bottom - 1)
    expect(tabsRow.top).toBeGreaterThanOrEqual(sidebar.top - 1)
    expect(tabsRow.top).toBeLessThanOrEqual(sidebar.top + 1)
    expect(workspace.top).toBeLessThanOrEqual(sidebar.top + 1)
  })

  test('keeps the writing surface free of a permanent code-editor status frame', async() => {
    await expect(page.locator('[data-testid="command-launcher"]')).toBeVisible()
    await expect(page.locator('.editor-component .mu-container')).toBeVisible()
    expect(await page.locator('.status-bar, [data-testid="status-bar"]').count()).toBe(0)
  })
})
