import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchWithMarkdown, showSidebarPanel } from './helpers'

test.describe('Inkiva keyboard focus and accessibility', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# Focus contract\\n')
    app = launched.app
    page = launched.page
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('keeps sidebar and tab controls reachable by keyboard', async() => {
    await showSidebarPanel(app, page, 'files')

    const rail = page.locator('.side-bar .sidebar-icon-button')
    await expect(rail).toHaveCount(5)
    await expect(rail.first()).toHaveAttribute('aria-label', /.+/)

    await rail.first().focus()
    await page.keyboard.press('Tab')
    await expect(rail.nth(1)).toBeFocused()

    const ring = await rail.nth(1).evaluate((element) => {
      const styles = getComputedStyle(element)
      return {
        outlineStyle: styles.outlineStyle,
        boxShadow: styles.boxShadow
      }
    })
    expect(ring.outlineStyle === 'solid' || ring.boxShadow !== 'none').toBe(true)

    const tabs = page.locator('.tabs-container [role="tab"]')
    await expect(tabs.first()).toBeVisible()
    await tabs.first().focus()
    await page.keyboard.press('Enter')
    await expect(tabs.first()).toBeFocused()
  })
})
