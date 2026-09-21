import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { launchWithMarkdown, setUserPreferences } from './helpers'

const openSettingsCategory = async (
  app: ElectronApplication,
  page: Page,
  category: RegExp
): Promise<Page> => {
  const settingsPromise = app.waitForEvent('window')
  await page.evaluate(() => {
    window.electron.ipcRenderer.send('mt::open-setting-window')
  })
  const settingsPage = await settingsPromise
  await settingsPage.waitForSelector('.pref-container', { state: 'attached', timeout: 15000 })
  await settingsPage.locator('.pref-sidebar .item').filter({ hasText: category }).click()
  return settingsPage
}

const readPreference = async (page: Page, key: string): Promise<unknown> =>
  await page.evaluate((preferenceKey) => {
    const root = document.querySelector('#app') as
      | (Element & {
        __vue_app__?: {
          config?: { globalProperties?: Record<string, unknown> }
        }
      })
      | null
    const pinia = root?.__vue_app__?.config?.globalProperties?.$pinia as
      | { _s?: Map<string, Record<string, unknown>> }
      | undefined
    return pinia?._s?.get('preferences')?.[preferenceKey]
  }, key)

const editorFontFamily = async (page: Page): Promise<string> =>
  await page.locator('.mu-editor').evaluate((element) => getComputedStyle(element).fontFamily)

test.describe('settings functional gate', () => {
  test('editor font picker applies, remains interactive, reopens correctly and survives restart', async() => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-settings-font-'))
    let firstApp: ElectronApplication | null = null
    let secondApp: ElectronApplication | null = null

    try {
      const first = await launchWithMarkdown('# Font gate\n\nBody text.\n', { userDataDir })
      firstApp = first.app

      const settingsPage = await openSettingsCategory(first.app, first.page, /编辑器|Editor/)
      const fontInput = settingsPage
        .locator('.pref-editor .pref-font-input-item')
        .first()
        .locator('input')

      await fontInput.click()
      await fontInput.fill('Open')
      const openSansOption = settingsPage
        .locator('.font-autocomplete-popper li')
        .filter({ hasText: /^Open Sans$/ })
        .first()
      await expect(openSansOption).toBeVisible()
      await openSansOption.click()

      await expect(fontInput).toHaveValue('Open Sans')
      await expect.poll(() => readPreference(first.page, 'editorFontFamily')).toBe('Open Sans')
      await expect.poll(() => editorFontFamily(first.page)).toContain('Open Sans')

      // Regression guard for the reported second-click dead picker.
      await fontInput.click()
      await expect(settingsPage.locator('.font-autocomplete-popper')).toBeVisible()
      await settingsPage.keyboard.press('Escape')

      await settingsPage.close()

      const reopenedSettings = await openSettingsCategory(first.app, first.page, /编辑器|Editor/)
      await expect(
        reopenedSettings.locator('.pref-editor .pref-font-input-item').first().locator('input')
      ).toHaveValue('Open Sans')
      await reopenedSettings.close()

      await first.app.close()
      firstApp = null

      const second = await launchWithMarkdown('# Font restart gate\n\nBody text.\n', { userDataDir })
      secondApp = second.app

      await expect.poll(() => readPreference(second.page, 'editorFontFamily')).toBe('Open Sans')
      await expect.poll(() => editorFontFamily(second.page)).toContain('Open Sans')
    } finally {
      if (firstApp) await firstApp.close()
      if (secondApp) await secondApp.close()
      fs.rmSync(userDataDir, { recursive: true, force: true })
    }
  })

  test('representative settings from every preference domain survive a real electron-store restart', async() => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-settings-roundtrip-'))
    const expected: Record<string, unknown> = {
      autoSave: false,
      autoSaveDelay: 6200,
      openFilesInNewWindow: true,
      openFolderInNewWindow: true,
      zoom: 1.125,
      hideScrollbar: true,
      wordWrapInToc: true,
      fileSortBy: 'title',
      fileSortOrder: 'desc',
      restoreLayoutState: false,
      openedFilesInSidebar: false,

      fontSize: 21,
      lineHeight: 1.8,
      paragraphSpacing: 1.1,
      editorFontFamily: 'Open Sans',
      codeFontSize: 16,
      codeFontFamily: 'DejaVu Sans Mono',
      codeBlockLineNumbers: true,
      wrapCodeBlocks: true,
      tabSize: 2,
      textDirection: 'rtl',
      hideQuickInsertHint: true,
      hideLinkPopup: true,
      autoCheck: true,

      preferLooseListItem: false,
      bulletListMarker: '*',
      orderListDelimiter: ')',
      listIndentation: 2,
      frontmatterType: '+',
      superSubScript: true,
      footnote: true,
      isHtmlEnabled: false,
      isGitlabCompatibilityEnabled: true,
      sequenceTheme: 'simple',
      plantumlServer: 'https://example.test/plantuml',

      imageInsertAction: 'path',
      imagePreferRelativeDirectory: true,
      imageRelativeDirectoryBase: 'root',
      imageRelativeDirectoryName: 'assets-test',

      theme: 'paper',
      followSystemTheme: false,
      customCss: ':root { --settings-gate-marker: 1; }',

      spellcheckerEnabled: false,
      spellcheckerNoUnderline: true,
      spellcheckerLanguage: 'en-US'
    }

    let firstApp: ElectronApplication | null = null
    let secondApp: ElectronApplication | null = null

    try {
      const first = await launchWithMarkdown('# Settings persistence gate\n', { userDataDir })
      firstApp = first.app
      await setUserPreferences(first.page, expected)

      for (const [key, value] of Object.entries(expected)) {
        await expect.poll(() => readPreference(first.page, key)).toEqual(value)
      }

      await first.app.close()
      firstApp = null

      const second = await launchWithMarkdown('# Settings persistence restart\n', { userDataDir })
      secondApp = second.app

      for (const [key, value] of Object.entries(expected)) {
        await expect.poll(() => readPreference(second.page, key)).toEqual(value)
      }
    } finally {
      if (firstApp) await firstApp.close()
      if (secondApp) await secondApp.close()
      fs.rmSync(userDataDir, { recursive: true, force: true })
    }
  })
})
