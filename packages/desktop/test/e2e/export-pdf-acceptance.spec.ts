import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { createHash } from 'node:crypto'
import { launchWithMarkdown, waitForMenuReady, sendIpcToRenderer } from './helpers'

// Acceptance gaps from the independent review, verified through the real
// Electron pipeline rather than inferred from unit contracts:
//  - custom paper produces a PDF whose page box matches the requested size
//  - an image replaced with the SAME size and mtime still invalidates the preview
//  - a missing image that appears later invalidates the preview
//  - a failed write keeps the preview and a retry then succeeds
//  - the isolated print page is torn down after generation

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)
// Same byte length as PNG_1PX, different content: a replacement that keeps both
// the size and (after utimes) the mtime must still invalidate the preview.
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

const stubSaveDialog = async(app: ElectronApplication, targetPath: string): Promise<void> => {
  await app.evaluate(async({ dialog }, savePath) => {
    ;(dialog as unknown as { showSaveDialog: unknown }).showSaveDialog = async() => ({
      canceled: false,
      filePath: savePath
    })
  }, targetPath)
}

const printPageCount = async(app: ElectronApplication): Promise<number> =>
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().filter((win) => !win.isVisible()).length
  )

test.describe.configure({ timeout: 120000 })

test.describe('PDF acceptance evidence', () => {
  test('custom paper yields the requested page box in the saved PDF', async() => {
    const { app, page } = await launchWithMarkdown('# Paper size\n\n' + 'body text\n\n'.repeat(40))
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-pdf-paper-'))
    const out = path.join(dir, 'paper.pdf')
    try {
      await waitForMenuReady(app)
      await stubSaveDialog(app, out)
      await openDialogAndReady(app, page)

      // 180 x 240 mm custom paper, portrait. Page options live on the "Page"
      // tab of the export dialog.
      await page.getByRole('tab', { name: /Page|页面/ }).click()
      const pageSize = page.locator('.page-size-select .el-select')
      await pageSize.click()
      await page.getByRole('option', { name: /Custom|自定义/ }).click()
      const numbers = page.locator('.row .el-input-number input')
      await numbers.nth(0).fill('180')
      await numbers.nth(1).fill('240')
      await numbers.nth(0).blur()

      await generate(page)
      await page.locator('[data-testid="pdf-preview-save"]').click()
      await expect.poll(() => fs.existsSync(out), { timeout: 30000 }).toBe(true)

      // MediaBox is in PDF points (1/72 inch).
      const raw = fs.readFileSync(out).toString('latin1')
      const box = /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(raw)
      expect(box, 'MediaBox present').toBeTruthy()
      const widthPt = Number(box![3]) - Number(box![1])
      const heightPt = Number(box![4]) - Number(box![2])
      const toMm = (pt: number) => (pt / 72) * 25.4
      expect(toMm(widthPt)).toBeGreaterThan(178)
      expect(toMm(widthPt)).toBeLessThan(182)
      expect(toMm(heightPt)).toBeGreaterThan(238)
      expect(toMm(heightPt)).toBeLessThan(242)
    } finally {
      await app.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('a same-size, same-mtime image replacement invalidates the preview', async() => {
    const markdown = '# Swap\n\n![photo](photo.png)\n\ntail\n'
    const launched = await launchWithMarkdown(markdown)
    const { app, page } = launched
    const dir = path.dirname(launched.filePath)
    const imagePath = path.join(dir, 'photo.png')
    const out = path.join(dir, 'swap.pdf')
    fs.writeFileSync(imagePath, PNG_1PX)
    try {
      await waitForMenuReady(app)
      await stubSaveDialog(app, out)
      await openDialogAndReady(app, page)
      await generate(page)

      const before = fs.statSync(imagePath)
      fs.writeFileSync(imagePath, PNG_ALT)
      fs.utimesSync(imagePath, before.atime, before.mtime)
      const after = fs.statSync(imagePath)
      expect(after.size).toBe(before.size)
      expect(Math.round(after.mtimeMs)).toBe(Math.round(before.mtimeMs))

      await page.locator('[data-testid="pdf-preview-save"]').click()
      await expect.poll(async() => readStatus(page), { timeout: 10000 }).toBe('stale')
      expect(fs.existsSync(out)).toBe(false)
    } finally {
      await app.close()
      fs.rmSync(out, { force: true })
    }
  })

  test('an image that was missing and then appears invalidates the preview', async() => {
    const markdown = '# Later\n\n![photo](late.png)\n\ntail\n'
    const launched = await launchWithMarkdown(markdown)
    const { app, page } = launched
    const dir = path.dirname(launched.filePath)
    const imagePath = path.join(dir, 'late.png')
    const out = path.join(dir, 'late.pdf')
    try {
      await waitForMenuReady(app)
      await stubSaveDialog(app, out)
      await openDialogAndReady(app, page)
      await generate(page)

      // The image could not be read at generation time; now it exists.
      fs.writeFileSync(imagePath, PNG_1PX)

      await page.locator('[data-testid="pdf-preview-save"]').click()
      await expect.poll(async() => readStatus(page), { timeout: 10000 }).toBe('stale')
      expect(fs.existsSync(out)).toBe(false)
    } finally {
      await app.close()
      fs.rmSync(out, { force: true })
      fs.rmSync(imagePath, { force: true })
    }
  })

  test('a failed write keeps the preview and a retry succeeds', async() => {
    const { app, page } = await launchWithMarkdown('# Retry\n\nbody\n')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-pdf-retry-'))
    // A directory at the target path makes the write fail like an unwritable target.
    const target = path.join(dir, 'growing.pdf')
    const realTarget = path.join(dir, 'growing-real.pdf')
    fs.mkdirSync(target)
    try {
      await waitForMenuReady(app)
      await stubSaveDialog(app, target)
      await openDialogAndReady(app, page)
      await generate(page)

      await page.locator('[data-testid="pdf-preview-save"]').click()
      await expect
        .poll(async() => page.locator('[data-testid="pdf-preview-error"]').textContent().catch(() => ''), {
          timeout: 20000
        })
        .not.toBe('')
      // The preview survives the failure and stays usable.
      expect(await readStatus(page)).toBe('ready')

      await stubSaveDialog(app, realTarget)
      await page.locator('[data-testid="pdf-preview-save"]').click()
      await expect.poll(() => fs.existsSync(realTarget), { timeout: 30000 }).toBe(true)
      expect(fs.readFileSync(realTarget).subarray(0, 5).toString('latin1')).toBe('%PDF-')
    } finally {
      await app.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('the isolated print page is torn down after a preview', async() => {
    const { app, page } = await launchWithMarkdown('# Cleanup\n\nbody\n')
    try {
      await waitForMenuReady(app)
      await openDialogAndReady(app, page)
      const before = await printPageCount(app)
      await generate(page)
      // No hidden window is left behind once the artifact exists.
      await expect.poll(() => printPageCount(app), { timeout: 20000 }).toBe(before)
    } finally {
      await app.close()
    }
  })

  test('the preview and the saved file are the same bytes', async() => {
    const { app, page } = await launchWithMarkdown('# Same bytes\n\nbody\n')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-pdf-bytes-'))
    const out = path.join(dir, 'same.pdf')
    try {
      await waitForMenuReady(app)
      await stubSaveDialog(app, out)
      await openDialogAndReady(app, page)
      await generate(page)
      const previewHash = await page.evaluate(() => {
        const value = (globalThis as unknown as { __inkiva_pdf_preview_hash__?: string })
          .__inkiva_pdf_preview_hash__
        return value ?? ''
      })
      await page.locator('[data-testid="pdf-preview-save"]').click()
      await expect.poll(() => fs.existsSync(out), { timeout: 30000 }).toBe(true)
      expect(createHash('sha256').update(fs.readFileSync(out)).digest('hex')).toBe(previewHash)
    } finally {
      await app.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
