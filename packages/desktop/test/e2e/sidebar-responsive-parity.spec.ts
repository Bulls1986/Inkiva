import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchWithMarkdown, showSidebarPanel } from './helpers'

const sidebarWidth = async(page: Page): Promise<number> =>
  page.evaluate(() => {
    const el = document.querySelector('.side-bar') as HTMLElement | null
    return el ? Math.round(el.getBoundingClientRect().width) : 0
  })

const editorMiddleLeft = async(page: Page): Promise<number> =>
  page.evaluate(() => {
    const el = document.querySelector('.editor-middle') as HTMLElement | null
    return el ? Math.round(el.getBoundingClientRect().left) : -1
  })

const setWindowSize = async(
  app: ElectronApplication,
  width: number,
  height = 800
): Promise<void> => {
  await app.evaluate(({ BrowserWindow }, [w, h]) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) throw new Error('No editor BrowserWindow found')
    win.setSize(w, h)
  }, [width, height] as const)
}

const waitForViewport = async(page: Page, width: number): Promise<void> => {
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width)
}

test.describe('Typora sidebar responsive parity', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# Sidebar responsive parity\n')
    app = launched.app
    page = launched.page
    await showSidebarPanel(app, page, 'files')
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('uses the Typora 270px default width on a regular window', async() => {
    await setWindowSize(app, 1200)
    await waitForViewport(page, 1200)
    await showSidebarPanel(app, page, 'files')

    await expect.poll(() => sidebarWidth(page)).toBe(270)
    await expect.poll(() => editorMiddleLeft(page)).toBe(270)
  })

  test('caps the rendered sidebar at 240px at or below 1000px without changing the saved preference', async() => {
    await setWindowSize(app, 1200)
    await waitForViewport(page, 1200)
    await showSidebarPanel(app, page, 'files')

    const dragBar = page.locator('.side-bar .drag-bar')
    const box = await dragBar.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.move(box!.x + 1, box!.y + 80)
    await page.mouse.down()
    await page.mouse.move(box!.x + 91, box!.y + 80, { steps: 6 })
    await page.mouse.up()

    await expect.poll(() => sidebarWidth(page)).toBeGreaterThan(300)
    const preferredWidth = await page.evaluate(() => Number(localStorage.getItem('side-bar-width')))
    expect(preferredWidth).toBeGreaterThan(300)

    await setWindowSize(app, 1000)
    await waitForViewport(page, 1000)
    await expect.poll(() => sidebarWidth(page)).toBe(240)
    await expect.poll(() => editorMiddleLeft(page)).toBe(240)

    const savedAtNarrowWidth = await page.evaluate(() => Number(localStorage.getItem('side-bar-width')))
    expect(savedAtNarrowWidth).toBe(preferredWidth)

    await setWindowSize(app, 1200)
    await waitForViewport(page, 1200)
    await expect.poll(() => sidebarWidth(page)).toBe(preferredWidth)
  })

  test('switches to overlay mode from 590px down so the sidebar no longer squeezes the editor', async() => {
    await setWindowSize(app, 590)
    await waitForViewport(page, 590)
    await showSidebarPanel(app, page, 'files')

    await expect(page.locator('.side-bar')).toHaveClass(/side-bar--overlay/)
    await expect.poll(() => sidebarWidth(page)).toBe(240)
    await expect.poll(() => editorMiddleLeft(page)).toBe(0)

    // Inkiva's BrowserWindow has minWidth: 550, so this is the smallest real
    // editor window and the most important compact-layout regression case.
    await setWindowSize(app, 550)
    await waitForViewport(page, 550)
    await expect(page.locator('.side-bar')).toHaveClass(/side-bar--overlay/)
    await expect.poll(() => editorMiddleLeft(page)).toBe(0)
  })

  test('leaves overlay mode again above 590px and resumes normal flex layout', async() => {
    await setWindowSize(app, 591)
    await waitForViewport(page, 591)
    await showSidebarPanel(app, page, 'files')

    await expect(page.locator('.side-bar')).not.toHaveClass(/side-bar--overlay/)
    await expect.poll(() => sidebarWidth(page)).toBe(240)
    await expect.poll(() => editorMiddleLeft(page)).toBe(240)
  })
})
