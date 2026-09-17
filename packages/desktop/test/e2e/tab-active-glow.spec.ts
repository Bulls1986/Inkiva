import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchWithMarkdown } from './helpers'

test.describe('active document tab visual state', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# Active tab\n\nA quiet tab state.\n')
    app = launched.app
    page = launched.page
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('blends the active tab into the title bar with a short bottom tail', async() => {
    const activeTab = page.locator('[data-testid="document-tabs"] li.active')
    await expect(activeTab).toBeVisible()

    const metrics = await activeTab.evaluate((element) => {
      const style = getComputedStyle(element)
      const tail = getComputedStyle(element, '::after')
      return {
        backgroundColor: style.backgroundColor,
        tailBackground: tail.backgroundImage,
        tailBottom: tail.bottom,
        tailHeight: tail.height,
        tailOpacity: tail.opacity,
        tailPointerEvents: tail.pointerEvents
      }
    })

    expect(metrics.backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(metrics.tailBackground).toContain('linear-gradient')
    expect(metrics.tailBottom).toBe('0px')
    expect(metrics.tailHeight).toBe('7px')
    expect(metrics.tailOpacity).toBe('1')
    expect(metrics.tailPointerEvents).toBe('none')
  })
})
