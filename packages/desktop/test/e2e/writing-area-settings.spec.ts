import { expect, test } from '@playwright/test'
import { launchWithMarkdown, setUserPreferences } from './helpers'

test.describe('writing-area personalization', () => {
  test('paragraph spacing changes through a root CSS variable without replacing blocks', async() => {
    const { app, page } = await launchWithMarkdown('First paragraph.\n\nSecond paragraph.\n')

    try {
      const result = await page.evaluate(() => {
        const root = document.querySelector('.mu-editor') as HTMLElement | null
        const paragraph = root?.querySelector('.mu-paragraph') ?? null
        if (!root || !paragraph) return null

        root.style.setProperty('--mu-paragraph-spacing', '1.2em')
        return {
          paragraphText: paragraph.textContent,
          sameParagraph: paragraph === root.querySelector('.mu-paragraph'),
          spacing: getComputedStyle(paragraph).marginBlockStart
        }
      })

      expect(result).not.toBeNull()
      expect(result?.paragraphText).toContain('First paragraph.')
      expect(result?.sameParagraph).toBe(true)
      // The reference editor uses an 18px body size, so 1.2em resolves to
      // 21.6px. Keep the assertion tied to the configured type scale rather
      // than the previous 16px default.
      expect(result?.spacing).toBe('21.6px')
    } finally {
      await app.close()
    }
  })

  test('editor maximum width uses a percentage and updates without rebuilding the document', async() => {
    const { app, page } = await launchWithMarkdown('# Width\n\nKeep this paragraph stable.\n')

    try {
      const paragraph = page.locator('.mu-paragraph').first()
      await paragraph.evaluate((element) => {
        element.setAttribute('data-width-test-marker', 'true')
      })

      await expect.poll(() => page.locator('#editor-width').textContent()).toContain('80%')

      await setUserPreferences(page, { editorLineWidth: '70%' })

      await expect.poll(() => page.locator('#editor-width').textContent()).toContain('70%')
      await expect(paragraph).toHaveAttribute('data-width-test-marker', 'true')
    } finally {
      await app.close()
    }
  })

  test('editor settings accept percentages and reject pixel values', async() => {
    const { app, page } = await launchWithMarkdown('# Width settings\n')
    const settingsPromise = app.waitForEvent('window')

    try {
      await page.evaluate(() => {
        window.electron.ipcRenderer.send('mt::open-setting-window')
      })

      const settingsPage = await settingsPromise
      try {
        await settingsPage.waitForSelector('.pref-container', { state: 'attached', timeout: 15000 })
        await settingsPage
          .locator('.pref-sidebar .item')
          .filter({ hasText: /编辑器|Editor/ })
          .click()

        const maxWidthInput = settingsPage.locator('.pref-editor .pref-text-box-item input')
        await expect(maxWidthInput).toHaveValue('80%')

        await maxWidthInput.fill('70%')
        await maxWidthInput.press('Tab')
        await expect.poll(() => page.locator('#editor-width').textContent()).toContain('70%')

        await maxWidthInput.fill('700px')
        await maxWidthInput.press('Tab')
        await expect(settingsPage.locator('.pref-text-box-item .el-input.error')).toBeVisible()
        await expect.poll(() => page.locator('#editor-width').textContent()).toContain('70%')
      } finally {
        await settingsPage.close()
      }
    } finally {
      await app.close()
    }
  })
})
