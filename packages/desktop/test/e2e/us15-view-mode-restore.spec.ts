import { expect, test } from '@playwright/test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { ElectronApplication } from 'playwright'
import {
  clickMenuById,
  closeElectron,
  expectNoRendererErrors,
  launchElectron,
  launchWithMarkdown,
  waitForEditor,
  waitForMenuReady
} from './helpers'

const viewModeChecked = async(app: ElectronApplication, id: string): Promise<boolean> =>
  app.evaluate(({ Menu }, menuId) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(menuId)
    return !!item?.checked
  }, id)

const hasPersistedWindowModes = (editorStatesDir: string): boolean => {
  if (!fs.existsSync(editorStatesDir)) return false
  return fs
    .readdirSync(editorStatesDir)
    .filter((file) => file.endsWith('_editor_buffer_store.json'))
    .some((file) => {
      try {
        const state = JSON.parse(fs.readFileSync(path.join(editorStatesDir, file), 'utf8')) as {
          layout?: { focus?: boolean; typewriter?: boolean }
        }
        return state.layout?.focus === true && state.layout?.typewriter === true
      } catch {
        return false
      }
    })
}

test('US15 AC-64: Focus/Typewriter restore with window layout and stay off for blank layout', async() => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-us15-view-restore-'))
  const editorStatesDir = path.join(userDataDir, 'editorStates')
  const preferencesPath = path.join(userDataDir, 'preferences.json')
  fs.writeFileSync(
    preferencesPath,
    JSON.stringify({ startUpAction: 'restoreAll', restoreLayoutState: true }),
    'utf8'
  )

  let firstApp: ElectronApplication | null = null
  let restoredApp: ElectronApplication | null = null
  let blankLayoutApp: ElectronApplication | null = null

  try {
    const first = await launchWithMarkdown(
      '# US15 restore\n\nFirst paragraph.\n\nSecond paragraph.\n',
      { userDataDir, filename: 'us15-view-mode-restore.md' }
    )
    firstApp = first.app

    await clickMenuById(first.app, 'focusModeMenuItem')
    await clickMenuById(first.app, 'typewriterModeMenuItem')
    await expect(first.page.locator('.editor-wrapper')).toHaveClass(/\bfocus\b/)
    await expect(first.page.locator('.editor-wrapper')).toHaveClass(/\btypewriter\b/)
    await expect(first.page.locator('.mu-editor.mu-focus-mode')).toBeVisible()

    // The view-mode toggle must update the same per-window buffered layout state
    // that the normal session restore path consumes.
    await expect.poll(() => hasPersistedWindowModes(editorStatesDir), { timeout: 6000 }).toBe(true)

    await closeElectron(first.app)
    firstApp = null

    const restored = await launchElectron([], { userDataDir, suppressErrorDialog: true })
    restoredApp = restored.app
    await waitForEditor(restored.page)
    await waitForMenuReady(restored.app)

    await expect(restored.page.locator('.editor-wrapper')).toHaveClass(/\bfocus\b/)
    await expect(restored.page.locator('.editor-wrapper')).toHaveClass(/\btypewriter\b/)
    await expect(restored.page.locator('.mu-editor.mu-focus-mode')).toBeVisible()
    await expect.poll(() => viewModeChecked(restored.app, 'focusModeMenuItem')).toBe(true)
    await expect.poll(() => viewModeChecked(restored.app, 'typewriterModeMenuItem')).toBe(true)
    await expectNoRendererErrors(restored.app)

    // Let the restored window own a fresh current buffer snapshot before the
    // next restart, then switch only the global layout-restore policy.
    await expect.poll(() => hasPersistedWindowModes(editorStatesDir), { timeout: 6000 }).toBe(true)
    const preferenceResult = await restored.page.evaluate(() =>
      window.electron.ipcRenderer.invoke('mt::preferences::set', { restoreLayoutState: false })
    )
    expect(preferenceResult).toMatchObject({ ok: true })
    await expect
      .poll(() => {
        try {
          const persisted = JSON.parse(fs.readFileSync(preferencesPath, 'utf8')) as {
            restoreLayoutState?: boolean
          }
          return persisted.restoreLayoutState
        } catch {
          return undefined
        }
      })
      .toBe(false)

    await closeElectron(restored.app)
    restoredApp = null

    const blankLayout = await launchElectron([], { userDataDir, suppressErrorDialog: true })
    blankLayoutApp = blankLayout.app
    await waitForEditor(blankLayout.page)
    await waitForMenuReady(blankLayout.app)

    await expect(blankLayout.page.locator('.editor-wrapper')).not.toHaveClass(/\bfocus\b/)
    await expect(blankLayout.page.locator('.editor-wrapper')).not.toHaveClass(/\btypewriter\b/)
    await expect(blankLayout.page.locator('.mu-editor.mu-focus-mode')).toHaveCount(0)
    await expect.poll(() => viewModeChecked(blankLayout.app, 'focusModeMenuItem')).toBe(false)
    await expect.poll(() => viewModeChecked(blankLayout.app, 'typewriterModeMenuItem')).toBe(false)
    await expectNoRendererErrors(blankLayout.app)
  } finally {
    if (firstApp) await closeElectron(firstApp)
    if (restoredApp) await closeElectron(restoredApp)
    if (blankLayoutApp) await closeElectron(blankLayoutApp)
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})
