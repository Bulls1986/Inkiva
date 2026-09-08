import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchWithMarkdown, showSidebarPanel } from './helpers'

// #2421 — toggling the sidebar via its left-column icons must not lose state.
// Two bugs: (1) collapsing to the icon strip persisted the minimum width
// instead of the real preferred width, so re-expanding shrank the sidebar;
// (2) the tree's collapsed sections (Opened files / Directories) are local refs
// under a v-if, so collapsing the sidebar destroyed the tree and reset them on
// re-expand. These drive the real built app.

const filesIcon = (page: Page) =>
  page.locator('.side-bar .left-column > ul').first().locator('li').nth(0)

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

test.describe('#2421 sidebar state survives icon toggle', () => {
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
    // Widen well past the 270px default so a width loss on collapse is
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

    await filesIcon(page).click() // collapse to icon strip
    await page.waitForFunction(() => {
      const el = document.querySelector('.side-bar') as HTMLElement | null
      return !!el && el.getBoundingClientRect().width <= 50
    }, null, { timeout: 5000 })

    await filesIcon(page).click() // re-expand
    await page.waitForFunction(() => {
      const el = document.querySelector('.side-bar') as HTMLElement | null
      return !!el && el.getBoundingClientRect().width > 50
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

    // Toggle the whole sidebar off and back on via its icon.
    await filesIcon(page).click()
    await page.waitForTimeout(250)
    await filesIcon(page).click()
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
