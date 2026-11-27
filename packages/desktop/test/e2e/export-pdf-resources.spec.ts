import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { launchWithMarkdown, waitForMenuReady, sendIpcToRenderer } from './helpers'

// P2/P7: a local image that changes on disk after the preview was generated
// makes the paginated result obsolete. Saving must be refused instead of
// writing a PDF that no longer matches what the user reviewed.

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

const readStatus = async(page: Page): Promise<string> =>
  (await page
    .locator('[data-testid="pdf-preview-status"]')
    .getAttribute('data-status', { timeout: 2000 })
    .catch(() => null)) ?? 'unknown'

const stubSaveDialog = async(app: ElectronApplication, targetPath: string): Promise<void> => {
  await app.evaluate(async({ dialog }, savePath) => {
    ;(dialog as unknown as { showSaveDialog: unknown }).showSaveDialog = async() => ({
      canceled: false,
      filePath: savePath
    })
  }, targetPath)
}

test.describe('PDF preview resource validity', () => {
  test('editing a referenced image on disk invalidates the preview before saving', async() => {
    // The image lives next to the document, the way a user's images normally do.
    const markdown = '# Image document\n\nBefore the image.\n\n![photo](photo.png)\n\nAfter the image.\n'
    const launched = await launchWithMarkdown(markdown)
    const { app, page } = launched
    const dir = path.dirname(launched.filePath)
    const imagePath = path.join(dir, 'photo.png')
    fs.writeFileSync(imagePath, PNG_1PX)
    const out = path.join(dir, 'out.pdf')
    try {
      await waitForMenuReady(app)
      await page.waitForFunction(
        () =>
          (globalThis as unknown as { __inkiva_pdf_preview_ready__?: boolean })
            .__inkiva_pdf_preview_ready__ === true,
        undefined,
        { timeout: 30000 }
      )
      await stubSaveDialog(app, out)
      await sendIpcToRenderer(app, 'mt::show-export-dialog', 'pdf')
      await page.locator('[data-testid="pdf-preview-generate"]').waitFor({
        state: 'visible',
        timeout: 10000
      })
      await page.locator('[data-testid="pdf-preview-generate"]').click()

      await expect.poll(async() => readStatus(page), { timeout: 60000 }).toMatch(/^(ready|failed)$/)
      expect(await readStatus(page)).toBe('ready')

      // The user edits/replaces the image while the preview is open.
      fs.writeFileSync(imagePath, Buffer.concat([PNG_1PX, Buffer.from('changed content')]))

      await page.locator('[data-testid="pdf-preview-save"]').click()

      const status = await expect
        .poll(async() => readStatus(page), { timeout: 10000 })
        .toBe('stale')
        .then(() => 'stale')
        .catch(async() => {
          const diagnostics = await page.evaluate(() => {
            const panel = document.querySelector('[data-testid="pdf-preview-status"]')
            const dialog = document.querySelector('.print-settings-dialog')
            const el = panel?.closest('.el-dialog') as HTMLElement | null
            return {
              status: panel?.getAttribute('data-status'),
              events: panel?.getAttribute('data-events'),
              error: document.querySelector('[data-testid="pdf-preview-error"]')?.textContent,
              resources: panel?.getAttribute('data-resources'),
              dialogVisible: dialog ? (dialog as HTMLElement).offsetParent !== null : false,
              dialogDisplay: el ? el.style.display : 'n/a'
            }
          })
          throw new Error('preview did not become stale: ' + JSON.stringify(diagnostics))
        })
      expect(status).toBe('stale')
      expect(fs.existsSync(out)).toBe(false)
    } finally {
      await app.close()
      fs.rmSync(out, { force: true })
    }
  })
})
