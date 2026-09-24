import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import {
  getMessageBoxCalls,
  installMessageBoxCapture,
  launchWithMarkdown,
  setMessageBoxResponse,
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
    // Keep the window open after observing the real unsaved-changes prompt.
    // US-01 adds Keep for Recovery and explicit Discard, so Cancel is response 3.
    // Returning response 2 would intentionally enter the secondary discard confirmation.
    await installMessageBoxCapture(app, 3)
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

    // Let cleanup take the normal Save path; discard now has its own confirmation
    // and must not be used as an implicit test teardown shortcut.
    await setMessageBoxResponse(app, 0)
    await app.close()
    app = undefined as unknown as ElectronApplication
  })
})
