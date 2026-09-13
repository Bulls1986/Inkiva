import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { closeElectron, launchElectron, launchWithMarkdown, waitForMenuReady } from './helpers'

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
    // With no user path or recovery state, startup creates the default blank
    // document. The app entry path must not be mistaken for an opened folder.
    expect(title).toBe('Untitled-1')
  })

  test('shows the inline loading shell before the renderer mounts', async() => {
    const startup = await launchElectron([], {
      waitForReady: false,
      env: {
        INKIVA_E2E_RENDERER_STARTUP_DELAY_MS: '2000'
      }
    })

    try {
      await expect
        .poll(async() => {
          const loading = await startup.page
            .locator('.inkiva-bootstrap')
            .isVisible()
            .catch(() => false)
          const editorMounted = await startup.page.locator('.editor-container').count()
          const windowVisible = await startup.app.evaluate(
            ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? false
          )
          return { loading, editorMounted, windowVisible }
        }, { timeout: 10000 })
        .toEqual({ loading: true, editorMounted: 0, windowVisible: true })

      const scrollState = await startup.page.evaluate(() => ({
        documentOverflow: getComputedStyle(document.documentElement).overflow,
        bodyOverflow: getComputedStyle(document.body).overflow,
        documentScrollHeight: document.documentElement.scrollHeight,
        documentClientHeight: document.documentElement.clientHeight
      }))
      expect(scrollState.documentOverflow).toBe('hidden')
      expect(scrollState.bodyOverflow).toBe('hidden')
      expect(scrollState.documentScrollHeight).toBeLessThanOrEqual(scrollState.documentClientHeight)

      await expect(startup.page.locator('.editor-container')).toBeVisible({ timeout: 10000 })
    } finally {
      await closeElectron(startup.app)
    }
  })

  test('uses the persisted appearance for the pre-mount loading shell', async() => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-appearance-e2e-'))
    const preferencePath = path.join(__dirname, '../../static/preference.json')
    const preferences = JSON.parse(fs.readFileSync(preferencePath, 'utf8')) as Record<string, unknown>
    preferences.theme = 'paper'
    preferences.followSystemTheme = false
    fs.writeFileSync(path.join(userDataDir, 'preferences.json'), JSON.stringify(preferences), 'utf8')

    const started = await launchElectron([], {
      userDataDir,
      waitForReady: false,
      env: {
        INKIVA_E2E_RENDERER_STARTUP_DELAY_MS: '2000'
      }
    })

    try {
      await expect
        .poll(
          () =>
            started.page.evaluate(() => {
              const shell = document.querySelector('.inkiva-bootstrap') as HTMLElement | null
              return {
                appearance: document.documentElement.getAttribute('data-inkiva-appearance'),
                loading: shell !== null,
                background: shell ? getComputedStyle(shell).backgroundColor : ''
              }
            }),
          { timeout: 10000 }
        )
        .toEqual({
          appearance: 'paper',
          loading: true,
          background: 'rgb(255, 253, 248)'
        })
    } finally {
      await closeElectron(started.app)
      fs.rmSync(userDataDir, { recursive: true, force: true })
    }
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
