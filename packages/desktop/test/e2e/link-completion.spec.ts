import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  getMarkdownContent,
  launchElectron,
  waitForEditor,
  waitForMenuReady,
  sendIpcToRenderer
} from './helpers'

test.describe('V06-03 / Ctrl+K workspace Markdown link completion', () => {
  test('cancel is read-only; keyboard choice inserts one link and one Undo restores label', async() => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'inkiva-v06-link-'))
    const filePath = path.join(root, 'guide.md')
    await fs.mkdir(path.join(root, 'docs'))
    await fs.writeFile(filePath, 'Guide\n')
    await fs.writeFile(path.join(root, 'docs', 'README.md'), '# README')
    const { app, page } = await launchElectron([filePath], { waitForReady: false })
    try {
      await waitForEditor(page)
      await waitForMenuReady(app)
      // This channel is main → renderer only, not a renderer → main send.
      await app.evaluate(({ BrowserWindow }, pathname) => {
        BrowserWindow.getAllWindows()[0].webContents.send('mt::open-directory', pathname)
      }, root)
      await expect.poll(() => page.evaluate(
        (sourcePath) => window.documentIntelligence.searchWorkspaceLinkCandidates(sourcePath, 'read'),
        filePath
      )).toEqual(expect.arrayContaining([
        expect.objectContaining({ relativePath: './docs/README.md' })
      ]))

      const selectLabel = async(): Promise<void> => {
        const paragraph = page.locator('.mu-paragraph-content').first()
        await paragraph.click()
        await page.keyboard.press('Home')
        await page.keyboard.press('Shift+End')
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k')
        await expect(page.locator('.ag-link-completion-dialog')).toBeVisible()
      }

      await selectLabel()
      await expect(page.locator('.ag-link-completion-option')).toContainText([
        './docs/README.md'
      ])
      // IME confirmation Enter must not select a candidate or mutate Markdown.
      const destinationInput = page.locator('.ag-link-completion-input')
      await destinationInput.evaluate((node) =>
        node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })))
      await destinationInput.press('Enter')
      await expect(page.locator('.ag-link-completion-dialog')).toBeVisible()
      // The modal intentionally blocks Source-mode menu actions. Assert the
      // active WYSIWYG content stays unchanged *while it is open*, then
      // verify the canonical Markdown bytes after cancellation below.
      await expect(page.locator('.mu-paragraph-content').first()).toHaveText('Guide')
      await destinationInput.evaluate((node) =>
        node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })))
      await page.locator('.ag-link-completion-input').press('Escape')
      await expect(page.locator('.ag-link-completion-list')).toHaveCount(0)
      await expect(page.locator('.ag-link-completion-dialog')).toBeVisible()
      await page.locator('.ag-link-completion-input').press('Escape')
      await expect(page.locator('.ag-link-completion-dialog')).not.toBeVisible()
      expect((await getMarkdownContent(page, app)).trim()).toBe('Guide')

      await selectLabel()
      await expect(page.locator('.ag-link-completion-option')).toContainText([
        './docs/README.md'
      ])
      await page.locator('.ag-link-completion-input').press('ArrowDown')
      await page.locator('.ag-link-completion-input').press('Enter')
      await page.locator('.ag-link-completion-input').press('Enter')
      await expect(page.locator('.ag-link-completion-dialog')).not.toBeVisible()
      await expect.poll(async() => (await getMarkdownContent(page, app)).trim())
        .toBe('[Guide](./docs/README.md)')

      await sendIpcToRenderer(app, 'mt::editor-edit-action', 'undo')
      await expect.poll(async() => (await getMarkdownContent(page, app)).trim())
        .toBe('Guide')
    } finally {
      await app.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
