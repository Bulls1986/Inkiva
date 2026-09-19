import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'

import {
  clearRendererErrors,
  expectNoRendererErrors,
  launchWithMarkdown,
  sendIpcToRenderer
} from './helpers'

const BLOCK_COUNT = 420

const buildDocument = (): string =>
  Array.from({ length: BLOCK_COUNT }, (_, index) => `paragraph ${index} daily-edit-regression`).join(
    '\n\n'
  ) + '\n'

const readStoreMarkdown = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const root = document.querySelector('#app') as
      | (Element & {
        __vue_app__?: { config?: { globalProperties?: Record<string, unknown> } }
      })
      | null
    const pinia = root?.__vue_app__?.config?.globalProperties?.$pinia as
      | { _s?: Map<string, { currentFile?: { markdown?: string } | null }> }
      | undefined
    return pinia?._s?.get('editor')?.currentFile?.markdown ?? ''
  })

const scrollToRatio = async(page: Page, ratio: number): Promise<void> => {
  await page.locator('.editor-component').evaluate((node, targetRatio) => {
    const editor = node as HTMLElement
    editor.scrollTop = Math.max(0, (editor.scrollHeight - editor.clientHeight) * targetRatio)
    editor.dispatchEvent(new Event('scroll'))
  }, ratio)
  await expect
    .poll(
      () =>
        page
          .locator('.editor-component')
          .evaluate((node) => (node as HTMLElement).scrollTop),
      { timeout: 5000 }
    )
    .toBeGreaterThan(0)
}

const readScrollPosition = (
  page: Page
): Promise<{ top: number; max: number }> =>
  page.locator('.editor-component').evaluate((node) => {
    const editor = node as HTMLElement
    return {
      top: editor.scrollTop,
      max: Math.max(0, editor.scrollHeight - editor.clientHeight)
    }
  })

const pressNativeUndo = async(app: ElectronApplication): Promise<void> => {
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win || win.isDestroyed()) throw new Error('No focused editor window found')
    const modifier = process.platform === 'darwin' ? 'meta' : 'control'
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Z', modifiers: [modifier] })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Z', modifiers: [modifier] })
  })
}

test.describe('@virtualization-core virtualization selection + history daily regressions', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeEach(async() => {
    const launched = await launchWithMarkdown(buildDocument(), {
      filename: 'virtualization-selection-history.md',
      suppressErrorDialog: true,
      waitForEditorTimeout: 30000
    })
    app = launched.app
    page = launched.page
    await clearRendererErrors(app)
  })

  test.afterEach(async() => {
    if (app) await app.close()
  })

  test('SEL-012/COMBO-001: mouse drag selection then click elsewhere never throws a renderer/Range error', async() => {
    const paragraphs = page.locator('.mu-paragraph-content')
    await expect(paragraphs.first()).toBeVisible()
    await expect.poll(() => paragraphs.count()).toBeGreaterThanOrEqual(8)

    const clickAway = await paragraphs.nth(2).boundingBox()
    expect(clickAway).not.toBeNull()
    if (!clickAway) throw new Error('visible paragraph bounds are unavailable')

    // Use Chromium's real pointer-driven word selection. Headless mouse-drag
    // selection across contenteditable spans is not stable across platforms,
    // while double-click creates the same live DOM Range through the browser's
    // native selection path. Cross-block logical selection is covered by
    // virtualization-core.spec.ts.
    await paragraphs.nth(0).dblclick()

    await expect
      .poll(() =>
        page.evaluate(() => {
          const selection = document.getSelection()
          return selection ? selection.toString().length : 0
        })
      )
      .toBeGreaterThan(0)

    await page.mouse.click(clickAway.x + 12, clickAway.y + clickAway.height / 2)
    await expect
      .poll(() =>
        page.evaluate(() => {
          const selection = document.getSelection()
          return selection ? selection.isCollapsed : true
        })
      )
      .toBe(true)

    await page.keyboard.type(' after-click', { delay: 0 })
    await expect.poll(() => readStoreMarkdown(page)).toContain('after-click')
    await expectNoRendererErrors(app)
  })

  test('HIST-001/COMBO-002: edit, scroll away, native Ctrl/Cmd+Z restores content without snapping back to the edit block', async() => {
    const editIndex = 180
    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'find')
    const findInput = page.locator('.search-bar .search input')
    await expect(findInput).toBeVisible()
    await findInput.fill(`paragraph ${editIndex} daily-edit-regression`)
    await expect(page.locator('.search-result')).toContainText('1 / 1', { timeout: 8000 })
    const target = page.locator('.mu-highlight').first()
    await expect(target).toBeVisible({ timeout: 8000 })
    await page.keyboard.press('Escape')

    const paragraph = page
      .locator('.mu-paragraph-content')
      .filter({ hasText: new RegExp(`^paragraph ${editIndex} daily-edit-regression$`) })
      .first()
    await expect(paragraph).toBeVisible()
    await paragraph.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' EDITED', { delay: 0 })
    await expect.poll(() => readStoreMarkdown(page)).toContain(
      `paragraph ${editIndex} daily-edit-regression EDITED`
    )

    // Move the reading viewport far enough that the edited block can leave the
    // retention window. Undo must operate on model history rather than forcing
    // the old DOM block back into view.
    await page.locator('.editor-component').evaluate((node) => {
      const editor = node as HTMLElement
      editor.scrollTop = editor.scrollHeight
      editor.dispatchEvent(new Event('scroll'))
    })
    await expect
      .poll(
        () =>
          page
            .locator('.mu-paragraph-content')
            .filter({ hasText: /^paragraph 419 daily-edit-regression$/ })
            .count(),
        { timeout: 8000 }
      )
      .toBeGreaterThan(0)
    const beforeUndo = await readScrollPosition(page)
    expect(beforeUndo.max).toBeGreaterThan(0)
    // Virtual height estimates may expand after the bottom window mounts, so a
    // one-shot scrollTop=scrollHeight is not guaranteed to remain at the exact
    // numeric maximum. It must, however, be deep in the document and far from
    // the edited block before Undo is issued.
    expect(beforeUndo.top / beforeUndo.max).toBeGreaterThan(0.85)

    await pressNativeUndo(app)
    await expect.poll(() => readStoreMarkdown(page), { timeout: 5000 }).not.toContain(' EDITED')

    const afterUndo = await readScrollPosition(page)
    expect(Math.abs(afterUndo.top - beforeUndo.top)).toBeLessThanOrEqual(32)
    await expectNoRendererErrors(app)
  })

  test('HIST-003/HIST-004: repeated edits remain undoable and redoable after virtual-window changes', async() => {
    const paragraphs = page.locator('.mu-paragraph-content')
    const first = paragraphs.nth(0)
    const second = paragraphs.nth(1)

    await first.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' ONE', { delay: 0 })
    await expect.poll(() => readStoreMarkdown(page)).toContain(
      'paragraph 0 daily-edit-regression ONE'
    )

    // Edit a different block so the second mutation is an unambiguous history
    // boundary rather than two text runs Chromium/Muya may coalesce.
    await second.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' TWO', { delay: 0 })
    await expect.poll(() => readStoreMarkdown(page)).toContain(
      'paragraph 1 daily-edit-regression TWO'
    )

    await scrollToRatio(page, 0.6)
    await pressNativeUndo(app)
    await expect.poll(() => readStoreMarkdown(page)).not.toContain(
      'paragraph 1 daily-edit-regression TWO'
    )
    await expect.poll(() => readStoreMarkdown(page)).toContain(
      'paragraph 0 daily-edit-regression ONE'
    )
    await pressNativeUndo(app)
    await expect.poll(() => readStoreMarkdown(page)).not.toContain(
      'paragraph 0 daily-edit-regression ONE'
    )

    // Redo through the product command, so the test does not hard-code the
    // platform-specific redo chord while still exercising restored history.
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (!win || win.isDestroyed()) throw new Error('No focused editor window found')
      win.webContents.send('mt::editor-edit-action', 'redo')
    })
    await expect.poll(() => readStoreMarkdown(page)).toContain(
      'paragraph 0 daily-edit-regression ONE'
    )
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (!win || win.isDestroyed()) throw new Error('No focused editor window found')
      win.webContents.send('mt::editor-edit-action', 'redo')
    })
    await expect.poll(() => readStoreMarkdown(page)).toContain(
      'paragraph 1 daily-edit-regression TWO'
    )
    await expectNoRendererErrors(app)
  })
})
