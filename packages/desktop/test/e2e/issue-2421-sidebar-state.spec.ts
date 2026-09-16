import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { clickMenuById, launchWithMarkdown, showSidebarPanel } from './helpers'

// #2421 — explicitly closing and reopening the unified writing sidebar must
// preserve the user's width and tree section state.

const sideBarWidth = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector('.side-bar') as HTMLElement | null
    return el ? Math.round(el.getBoundingClientRect().width) : 0
  })

const setRegularWindowWidth = async(app: ElectronApplication, page: Page): Promise<void> => {
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) throw new Error('No editor BrowserWindow found')
    win.setSize(1200, 800)
  })
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(1200)
}

test.describe('#2421 sidebar state survives explicit close', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# Doc\n\n## A\n\n## B\n')
    app = launched.app
    page = launched.page
    await setRegularWindowWidth(app, page)
    await showSidebarPanel(app, page, 'files')
    await expect.poll(() => sideBarWidth(page)).toBeGreaterThan(220)
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('collapsing then re-expanding preserves a widened sidebar width', async() => {
    await setRegularWindowWidth(app, page)
    await showSidebarPanel(app, page, 'files')
    // Widen well past the 288px default so a width loss on collapse is
    // observable independently of the responsive 240px narrow-window cap.
    const dragBar = page.locator('.side-bar .drag-bar')
    const box = await dragBar.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + 80)
    await page.mouse.down()
    await page.mouse.move(box!.x + box!.width / 2 + 120, box!.y + 80, { steps: 8 })
    await page.mouse.up()
    await page.waitForFunction(() => {
      const el = document.querySelector('.side-bar') as HTMLElement | null
      return !!el && el.getBoundingClientRect().width >= 300
    }, null, { timeout: 5000 })

    const widened = await sideBarWidth(page)
    expect(widened).toBeGreaterThanOrEqual(300)

    await clickMenuById(app, 'sideBarMenuItem')
    await page.waitForFunction(() => {
      const el = document.querySelector('.side-bar') as HTMLElement | null
      return !!el && (el.style.display === 'none' || el.offsetParent === null)
    }, null, { timeout: 5000 })

    await clickMenuById(app, 'sideBarMenuItem')
    await page.waitForFunction(() => {
      const el = document.querySelector('.side-bar') as HTMLElement | null
      return !!el && el.offsetParent !== null && el.getBoundingClientRect().width > 50
    }, null, { timeout: 5000 })

    const reExpanded = await sideBarWidth(page)
    // The widened preferred width must survive the collapse round-trip.
    expect(Math.abs(reExpanded - widened)).toBeLessThanOrEqual(3)
  })

  test('a collapsed tree section stays collapsed after toggling the sidebar', async() => {
    await setRegularWindowWidth(app, page)
    await showSidebarPanel(app, page, 'files')
    const arrow = page.locator('.side-bar .opened-files > .title .icon-arrow').first()
    await expect(arrow).toBeVisible()

    if (await arrow.evaluate((el) => el.classList.contains('fold'))) {
      await arrow.click()
      await expect(arrow).not.toHaveClass(/fold/)
    }

    // Collapse the "Opened files" section.
    await arrow.click()
    await page.waitForFunction(() => {
      const a = document.querySelector('.side-bar .opened-files .icon-arrow')
      return !!(a && a.classList.contains('fold'))
    }, null, { timeout: 5000 })

    // Toggle the whole sidebar off and back on via View > Sidebar.
    await clickMenuById(app, 'sideBarMenuItem')
    await page.waitForTimeout(250)
    await clickMenuById(app, 'sideBarMenuItem')
    await page.waitForFunction(() => {
      const el = document.querySelector('.side-bar .opened-files') as HTMLElement | null
      return !!(el && el.offsetParent !== null)
    }, null, { timeout: 5000 })

    const stillCollapsed = await page.evaluate(() => {
      const a = document.querySelector('.side-bar .opened-files .icon-arrow')
      return !!(a && a.classList.contains('fold'))
    })
    expect(stillCollapsed).toBe(true)
  })
})
