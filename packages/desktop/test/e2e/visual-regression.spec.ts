import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  clickMenuById,
  launchElectron,
  launchWithMarkdown,
  sendIpcToRenderer,
  showSidebarPanel,
  setSourceMarkdown,
  waitForMenuReady
} from './helpers'

const MARKDOWN_KITCHEN_SINK = `# Inkiva visual baseline

The editor should feel calm, readable, and deliberate.

## Writing surface

> A quiet surface keeps attention on the document.

- [x] Light, dark, and paper appearances
- [ ] Responsive application chrome
- [ ] Stable editor interaction surfaces

| Surface | State | Token |
| --- | --- | --- |
| Editor | elevated | \`--surface-editor\` |
| Sidebar | quiet | \`--surface-sidebar\` |

## Code

\`\`\`ts
const appearance = 'paper'
console.log(appearance)
\`\`\`
`

const DIAGRAM_KITCHEN_SINK = `# Diagram visual baseline

The diagram block should use the same quiet editor surface as the rest of the document.

\`\`\`mermaid
flowchart LR
  A[Write] --> B{Review}
  B -->|Ready| C[Publish]
  B -->|Revise| A
\`\`\`
`

const SCREENSHOT_OPTIONS = {
  animations: 'disabled' as const,
  caret: 'hide' as const,
  scale: 'css' as const,
  maxDiffPixelRatio: 0.005
}

const setWindowSize = async(
  app: ElectronApplication,
  width: number,
  height = 720
): Promise<void> => {
  await app.evaluate(
    ({ BrowserWindow }, [windowWidth, windowHeight]) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (!win) throw new Error('No BrowserWindow found')
      win.setSize(windowWidth, windowHeight)
    },
    [width, height] as const
  )

  await expect.poll(() => app.windows()[0]?.evaluate(() => window.innerWidth)).toBe(width)
}

const settleForScreenshot = async(page: Page): Promise<void> => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.evaluate(() => document.fonts?.ready.then(() => true))
  await page.waitForTimeout(250)
}

const capture = async(page: Page, name: string): Promise<void> => {
  await settleForScreenshot(page)
  await expect(page).toHaveScreenshot(`${name}.png`, SCREENSHOT_OPTIONS)
}

const waitForAppearance = async(page: Page, appearance: string): Promise<void> => {
  await expect
    .poll(() => page.locator('html').getAttribute('data-inkiva-appearance'))
    .toBe(appearance)
}

const closeCommandPalette = async(page: Page): Promise<void> => {
  await page.keyboard.press('Escape')
  await page.waitForFunction(
    () => {
      const inputs = document.querySelectorAll('input.search')
      for (const input of inputs) {
        const rect = input.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0) return false
      }
      return true
    },
    null,
    { timeout: 5000 }
  )
}

const openPreferences = async(app: ElectronApplication, page: Page): Promise<Page> => {
  const settingsPromise = app.waitForEvent('window')
  await page.evaluate(() => {
    window.electron.ipcRenderer.send('mt::open-setting-window')
  })
  const settingsPage = await settingsPromise
  await settingsPage.waitForLoadState('domcontentloaded')
  await settingsPage.waitForSelector('.pref-container', { state: 'attached', timeout: 15000 })
  await settingsPage.waitForTimeout(500)
  return settingsPage
}

test.describe.serial('UI-14 visual regression baseline', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown(MARKDOWN_KITCHEN_SINK)
    app = launched.app
    page = launched.page
    await setWindowSize(app, 1280)
    await waitForMenuReady(app)
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('captures the three approved application appearances', async() => {
    await clickMenuById(app, 'light')
    await waitForAppearance(page, 'light')
    await capture(page, 'light-main-window')

    await clickMenuById(app, 'dark')
    await waitForAppearance(page, 'dark')
    await capture(page, 'dark-main-window')

    await clickMenuById(app, 'paper')
    await waitForAppearance(page, 'paper')
    await capture(page, 'paper-main-window')

    await clickMenuById(app, 'light')
    await waitForAppearance(page, 'light')
  })

  test('captures the compact responsive baselines', async() => {
    await clickMenuById(app, 'light')
    await waitForAppearance(page, 'light')

    await setWindowSize(app, 550)
    await capture(page, 'light-main-window-550')

    await setWindowSize(app, 768)
    await capture(page, 'light-main-window-768')

    await setWindowSize(app, 1280)
  })

  test('captures the files sidebar surface', async() => {
    await page.bringToFront()
    await showSidebarPanel(app, page, 'files')
    await capture(page, 'sidebar-files')
  })

  test('captures the workspace search sidebar surface', async() => {
    await showSidebarPanel(app, page, 'search')
    await capture(page, 'sidebar-search')
  })

  test('captures the table of contents sidebar surface', async() => {
    await showSidebarPanel(app, page, 'toc')
    await capture(page, 'sidebar-toc')
  })

  test('captures the preferences surface', async() => {
    const settingsPage = await openPreferences(app, page)
    try {
      await settingsPage.emulateMedia({ reducedMotion: 'reduce' })
      await expect(settingsPage.locator('.pref-setting')).toBeVisible()
      await expect(settingsPage.locator('.pref-setting > h4')).toBeVisible()
      await settingsPage.evaluate(() => document.fonts?.ready.then(() => true))
      await settingsPage.waitForTimeout(250)
      await expect(settingsPage).toHaveScreenshot('preferences.png', SCREENSHOT_OPTIONS)
    } finally {
      await settingsPage.close()
    }
  })

  test('captures the command palette launcher', async() => {
    await page.bringToFront()
    await sendIpcToRenderer(app, 'mt::show-command-palette')
    await expect(page.locator('input.search').first()).toBeVisible({ timeout: 5000 })
    await capture(page, 'command-palette')
    await closeCommandPalette(page)
  })

  test('captures a floating dialog surface', async() => {
    await page.bringToFront()
    await sendIpcToRenderer(app, 'mt::show-export-dialog', 'pdf')
    const dialog = page.locator('.print-settings-dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await capture(page, 'dialog')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden({ timeout: 5000 })
  })

  test('captures a neutral toast surface', async() => {
    await page.bringToFront()
    await sendIpcToRenderer(app, 'mt::show-notification', {
      title: 'Visual baseline',
      message: 'This notification should remain readable long enough to notice.',
      type: 'info',
      time: 30000
    })
    await expect(page.locator('.mt-notification')).toBeVisible({ timeout: 5000 })
    await capture(page, 'toast')
    await page.locator('.mt-notification .close').click()
    await expect(page.locator('.mt-notification')).toBeHidden({ timeout: 5000 })
  })

  test('captures the Markdown kitchen-sink document', async() => {
    await page.bringToFront()
    await capture(page, 'markdown-kitchen-sink')
  })

  test('captures the diagram kitchen-sink document', async() => {
    await page.bringToFront()
    await page.evaluate(() => {
      const editor = document.querySelector('.editor-component') as HTMLElement | null
      editor?.focus()
    })
    await setSourceMarkdown(page, app, DIAGRAM_KITCHEN_SINK)
    await expect(page.locator('.mu-diagram-preview svg').first()).toBeVisible({ timeout: 15000 })
    await capture(page, 'diagram-kitchen-sink')
  })

  test('captures the empty Welcome surface', async() => {
    const emptyDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-visual-empty-'))
    const empty = await launchElectron([emptyDirectory])
    try {
      await waitForMenuReady(empty.app)
      await setWindowSize(empty.app, 1280)
      await expect(empty.page.locator('[data-testid="welcome-surface"]')).toBeVisible({
        timeout: 10000
      })
      await capture(empty.page, 'empty-state')
    } finally {
      await empty.app.close()
      fs.rmSync(emptyDirectory, { recursive: true, force: true })
    }
  })
})
