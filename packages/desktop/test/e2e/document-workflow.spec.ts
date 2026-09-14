import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import {
  getMarkdownContent,
  launchElectron,
  launchWithMarkdown,
  sendIpcToRenderer,
  waitForEditor,
  waitForMenuReady,
  waitForWorkspaceReady
} from './helpers'

const readTabIds = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('.tabs-container > li')).map(
      (tab) => tab.getAttribute('data-id') ?? ''
    )
  )

const callEditorAction = (page: Page, action: string, tabId?: string): Promise<boolean> =>
  page.evaluate(
    ({ actionName, id }) => {
      const root = document.querySelector('#app') as
        | (Element & { __vue_app__?: { config?: { globalProperties?: Record<string, unknown> } } })
        | null
      const pinia = root?.__vue_app__?.config?.globalProperties?.$pinia as
        | { _s?: Map<string, Record<string, (...args: unknown[]) => unknown>> }
        | undefined
      const store = pinia?._s?.get('editor')
      if (!store || typeof store[actionName] !== 'function') return false
      if (id) {
        const tab = (store.tabs as unknown as Array<{ id: string }>).find((item) => item.id === id)
        if (!tab) return false
        store[actionName](tab)
      } else {
        store[actionName]()
      }
      return true
    },
    { actionName: action, id: tabId }
  )

const callRecentAction = (page: Page, action: string, pathname: string): Promise<boolean> =>
  page.evaluate(
    ({ actionName, value }) => {
      const root = document.querySelector('#app') as
        | (Element & { __vue_app__?: { config?: { globalProperties?: Record<string, unknown> } } })
        | null
      const pinia = root?.__vue_app__?.config?.globalProperties?.$pinia as
        | { _s?: Map<string, Record<string, (...args: unknown[]) => unknown>> }
        | undefined
      const store = pinia?._s?.get('recentDocuments')
      if (!store || typeof store[actionName] !== 'function') return false
      store[actionName](value)
      return true
    },
    { actionName: action, value: pathname }
  )

const openQuickOpen = async(app: ElectronApplication, page: Page, query: string): Promise<void> => {
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) throw new Error('No editor window')
    const modifier = process.platform === 'darwin' ? 'meta' : 'control'
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'P', modifiers: [modifier] })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'P', modifiers: [modifier] })
  })
  const input = page.locator('input.search').first()
  await expect(input).toBeVisible({ timeout: 5000 })
  await input.fill(query)
}

test.describe('Document workflow', () => {
  test('shows Recent Documents with file/folder actions', async() => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-document-workflow-recent-'))
    const filePath = path.join(root, 'recent-note.md')
    const folderPath = path.join(root, 'notes')
    fs.mkdirSync(folderPath, { recursive: true })
    fs.writeFileSync(filePath, '# Recent note\n', 'utf8')

    const launched = await launchElectron([root])
    try {
      await waitForWorkspaceReady(launched.page)
      await waitForMenuReady(launched.app)
      const list = launched.page.locator('[data-testid="recent-documents-list"]')
      await expect(list).toBeVisible()
      // Opening a project records its root folder automatically. Reset the
      // persisted list so this test covers only the explicit file/folder
      // actions below.
      expect(await callRecentAction(launched.page, 'CLEAR', '')).toBe(true)
      expect(await callRecentAction(launched.page, 'RECORD_FILE', filePath)).toBe(true)
      expect(await callRecentAction(launched.page, 'RECORD_FOLDER', folderPath)).toBe(true)

      await expect(list.locator('[data-testid="recent-document-item"]')).toHaveCount(2)
      await expect(
        list.locator('[data-testid="recent-document-item"][data-kind="folder"]')
      ).toHaveCount(1)

      const fileItem = list.locator(`[data-path="${filePath}"]`)
      await fileItem.locator('[data-testid="recent-pin"]').click()
      await expect(fileItem).toHaveAttribute('data-pinned', 'true')
      await fileItem.locator('[data-testid="recent-remove"]').click()
      await expect(list.locator('[data-testid="recent-document-item"]')).toHaveCount(1)

      await list.locator('[data-testid="recent-clear"]').click()
      await expect(list.locator('[data-testid="recent-document-item"]')).toHaveCount(0)
      await expect(list.locator('[data-testid="recent-empty"]')).toBeVisible()
    } finally {
      await launched.app.close()
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  test('orders opened Markdown files before recent and indexed files in Quick Open', async() => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-document-workflow-quick-open-'))
    const openPath = path.join(root, 'open-priority.md')
    const recentPath = path.join(root, 'recent-priority.md')
    const indexedPath = path.join(root, 'indexed-priority.md')
    for (const [pathname, body] of [
      [openPath, '# Open\n'],
      [recentPath, '# Recent\n'],
      [indexedPath, '# Indexed\n']
    ] as const) {
      fs.writeFileSync(pathname, body, 'utf8')
    }

    const launched = await launchElectron([openPath])
    try {
      await waitForEditor(launched.page)
      await waitForMenuReady(launched.app)
      expect(await callRecentAction(launched.page, 'RECORD_FILE', recentPath)).toBe(true)

      await openQuickOpen(launched.app, launched.page, 'priority')
      const results = launched.page.locator('ul.commands li')
      await expect(results.first()).toContainText('open-priority.md')
      await expect(results.nth(1)).toContainText('recent-priority.md')
      await expect(results.nth(2)).toContainText('indexed-priority.md')
    } finally {
      await launched.app.close()
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  test('pins, closes right, and reopens a closed tab without changing close semantics', async() => {
    const launched = await launchWithMarkdown('# First\n')
    try {
      await sendIpcToRenderer(launched.app, 'mt::new-untitled-tab', true, '# Second\n')
      await expect(launched.page.locator('.tabs-container > li')).toHaveCount(2)
      const ids = await readTabIds(launched.page)
      const secondId = ids[1]
      expect(secondId).toBeTruthy()

      expect(await callEditorAction(launched.page, 'TOGGLE_TAB_PIN', secondId)).toBe(true)
      await expect(launched.page.locator(`[data-id="${secondId}"]`)).toHaveAttribute(
        'data-pinned',
        'true'
      )
      await expect.poll(() => readTabIds(launched.page)).toEqual([secondId, ids[0]])

      expect(await callEditorAction(launched.page, 'CLOSE_RIGHT_TABS', secondId)).toBe(true)
      await expect.poll(() => readTabIds(launched.page)).toEqual([secondId])

      expect(await callEditorAction(launched.page, 'REOPEN_CLOSED_TAB')).toBe(true)
      await expect(launched.page.locator('.tabs-container > li')).toHaveCount(2)
      await expect.poll(() => getMarkdownContent(launched.page, launched.app)).toBe('# First\n')
    } finally {
      await launched.app.close()
    }
  })
})
