import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { launchWithMarkdown, waitForMenuReady, sendIpcToRenderer } from './helpers'

// Regression for the independent review blocker on PR #290: the preview was
// invalidated by a resource change while the NATIVE save dialog was open only in
// unit tests. In production the renderer never injects `showSaveDialog`, so the
// post-dialog revalidation branch was skipped and the old artifact was written.
//
// These scenarios drive the real IPC + main-process save path; only the native
// dialog itself is stubbed (as in every Electron E2E here), and it is delayed to
// hold the user-pause window open.

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)
// Same byte length, different content: a strict size-preserving replacement.
const PNG_ALT = Buffer.from(PNG_1PX)
PNG_ALT[PNG_ALT.length - 8] ^= 0xff

const readStatus = async(page: Page): Promise<string> =>
  (await page
    .locator('[data-testid="pdf-preview-status"]')
    .getAttribute('data-status', { timeout: 2000 })
    .catch(() => null)) ?? 'unknown'

const openDialogAndReady = async(app: ElectronApplication, page: Page): Promise<void> => {
  await page.waitForFunction(
    () =>
      (globalThis as unknown as { __inkiva_pdf_preview_ready__?: boolean })
        .__inkiva_pdf_preview_ready__ === true,
    undefined,
    { timeout: 30000 }
  )
  await sendIpcToRenderer(app, 'mt::show-export-dialog', 'pdf')
  await page.locator('[data-testid="pdf-preview-generate"]').waitFor({
    state: 'visible',
    timeout: 10000
  })
}

const generate = async(page: Page): Promise<void> => {
  await page.locator('[data-testid="pdf-preview-generate"]').click()
  await expect.poll(async() => readStatus(page), { timeout: 60000 }).toMatch(/^(ready|failed)$/)
  expect(await readStatus(page)).toBe('ready')
}

const stubSaveDialog = async(
  app: ElectronApplication,
  targetPath: string,
  delayMs = 0
): Promise<void> => {
  await app.evaluate(
    async({ dialog }, { savePath, delay }) => {
      ;(dialog as unknown as { showSaveDialog: unknown }).showSaveDialog = async() => {
        if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
        return { canceled: false, filePath: savePath }
      }
    },
    { savePath: targetPath, delay: delayMs }
  )
}

const printPageCount = async(app: ElectronApplication): Promise<number> =>
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().filter((win) => !win.isVisible()).length
  )

test.describe.configure({ timeout: 120000 })

test.describe('PDF save dialog race', () => {
  test('a change while the native save dialog is open blocks the write', async() => {
    const launched = await launchWithMarkdown('# Pause\n\n![photo](photo.png)\n\ntail\n')
    const { app, page } = launched
    const dir = path.dirname(launched.filePath)
    const imagePath = path.join(dir, 'photo.png')
    fs.writeFileSync(imagePath, PNG_1PX)
    const out = path.join(dir, 'pause.pdf')
    try {
      await waitForMenuReady(app)
      await stubSaveDialog(app, out, 3000)
      await openDialogAndReady(app, page)
      await generate(page)
      await page.locator('[data-testid="pdf-preview-save"]').click()

      await page.waitForTimeout(800)
      const before = fs.statSync(imagePath)
      fs.writeFileSync(imagePath, PNG_ALT)
      fs.utimesSync(imagePath, before.atime, before.mtime)
      const after = fs.statSync(imagePath)
      expect(after.size).toBe(before.size)
      expect(Math.round(after.mtimeMs)).toBe(Math.round(before.mtimeMs))

      await page.waitForTimeout(6000)
      const status = await readStatus(page)
      const events = await page
        .locator('[data-testid="pdf-preview-status"]')
        .getAttribute('data-events', { timeout: 2000 })
        .catch(() => null)
      const written = fs.existsSync(out)
      // eslint-disable-next-line no-console
      console.log('DIALOG-RACE-FACTS ' + JSON.stringify({ status, events, written }))
      expect(status, 'mid-dialog resource change must invalidate the preview').toBe('stale')
      expect(written, 'the artifact must not be written after a mid-dialog change').toBe(false)
    } finally {
      await app.close()
      fs.rmSync(out, { force: true })
      fs.rmSync(imagePath, { force: true })
    }
  })

  test('an image deleted after generation blocks the write', async() => {
    const launched = await launchWithMarkdown('# Gone\n\n![photo](photo.png)\n\ntail\n')
    const { app, page } = launched
    const dir = path.dirname(launched.filePath)
    const imagePath = path.join(dir, 'photo.png')
    fs.writeFileSync(imagePath, PNG_1PX)
    const out = path.join(dir, 'gone.pdf')
    try {
      await waitForMenuReady(app)
      await stubSaveDialog(app, out)
      await openDialogAndReady(app, page)
      await generate(page)
      const hiddenBefore = await printPageCount(app)

      fs.rmSync(imagePath)

      await page.locator('[data-testid="pdf-preview-save"]').click()
      await expect.poll(async() => readStatus(page), { timeout: 10000 }).toBe('stale')
      expect(fs.existsSync(out)).toBe(false)
      expect(await printPageCount(app), 'no hidden print window may leak').toBe(hiddenBefore)
    } finally {
      await app.close()
      fs.rmSync(out, { force: true })
      fs.rmSync(imagePath, { force: true })
    }
  })
})
