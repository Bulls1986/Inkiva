import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'

import keybindingsDarwin from '../../src/main/keyboard/keybindingsDarwin'
import keybindingsLinux from '../../src/main/keyboard/keybindingsLinux'
import keybindingsWindows from '../../src/main/keyboard/keybindingsWindows'
import {
  applyShortcutStyle,
  DEFAULT_SHORTCUT_STYLE,
  type ShortcutPlatform
} from '../../src/main/keyboard/shortcutStyles'
import {
  clearRendererErrors,
  expectNoRendererErrors,
  getMarkdownContent,
  launchWithMarkdown
} from './helpers'

const BLOCK_COUNT = 420

const buildDocument = (): string =>
  Array.from(
    { length: BLOCK_COUNT },
    (_, index) =>
      index === BLOCK_COUNT - 20
        ? `paragraph ${index} VIRTUAL_SHORTCUT_FIND_TARGET`
        : `paragraph ${index} virtualization-shortcut-regression`
  ).join('\n\n') + '\n'

const platform = process.platform as ShortcutPlatform
const baseKeybindings =
  platform === 'darwin'
    ? keybindingsDarwin
    : platform === 'linux'
      ? keybindingsLinux
      : keybindingsWindows
const shortcuts = applyShortcutStyle(baseKeybindings, DEFAULT_SHORTCUT_STYLE, platform)
const markTextShortcuts = applyShortcutStyle(baseKeybindings, 'marktext', platform)

const pressCommand = async(
  app: ElectronApplication,
  commandId: string,
  bindings: ReadonlyMap<string, string> = shortcuts
): Promise<boolean> => {
  const accelerator = bindings.get(commandId) ?? ''
  if (!accelerator) return false

  const parts = accelerator.split('+')
  const modifiers: Array<'shift' | 'control' | 'alt' | 'meta'> = []
  let keyCode = ''
  for (const part of parts) {
    if (part === 'Ctrl' || part === 'Control') modifiers.push('control')
    else if (part === 'Command' || part === 'Cmd') modifiers.push('meta')
    else if (part === 'Option' || part === 'Alt') modifiers.push('alt')
    else if (part === 'Shift') modifiers.push('shift')
    else keyCode = part
  }
  if (!keyCode) throw new Error(`Shortcut ${commandId} has no key: ${accelerator}`)

  // Electron accelerator syntax uses the token "Plus" because '+' is the
  // accelerator separator. A physical '+' uses Shift+'=' on the standard desktop
  // keyboard; keyCode='+' does not traverse Electron's accelerator matching path.
  // Reproduce that physical chord in the E2E input adapter.
  const inputKeyCode = keyCode === 'Plus' && modifiers.includes('shift') ? '=' : keyCode

  await app.evaluate(({ BrowserWindow }, payload) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win || win.isDestroyed()) throw new Error('No focused editor window found')
    win.webContents.sendInputEvent({
      type: 'keyDown',
      keyCode: payload.keyCode,
      modifiers: payload.modifiers
    })
    win.webContents.sendInputEvent({
      type: 'keyUp',
      keyCode: payload.keyCode,
      modifiers: payload.modifiers
    })
  }, { keyCode: inputKeyCode, modifiers })
  return true
}

const readVirtualization = (
  page: Page
): Promise<{ total: number; mounted: number; enabled: boolean }> =>
  page.evaluate(() => {
    const root = document.querySelector<HTMLElement>(
      '.mu-container[data-virtualization-enabled="true"]'
    )
    return {
      enabled: !!root,
      total: Number(root?.dataset.virtualTotalBlocks ?? 0),
      mounted: Number(root?.dataset.virtualMountedBlocks ?? 0)
    }
  })

const expectBoundedVirtualization = async(page: Page): Promise<void> => {
  await expect
    .poll(() => readVirtualization(page), { timeout: 8000 })
    .toEqual(
      expect.objectContaining({
        enabled: true,
        total: expect.any(Number),
        mounted: expect.any(Number)
      })
    )
  const snapshot = await readVirtualization(page)
  expect(snapshot.total).toBeGreaterThan(300)
  expect(snapshot.mounted).toBeGreaterThan(0)
  expect(snapshot.mounted).toBeLessThan(snapshot.total / 2)
}

test.describe('@virtualization-core virtualization common shortcuts', () => {
  let app: ElectronApplication
  let page: Page
  let filePath: string

  test.beforeEach(async() => {
    const launched = await launchWithMarkdown(buildDocument(), {
      filename: 'virtualization-shortcuts.md',
      suppressErrorDialog: true,
      waitForEditorTimeout: 30000
    })
    app = launched.app
    page = launched.page
    filePath = launched.filePath
    await clearRendererErrors(app)
    await expectBoundedVirtualization(page)
  })

  test.afterEach(async() => {
    if (app) await app.close()
  })

  test('KEY-001: configured Save shortcut persists the latest virtualized revision', async() => {
    const first = page.locator('.mu-paragraph-content').first()
    await first.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' SHORTCUT_SAVED', { delay: 10 })

    expect(await pressCommand(app, 'file.save')).toBe(true)
    await expect
      .poll(() => fs.readFileSync(filePath, 'utf-8'), { timeout: 10000 })
      .toContain('SHORTCUT_SAVED')
    expect(fs.readFileSync(filePath, 'utf-8')).toContain(
      `paragraph ${BLOCK_COUNT - 1} virtualization-shortcut-regression`
    )
    await expectBoundedVirtualization(page)
    await expectNoRendererErrors(app)
  })

  test('KEY-EDIT-006/012: configured Select All + Delete affects the complete logical document and Undo restores it', async() => {
    const first = page.locator('.mu-paragraph-content').first()
    await first.click()

    // Muya intentionally promotes selection in two steps: active block, then
    // complete logical document. Use the actual configured accelerator both times.
    expect(await pressCommand(app, 'edit.select-all')).toBe(true)
    expect(await pressCommand(app, 'edit.select-all')).toBe(true)
    await page.keyboard.press('Delete')
    await expect.poll(() => getMarkdownContent(page, app), { timeout: 8000 }).toBe('')

    expect(await pressCommand(app, 'edit.undo')).toBe(true)
    await expect.poll(() => getMarkdownContent(page, app), { timeout: 8000 }).toContain(
      `paragraph ${BLOCK_COUNT - 1} virtualization-shortcut-regression`
    )
    await expectBoundedVirtualization(page)
    await expectNoRendererErrors(app)
  })

  test('KEY-020/KEY-021: configured Find shortcut mounts a distant result', async() => {
    expect(await pressCommand(app, 'edit.find')).toBe(true)
    const input = page.locator('.search-bar .search input')
    await expect(input).toBeVisible({ timeout: 5000 })
    await input.fill('VIRTUAL_SHORTCUT_FIND_TARGET')
    await expect(page.locator('.search-result')).toContainText('1 / 1', { timeout: 8000 })
    await expect(page.locator('.mu-highlight').first()).toBeVisible({ timeout: 8000 })
    await expectBoundedVirtualization(page)
    await expectNoRendererErrors(app)
  })

  test('SOURCE-KEY-001: configured Source shortcut round-trips the complete logical document', async() => {
    expect(await pressCommand(app, 'view.source-code-mode')).toBe(true)
    await expect(page.locator('.source-code .CodeMirror')).toBeAttached({ timeout: 10000 })

    const source = await page.evaluate(() => {
      const root = document.querySelector('.source-code .CodeMirror') as
        | (Element & { CodeMirror?: { getValue(): string } })
        | null
      return root?.CodeMirror?.getValue() ?? ''
    })
    expect(source).toContain('paragraph 0 virtualization-shortcut-regression')
    expect(source).toContain(
      `paragraph ${BLOCK_COUNT - 1} virtualization-shortcut-regression`
    )

    expect(await pressCommand(app, 'view.source-code-mode')).toBe(true)
    await expect(page.locator('.source-code')).toHaveCount(0, { timeout: 10000 })
    await expectBoundedVirtualization(page)
    await expectNoRendererErrors(app)
  })

  test('SOURCE-KEY-024: switching to MarkText profile applies its real Source binding to the virtualized editor', async() => {
    const applied = await page.evaluate(async() => {
      const result = await window.electron.ipcRenderer.invoke('mt::keybinding-set-style', 'marktext')
      return result.shortcutStyle
    })
    expect(applied).toBe('marktext')

    expect(await pressCommand(app, 'view.source-code-mode', markTextShortcuts)).toBe(true)
    await expect(page.locator('.source-code .CodeMirror')).toBeAttached({ timeout: 10000 })
    expect(await pressCommand(app, 'view.source-code-mode', markTextShortcuts)).toBe(true)
    await expect(page.locator('.source-code')).toHaveCount(0, { timeout: 10000 })
    await expectBoundedVirtualization(page)
    await expectNoRendererErrors(app)
  })

  test('FOCUS-KEY: configured Focus shortcut toggles mode without losing the virtual reading surface', async() => {
    expect(await pressCommand(app, 'view.focus-mode')).toBe(true)
    await expect(page.locator('.editor-wrapper')).toHaveClass(/(^|\s)focus(\s|$)/)
    await expectBoundedVirtualization(page)

    expect(await pressCommand(app, 'view.focus-mode')).toBe(true)
    await expect(page.locator('.editor-wrapper')).not.toHaveClass(/(^|\s)focus(\s|$)/)
    await expectBoundedVirtualization(page)
    await expectNoRendererErrors(app)
  })

  test('VIEW-KEY-002: configured Sidebar shortcut toggles layout without losing bounded virtualization', async() => {
    const sideBar = page.locator('.side-bar')
    const initialVisible = await sideBar.isVisible()

    expect(await pressCommand(app, 'view.toggle-sidebar')).toBe(true)
    await expect
      .poll(async() => sideBar.isVisible(), { timeout: 5000 })
      .toBe(!initialVisible)
    await expectBoundedVirtualization(page)

    expect(await pressCommand(app, 'view.toggle-sidebar')).toBe(true)
    await expect
      .poll(async() => sideBar.isVisible(), { timeout: 5000 })
      .toBe(initialVisible)
    await expectBoundedVirtualization(page)
    await expectNoRendererErrors(app)
  })

  test('VIEW-KEY-007: configured Zoom actions preserve the virtualized surface', async() => {
    const zoomIn = shortcuts.get('window.zoomIn') ?? ''
    const zoomOut = shortcuts.get('window.zoomOut') ?? ''

    // Typora style intentionally leaves zoom shortcuts unbound on macOS.
    if (!zoomIn || !zoomOut) {
      expect(platform).toBe('darwin')
      return
    }

    const readZoom = (): Promise<number> =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.getZoomFactor() ?? 1)

    const clickConfiguredWindowAction = (accelerator: string): Promise<boolean> =>
      app.evaluate(({ BrowserWindow, Menu }, targetAccelerator) => {
        const win = BrowserWindow.getAllWindows()[0]
        const windowMenu = Menu.getApplicationMenu()?.getMenuItemById('windowMenu')
        const item = windowMenu?.submenu?.items.find(
          (candidate) => candidate.accelerator === targetAccelerator
        )
        if (!win || !item?.click) return false
        item.click(item, win, {} as never)
        return true
      }, accelerator)

    const before = await readZoom()
    expect(await clickConfiguredWindowAction(zoomIn)).toBe(true)
    await expect.poll(() => readZoom(), { timeout: 5000 }).toBeGreaterThan(before)
    await expectBoundedVirtualization(page)

    expect(await clickConfiguredWindowAction(zoomOut)).toBe(true)
    await expect.poll(() => readZoom(), { timeout: 5000 }).toBeCloseTo(before, 3)
    await expectBoundedVirtualization(page)
    await expectNoRendererErrors(app)
  })
})
