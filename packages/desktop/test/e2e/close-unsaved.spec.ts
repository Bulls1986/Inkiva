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
    // Response 2 is the dialog's configured Cancel action; returning the default
    // response 0 (Save) legitimately closes the window before assertions can read
    // the captured prompt.
    await installMessageBoxCapture(app, 2)
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

    // Let the explicit cleanup close the dirty document without saving, then
    // clear `app` so the shared afterEach does not issue a second close request.
    await setMessageBoxResponse(app, 1)
    await app.close()
    app = undefined as unknown as ElectronApplication
  })
})
