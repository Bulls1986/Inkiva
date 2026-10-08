import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { launchElectron } from './helpers'

// Asserts the renderer is actually sandboxed: contextIsolation: true,
// nodeIntegration: false, sandbox: true. If any of these regress, the bridge
// is no longer load-bearing and the security boundary is gone — this single
// test is the canary.

test.describe('Renderer sandboxing', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const { app: electronApp, page: firstPage } = await launchElectron()
    app = electronApp
    page = firstPage
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('contextBridge active, nodeIntegration disabled, no preload leakage', async() => {
    // contextBridge produced window.electron with a working ipcRenderer
    expect(await page.evaluate(() => typeof window.electron?.ipcRenderer?.invoke)).toBe('function')

    // nodeIntegration: false — no require, no global, no Buffer
    expect(await page.evaluate(() => typeof require)).toBe('undefined')
    expect(await page.evaluate(() => typeof global)).toBe('undefined')
    expect(await page.evaluate(() => typeof Buffer)).toBe('undefined')

    // Preload-scope identifiers are not visible to the renderer
    const leaked = await page.evaluate(() =>
      ['fileUtilsAPI', 'electronAPI', 'pathAPI', 'commandAPI'].some((name) => name in window)
    )
    expect(leaked).toBe(false)
  })

  test('two actual Electron senders keep their workspace backlinks isolated', async() => {
    const rootA = await fs.mkdtemp(path.join(os.tmpdir(), 'inkiva-links-window-a-'))
    const rootB = await fs.mkdtemp(path.join(os.tmpdir(), 'inkiva-links-window-b-'))
    try {
      const targetA = path.join(rootA, 'target.md')
      const targetB = path.join(rootB, 'target.md')
      await Promise.all([
        fs.writeFile(targetA, '# A'),
        fs.writeFile(targetB, '# B'),
        fs.writeFile(path.join(rootA, 'source.md'), '[A](./target.md)'),
        fs.writeFile(path.join(rootB, 'source.md'), '[B](./target.md)')
      ])

      const nextWindow = app.waitForEvent('window')
      await page.evaluate(() => window.electron.ipcRenderer.send('app-create-editor-window'))
      const secondPage = await nextWindow
      await secondPage.waitForLoadState('domcontentloaded')
      await expect(secondPage.locator('.editor-container')).toBeVisible({ timeout: 20000 })

      await page.evaluate((root) => window.documentIntelligence.indexWorkspace(root), rootA)
      await secondPage.evaluate((root) => window.documentIntelligence.indexWorkspace(root), rootB)
      const backlinksA = await page.evaluate(
        (target) => window.documentIntelligence.getBacklinks(target),
        targetA
      )
      const backlinksB = await secondPage.evaluate(
        (target) => window.documentIntelligence.getBacklinks(target),
        targetB
      )
      expect(backlinksA).toHaveLength(1)
      expect(backlinksB).toHaveLength(1)
      expect(await page.evaluate(
        (target) => window.documentIntelligence.getBacklinks(target),
        targetB
      )).toHaveLength(0)

      await secondPage.close()
      expect(await page.evaluate(
        (target) => window.documentIntelligence.getBacklinks(target),
        targetA
      )).toHaveLength(1)
    } finally {
      await Promise.all([
        fs.rm(rootA, { recursive: true, force: true }),
        fs.rm(rootB, { recursive: true, force: true })
      ])
    }
  })
})
