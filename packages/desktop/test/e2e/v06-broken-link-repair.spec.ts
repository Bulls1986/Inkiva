import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  getMarkdownContent, launchElectron, waitForEditor,
  waitForMenuReady, sendIpcToRenderer
} from './helpers'

test('V06-07 / LINK-AC13: locate broken source, cancel without changes, repair one link, one Undo', async() => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'inkiva-v06-07-'))
  const source = path.join(root, 'guide.md')
  const before = '[valid](./valid.md) and [broken](./missing.md)'
  await fs.writeFile(source, before)
  await fs.writeFile(path.join(root, 'valid.md'), '# Valid')
  const { app, page } = await launchElectron([source], { waitForReady: false })
  try {
    await waitForEditor(page)
    await waitForMenuReady(app)
    await app.evaluate(({ BrowserWindow }, pathname) => {
      BrowserWindow.getAllWindows()[0].webContents.send('mt::open-directory', pathname)
    }, root)
    await expect.poll(() => page.evaluate(() =>
      window.documentIntelligence.getBrokenMarkdownLinks()
    )).toMatchObject({ complete: true, stale: false })
    await page.getByTestId('sidebar-document-info-button').click()
    const panel = page.locator('.document-intelligence')
    await expect(panel).toBeVisible()
    const brokenRow = panel.getByTestId('broken-link-row')
    await expect(brokenRow).toHaveCount(1)
    await expect(brokenRow).toContainText('missing.md')
    await brokenRow.getByTestId('broken-link-locate').click()
    await expect(page.locator('span.mu-link')).toHaveCount(2)
    await brokenRow.getByTestId('broken-link-repair').click()
    await expect(page.locator('.ag-link-completion-dialog')).toBeVisible()
    const input = page.locator('.ag-link-completion-input')
    await expect(input).toHaveValue('./missing.md')
    await input.press('Escape')
    await input.press('Escape')
    await expect(page.locator('.ag-link-completion-dialog')).not.toBeVisible()
    expect((await getMarkdownContent(page, app)).trim()).toBe(before)

    await brokenRow.getByTestId('broken-link-repair').click()
    await expect(page.locator('.ag-link-completion-dialog')).toBeVisible()
    await input.fill('./valid.md')
    await page.locator('.ag-link-completion-dialog .el-dialog__footer .el-button--primary').click()
    await expect.poll(async() => (await getMarkdownContent(page, app)).trim())
      .toBe('[valid](./valid.md) and [broken](./valid.md)')
    await expect(brokenRow).toHaveCount(0)
    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'undo')
    await expect.poll(async() => (await getMarkdownContent(page, app)).trim()).toBe(before)
    await expect(brokenRow).toHaveCount(1)
  } finally {
    await app.close()
    await fs.rm(root, { recursive: true, force: true })
  }
})
