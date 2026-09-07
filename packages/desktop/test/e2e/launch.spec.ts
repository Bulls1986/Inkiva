import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchElectron, launchWithMarkdown, waitForMenuReady } from './helpers'

test.describe('Check Launch Inkiva', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const { app: electronApp, page: firstPage } = await launchElectron()
    app = electronApp
    page = firstPage
    await waitForMenuReady(app)
  })

  test.afterAll(async() => {
    await app.close()
  })

  test('Empty Inkiva', async() => {
    const title = await page.title()
    expect(title).toBe('Inkiva')
  })

  test('loads the current first-run defaults', async() => {
    const defaults = await launchWithMarkdown('')
    try {
      await expect
        .poll(() =>
          defaults.app.evaluate(({ Menu }) =>
            !!Menu.getApplicationMenu()?.getMenuItemById('autoSaveMenuItem')?.checked
          )
        )
        .toBe(true)
      await expect
        .poll(() => defaults.page.locator('#editor-width').textContent())
        .toContain('80%')
    } finally {
      await defaults.app.close()
    }
  })
})
