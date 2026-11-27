import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { launchElectron, sendIpcToRenderer, waitForEditor } from './helpers'

// Two remaining F5/F6 scenarios, both through the production path:
//  - a second window on the same file in the SAME process (two Electron processes
//    cannot share one --user-data-dir);
//  - an untitled document whose first save binds the collapse snapshot to the new
//    file, then a real relaunch restores it.

const DOCUMENT = [
  '# Product guide',
  '',
  '## Installation',
  '',
  'Install the app.',
  '',
  '## Configuration',
  '',
  'Configuration notes.',
  ''
].join('\n')

const heading = (page: Page, text: string) =>
  page.locator('.mu-container > h1:visible, .mu-container > h2:visible, .mu-container > h3:visible')
    .filter({ hasText: text })
    .first()

const toggle = (page: Page, text: string) =>
  heading(page, text).getByTestId('heading-collapse-toggle')

const isCollapsed = async(page: Page, text: string): Promise<boolean> =>
  (await toggle(page, text).getAttribute('aria-expanded', { timeout: 10_000 })) === 'false'

const setup = (document = DOCUMENT) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-collapse-mw-'))
  const file = path.join(dir, 'doc.md')
  const userDataDir = path.join(dir, 'userdata')
  fs.mkdirSync(userDataDir)
  fs.writeFileSync(file, document)
  return { dir, file, userDataDir }
}

test.describe.configure({ timeout: 240_000 })

test.describe('collapse multi-window and first save', () => {
  test('a second window on the same file keeps the store valid and the last write wins', async() => {
    const { dir, file, userDataDir } = setup()
    const launched = await launchElectron([file], { userDataDir, suppressErrorDialog: true })
    const { app, page } = launched
    try {
      await waitForEditor(page)

      // Same pattern as the existing context-isolation spec: ask main for another
      // editor window and wait for Playwright to attach to it.
      const nextWindow = app.waitForEvent('window')
      await page.evaluate(() => window.electron.ipcRenderer.send('app-create-editor-window'))
      const second = await nextWindow
      await second.waitForLoadState('domcontentloaded')
      await waitForEditor(second)

      // Give the second window the same document through the per-window open path.
      await second.evaluate((target) => window.electron.ipcRenderer.send('mt::open-file', target), file)
      await expect.poll(() => heading(second, 'Installation').isVisible(), { timeout: 30_000 })
        .toBe(true)

      await toggle(page, 'Installation').click()
      await expect.poll(() => isCollapsed(page, 'Installation')).toBe(true)
      await page.waitForTimeout(800)

      await toggle(second, 'Configuration').click()
      await expect.poll(() => isCollapsed(second, 'Configuration')).toBe(true)
      await second.waitForTimeout(800)
    } finally {
      await app.close()
    }

    const storePath = path.join(userDataDir, 'collapse-state.json')
    const raw = fs.readFileSync(storePath, 'utf8')
    expect(() => JSON.parse(raw)).not.toThrow()

    const relaunched = await launchElectron([file], { userDataDir, suppressErrorDialog: true })
    try {
      await waitForEditor(relaunched.page)
      // The whole-record rule: the later window's write won.
      await expect
        .poll(() => isCollapsed(relaunched.page, 'Configuration'), { timeout: 20_000 })
        .toBe(true)
    } finally {
      await relaunched.app.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('an untitled document binds its collapse state on first save and restores after relaunch', async() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-collapse-untitled-'))
    const userDataDir = path.join(dir, 'userdata')
    fs.mkdirSync(userDataDir)
    const target = path.join(dir, 'saved.md')

    const launched = await launchElectron([], { userDataDir, suppressErrorDialog: true })
    const { app, page } = launched
    try {
      await waitForEditor(page)
      // Create an untitled document with headings through the real new-tab path.
      await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, DOCUMENT)
      await expect.poll(() => heading(page, 'Installation').isVisible(), { timeout: 30_000 }).toBe(true)

      await toggle(page, 'Installation').click()
      await expect.poll(() => isCollapsed(page, 'Installation')).toBe(true)

      // First save: only the native dialog result is fixed.
      await app.evaluate(async({ dialog }, savePath) => {
        ;(dialog as unknown as { showSaveDialog: unknown }).showSaveDialog = async() => ({
          canceled: false,
          filePath: savePath
        })
      }, target)
      // Drive the same path the File menu uses (mt::editor-ask-file-save).
      await sendIpcToRenderer(app, 'mt::editor-ask-file-save')
      await expect.poll(() => fs.existsSync(target), { timeout: 30_000 }).toBe(true)
      await page.waitForTimeout(1_000)
    } finally {
      await app.close()
    }

    const relaunched = await launchElectron([target], { userDataDir, suppressErrorDialog: true })
    try {
      await waitForEditor(relaunched.page)
      await expect
        .poll(() => isCollapsed(relaunched.page, 'Installation'), { timeout: 20_000 })
        .toBe(true)
    } finally {
      await relaunched.app.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
