import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import {
  getMessageBoxCalls,
  installMessageBoxCapture,
  launchWithMarkdown,
  setUserPreferences,
  typeIntoEditor
} from './helpers'

test.describe('closing a document with unsaved changes', () => {
  let app: ElectronApplication
  let page: Page

  test.afterEach(async() => {
    if (app) await app.close()
    app = undefined as unknown as ElectronApplication
    page = undefined as unknown as Page
  })

  test('shows the save confirmation after the close request', async() => {
    const launched = await launchWithMarkdown('# Close me\n', { suppressErrorDialog: true })
    app = launched.app
    page = launched.page
    await installMessageBoxCapture(app)
    await setUserPreferences(page, { startUpAction: 'blank' })

    await typeIntoEditor(page, ' unsaved')
    await expect(page.locator('.tabs-container > li.unsaved')).toHaveCount(1, { timeout: 5000 })

    await page.evaluate(() => {
      window.electron.ipcRenderer.send('mt::win::close')
    })

    await expect
      .poll(async() => (await getMessageBoxCalls(app)).length, {
        timeout: 5000
      })
      .toBe(1)

    const [messageBox] = await getMessageBoxCalls(app)
    expect(messageBox?.message).toBeTruthy()
    expect(messageBox?.detail).toBeTruthy()
  })
})
