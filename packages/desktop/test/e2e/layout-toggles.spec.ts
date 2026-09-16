import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchWithMarkdown, clickMenuById } from './helpers'

// Wait until a `v-show`-toggled element's visibility differs from `wasVisible`.
// A missing element counts as "not visible", so the change-detection logic
// stays consistent whether v-show clears the inline style or unmounts the node.
const waitForVisibilityFlip = (page: Page, selector: string, wasVisible: boolean) =>
  page.waitForFunction(
    ({ sel, prior }) => {
      const el = document.querySelector(sel) as HTMLElement | null
      const visible = !!(el && el.style.display !== 'none' && el.offsetParent !== null)
      return visible !== prior
    },
    { sel: selector, prior: wasVisible },
    { timeout: 5000 }
  )

test.describe('Layout panel toggles', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# Layout\n\n## Section A\n\n## Section B\n')
    app = launched.app
    page = launched.page
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('Sidebar toggle changes .side-bar visibility', async() => {
    const sideBar = page.locator('.side-bar')
    const initial = await sideBar.isVisible()
    await clickMenuById(app, 'sideBarMenuItem')
    await waitForVisibilityFlip(page, '.side-bar', initial)
    const afterToggle = await sideBar.isVisible()
    expect(afterToggle).not.toBe(initial)
    await clickMenuById(app, 'sideBarMenuItem')
  })

  test('Tab bar toggle flips .editor-tabs visibility', async() => {
    const tabBar = page.locator('.editor-tabs')
    const initial = await tabBar.isVisible()
    await clickMenuById(app, 'tabBarMenuItem')
    await waitForVisibilityFlip(page, '.editor-tabs', initial)
    const afterToggle = await tabBar.isVisible()
    expect(afterToggle).not.toBe(initial)
    await clickMenuById(app, 'tabBarMenuItem')
  })

  test('Split Editor exposes a second document pane and can be closed', async() => {
    const splitPane = page.locator('[data-testid="split-document-pane"]')
    await expect(splitPane).toHaveCount(0)

    await clickMenuById(app, 'splitEditorMenuItem')
    await expect(page.locator('[data-testid="editor-split-container"]')).toHaveAttribute(
      'data-testid',
      'editor-split-container'
    )
    await expect(splitPane).toBeVisible()
    await expect(page.locator('[data-testid="primary-editor-pane"]')).toBeVisible()

    await clickMenuById(app, 'splitEditorMenuItem')
    await expect(splitPane).toHaveCount(0)
  })

  test('TOC menu toggles ToC panel without throwing', async() => {
    // Ensure sidebar is visible so TOC has somewhere to render.
    const sideBar = page.locator('.side-bar')
    if (!(await sideBar.isVisible())) {
      await clickMenuById(app, 'sideBarMenuItem')
      await page.waitForFunction(
        () => {
          const el = document.querySelector('.side-bar') as HTMLElement | null
          return el && el.offsetParent !== null
        },
        null,
        { timeout: 5000 }
      )
    }
    await clickMenuById(app, 'tocMenuItem')
    // No specific selector to assert (TOC mounts inside the sidebar);
    // verifying the menu invocation does not throw is the main signal.
    await page.waitForTimeout(200)
    await clickMenuById(app, 'tocMenuItem')
  })

  // The writing layout has no permanent icon rail. Closing the sidebar must
  // give the entire horizontal measure back to the document surface.
  test('Editor fills width after explicitly closing the sidebar', async() => {
    // Ensure sidebar is visible.
    const sideBar = page.locator('.side-bar')
    if (!(await sideBar.isVisible())) {
      await clickMenuById(app, 'sideBarMenuItem')
      await page.waitForFunction(
        () => {
          const el = document.querySelector('.side-bar') as HTMLElement | null
          return !!(el && el.offsetParent !== null)
        },
        null,
        { timeout: 5000 }
      )
    }

    await clickMenuById(app, 'sideBarMenuItem')
    await page.waitForFunction(
      () => {
        const sb = document.querySelector('.side-bar') as HTMLElement | null
        return !!sb && (sb.style.display === 'none' || sb.offsetParent === null)
      },
      null,
      { timeout: 5000 }
    )

    const { editorWidth, sideBarWidth, viewportWidth } = await page.evaluate(() => {
      const editor = document.querySelector('.editor-with-tabs') as HTMLElement | null
      const sb = document.querySelector('.side-bar') as HTMLElement | null
      return {
        editorWidth: editor ? editor.getBoundingClientRect().width : 0,
        sideBarWidth: sb ? sb.getBoundingClientRect().width : 0,
        viewportWidth: window.innerWidth
      }
    })
    expect(sideBarWidth).toBe(0)
    expect(Math.abs(editorWidth - viewportWidth)).toBeLessThanOrEqual(1)

    await clickMenuById(app, 'sideBarMenuItem')
    await expect(sideBar).toBeVisible({ timeout: 5000 })
  })
})
