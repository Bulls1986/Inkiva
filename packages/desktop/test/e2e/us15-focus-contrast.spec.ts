import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import {
  clickMenuById,
  expectNoRendererErrors,
  launchWithMarkdown,
  sendIpcToRenderer
} from './helpers'

const effectiveOpacity = async(locator: ReturnType<Page['locator']>): Promise<number> =>
  locator.evaluate((node) => {
    let element: Element | null = node
    let opacity = 1
    while (element) {
      opacity *= Number.parseFloat(getComputedStyle(element).opacity || '1')
      element = element.parentElement
    }
    return opacity
  })

test.describe('US15 Focus contrast contract', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeEach(async() => {
    const launched = await launchWithMarkdown(
      [
        '# Focus contrast',
        '',
        'needle first search result',
        '',
        'middle paragraph',
        '',
        'needle second search result',
        '',
        'tail paragraph'
      ].join('\n')
    )
    app = launched.app
    page = launched.page
  })

  test.afterEach(async() => {
    if (app) await app.close()
  })

  test('AC-63: inactive search matches keep normal contrast while unrelated blocks stay dimmed', async() => {
    await clickMenuById(app, 'focusModeMenuItem')
    await expect(page.locator('.editor-wrapper')).toHaveClass(/(^|\s)focus(\s|$)/)
    await expect(page.locator('.mu-editor.mu-focus-mode')).toBeVisible()

    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'find')
    const input = page.locator('.search-bar .search input')
    await expect(input).toBeVisible()
    await input.fill('needle')

    await expect(page.locator('.mu-highlight')).toHaveCount(1)
    await expect(page.locator('.mu-selection')).toHaveCount(1)

    const inactiveMatch = page.locator('.mu-selection').first()
    const inactiveMatchBlock = inactiveMatch.locator('xpath=ancestor::*[parent::*[contains(@class,"mu-container")]][1]')
    await expect(inactiveMatchBlock).not.toHaveClass(/\bmu-active\b/)

    const unrelatedBlock = page.locator('.mu-container > p.mu-paragraph').filter({
      hasText: /^middle paragraph$/
    }).first()
    await expect(unrelatedBlock).not.toHaveClass(/\bmu-active\b/)

    // Focus opacity transitions for 200 ms; inspect the settled composited
    // result rather than a transition frame.
    await page.waitForTimeout(250)
    expect(await effectiveOpacity(inactiveMatch)).toBeGreaterThanOrEqual(0.99)
    await expect(unrelatedBlock).toHaveCSS('opacity', '0.25')
    await expectNoRendererErrors(app)
  })

  test('AC-63: a native cross-block selection remains at normal contrast in Focus mode', async() => {
    await clickMenuById(app, 'focusModeMenuItem')
    await expect(page.locator('.mu-editor.mu-focus-mode')).toBeVisible()

    const startBlock = page.locator('.mu-container > p.mu-paragraph').filter({
      hasText: /^needle first search result$/
    }).first()
    const endBlock = page.locator('.mu-container > p.mu-paragraph').filter({
      hasText: /^middle paragraph$/
    }).first()
    const start = startBlock.locator('.mu-paragraph-content').first()
    const end = endBlock.locator('.mu-paragraph-content').first()
    const startBox = await start.boundingBox()
    const endBox = await end.boundingBox()
    if (!startBox || !endBox) throw new Error('US15 selection endpoints are not visible')

    await page.mouse.move(startBox.x + 8, startBox.y + startBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(endBox.x + Math.max(12, endBox.width - 8), endBox.y + endBox.height / 2, {
      steps: 12
    })
    await page.mouse.up()

    await expect
      .poll(() =>
        page.evaluate(() => {
          const selection = window.getSelection()
          return selection && !selection.isCollapsed ? selection.toString() : ''
        })
      )
      .toContain('middle paragraph')

    // Let Focus's 200 ms transition settle before measuring the composited
    // opacity of the blocks participating in the user's native selection.
    await page.waitForTimeout(250)
    expect(await effectiveOpacity(startBlock)).toBeGreaterThanOrEqual(0.99)
    expect(await effectiveOpacity(endBlock)).toBeGreaterThanOrEqual(0.99)
    await expectNoRendererErrors(app)
  })
})
