import { expect, test } from '@playwright/test'
import type { Page } from 'playwright'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { launchElectron, sendIpcToRenderer, waitForEditor } from './helpers'

// Acceptance regressions for PR #291: D4 (an untitled document inheriting the
// previous document's collapse), D5 (a late restore overwriting a newer user
// collapse) and D6 (first-save binding). All production paths; the only seam is
// INKIVA_COLLAPSE_LOAD_DELAY_MS, which holds the store read open.

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

const setup = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-collapse-acc-'))
  const file = path.join(dir, 'doc.md')
  const userDataDir = path.join(dir, 'userdata')
  fs.mkdirSync(userDataDir)
  fs.writeFileSync(file, DOCUMENT)
  return { dir, file, userDataDir }
}

test.describe.configure({ timeout: 240_000 })

test.describe('PR291 acceptance regressions', () => {
  test('D4: an untitled document does not inherit the previous document collapse', async() => {
    const { dir, file, userDataDir } = setup()
    const launched = await launchElectron([file], { userDataDir, suppressErrorDialog: true })
    const { app, page } = launched
    try {
      await waitForEditor(page)
      await toggle(page, 'Installation').click()
      await expect.poll(() => isCollapsed(page, 'Installation')).toBe(true)

      // New untitled document with the same heading texts and no record at all.
      await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, DOCUMENT)
      await expect.poll(() => heading(page, 'Installation').isVisible(), { timeout: 30_000 }).toBe(true)
      await page.waitForTimeout(1_500)

      const visible = await page.locator('.mu-container > h2:visible').filter({ hasText: 'Installation' }).count()
      expect(visible, 'exactly one visible Installation heading').toBe(1)
      expect(
        await isCollapsed(page, 'Installation'),
        'an untitled document must not inherit the previous document collapse'
      ).toBe(false)
    } finally {
      await app.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('D5: a late restore does not overwrite a newer user collapse', async() => {
    const { dir, file, userDataDir } = setup()
    // Seed [Installation] collapsed and persisted.
    const seed = await launchElectron([file], { userDataDir, suppressErrorDialog: true })
    try {
      await waitForEditor(seed.page)
      await toggle(seed.page, 'Installation').click()
      await expect.poll(() => isCollapsed(seed.page, 'Installation')).toBe(true)
    } finally {
      await seed.app.close()
    }

    // Reopen with the read held open, collapse Configuration meanwhile, then let
    // the old record arrive.
    const delayed = await launchElectron([file], {
      userDataDir,
      suppressErrorDialog: true,
      env: { INKIVA_COLLAPSE_LOAD_DELAY_MS: '4000' }
    })
    try {
      await waitForEditor(delayed.page)
      await toggle(delayed.page, 'Configuration').click()
      await expect.poll(() => isCollapsed(delayed.page, 'Configuration')).toBe(true)

      await delayed.page.waitForTimeout(6_000)
      expect(
        await isCollapsed(delayed.page, 'Configuration'),
        'the user collapse must survive the late restore'
      ).toBe(true)
      // The recorded section still restores.
      expect(await isCollapsed(delayed.page, 'Installation')).toBe(true)
    } finally {
      await delayed.app.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('D6: an untitled document restores after its first save and a relaunch', async() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-collapse-d6-'))
    const userDataDir = path.join(dir, 'userdata')
    fs.mkdirSync(userDataDir)
    const target = path.join(dir, 'saved.md')

    const launched = await launchElectron([], { userDataDir, suppressErrorDialog: true })
    try {
      await waitForEditor(launched.page)
      await sendIpcToRenderer(launched.app, 'mt::new-untitled-tab', true, DOCUMENT)
      await expect.poll(() => heading(launched.page, 'Configuration').isVisible(), { timeout: 30_000 })
        .toBe(true)

      await toggle(launched.page, 'Configuration').click()
      await expect.poll(() => isCollapsed(launched.page, 'Configuration')).toBe(true)

      await launched.app.evaluate(async({ dialog }, savePath) => {
        ;(dialog as unknown as { showSaveDialog: unknown }).showSaveDialog = async() => ({
          canceled: false,
          filePath: savePath
        })
      }, target)
      await sendIpcToRenderer(launched.app, 'mt::editor-ask-file-save')
      await expect.poll(() => fs.existsSync(target), { timeout: 30_000 }).toBe(true)
      await launched.page.waitForTimeout(1_500)
    } finally {
      await launched.app.close()
    }

    const reopened = await launchElectron([target], { userDataDir, suppressErrorDialog: true })
    try {
      await waitForEditor(reopened.page)
      await expect
        .poll(() => isCollapsed(reopened.page, 'Configuration'), { timeout: 20_000 })
        .toBe(true)
    } finally {
      await reopened.app.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
