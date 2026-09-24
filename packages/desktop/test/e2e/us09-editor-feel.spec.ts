import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { getMarkdownContent, launchWithMarkdown, expectNoRendererErrors } from './helpers'

const PARAGRAPH = '.editor-component span.mu-paragraph-content'

type Point = { x: number; y: number }

const textPoint = async(
  page: Page,
  selector: string,
  textOffset: number,
  edge: 'start' | 'end' | 'middle' = 'middle'
): Promise<Point> =>
  await page.locator(selector).first().evaluate(
    (element, input) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      let remaining = input.textOffset
      let node = walker.nextNode()
      while (node) {
        const length = node.textContent?.length ?? 0
        if (remaining < length) break
        remaining -= length
        node = walker.nextNode()
      }
      if (!node) throw new Error('Unable to resolve text offset')

      const length = node.textContent?.length ?? 0
      const start = Math.min(remaining, Math.max(0, length - 1))
      const range = document.createRange()
      range.setStart(node, start)
      range.setEnd(node, Math.min(start + 1, length))
      const rect = range.getBoundingClientRect()
      const x =
        input.edge === 'start'
          ? rect.left + 1
          : input.edge === 'end'
            ? rect.right - 1
            : rect.left + rect.width / 2
      return { x, y: rect.top + rect.height / 2 }
    },
    { textOffset, edge }
  )

const selectionSnapshot = async(page: Page): Promise<{
  text: string
  collapsed: boolean
  inFirstParagraph: boolean
}> =>
  await page.evaluate(() => {
    const selection = window.getSelection()
    const anchor =
      selection?.anchorNode?.nodeType === Node.TEXT_NODE
        ? selection.anchorNode.parentElement
        : (selection?.anchorNode as Element | null)
    const paragraph = anchor?.closest('span.mu-paragraph-content') ?? null
    const first = document.querySelector('span.mu-paragraph-content')
    return {
      text: selection?.toString() ?? '',
      collapsed: selection?.isCollapsed ?? true,
      inFirstParagraph: !!paragraph && paragraph === first
    }
  })

test.describe('US09 real editor feel', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown(
      'alpha beta gamma delta epsilon\n\nsecond paragraph stays untouched\n',
      { suppressErrorDialog: true }
    )
    app = launched.app
    page = launched.page
    await page.waitForSelector(PARAGRAPH, { state: 'visible', timeout: 15000 })
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('hover exposes the I-beam without stealing focus, then click places a live caret', async() => {
    await page.keyboard.press('ControlOrMeta+f')
    const findInput = page.locator('.search-bar .search input')
    await expect(findInput).toBeVisible()
    await findInput.fill('beta')
    await expect(findInput).toBeFocused()

    const paragraph = page.locator(PARAGRAPH).first()
    await paragraph.hover()
    expect(await paragraph.evaluate((el) => getComputedStyle(el).cursor)).toBe('text')
    await expect(findInput).toBeFocused()

    await page.keyboard.press('Escape')
    const point = await textPoint(page, PARAGRAPH, 9, 'end')
    await page.mouse.click(point.x, point.y)

    await expect.poll(() => selectionSnapshot(page)).toMatchObject({
      collapsed: true,
      inFirstParagraph: true
    })

    await page.keyboard.type('X')
    await expect.poll(() => getMarkdownContent(page, app)).toContain('betaX')
    await expectNoRendererErrors(app)
  })

  test('double-click selects a word and drag selection stays in the active document', async() => {
    const paragraphText = await page.locator(PARAGRAPH).first().innerText()
    const gammaOffset = paragraphText.indexOf('gamma')
    expect(gammaOffset).toBeGreaterThanOrEqual(0)
    const gamma = await textPoint(page, PARAGRAPH, gammaOffset + 2)
    await page.mouse.dblclick(gamma.x, gamma.y)

    await expect.poll(() => selectionSnapshot(page)).toMatchObject({
      text: 'gamma',
      collapsed: false,
      inFirstParagraph: true
    })

    const currentText = await page.locator(PARAGRAPH).first().innerText()
    const betaOffset = currentText.indexOf('beta')
    const deltaOffset = currentText.indexOf('delta')
    const start = await textPoint(page, PARAGRAPH, betaOffset, 'start')
    const end = await textPoint(page, PARAGRAPH, deltaOffset + 'delta'.length - 1, 'end')
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(end.x, end.y, { steps: 8 })
    await page.mouse.up()

    const dragged = await selectionSnapshot(page)
    expect(dragged.collapsed).toBe(false)
    expect(dragged.inFirstParagraph).toBe(true)
    expect(dragged.text).toContain('beta')
    expect(dragged.text).toContain('gamma')
    expect(dragged.text).toContain('delta')

    expect(await page.locator(PARAGRAPH).nth(1).innerText()).toBe('second paragraph stays untouched')
    await expectNoRendererErrors(app)
  })

  test('Shift-click extends the current selection instead of replacing document state', async() => {
    const text = await page.locator(PARAGRAPH).first().innerText()
    const betaOffset = text.indexOf('beta')
    const epsilonOffset = text.indexOf('epsilon')
    const anchor = await textPoint(page, PARAGRAPH, betaOffset, 'start')
    const extent = await textPoint(page, PARAGRAPH, epsilonOffset + 'epsilon'.length - 1, 'end')

    await page.mouse.click(anchor.x, anchor.y)
    await page.mouse.click(extent.x, extent.y, { modifiers: ['Shift'] })

    const extended = await selectionSnapshot(page)
    expect(extended.collapsed).toBe(false)
    expect(extended.inFirstParagraph).toBe(true)
    expect(extended.text).toContain('beta')
    expect(extended.text).toContain('epsilon')
    expect(await page.locator(PARAGRAPH).nth(1).innerText()).toBe('second paragraph stays untouched')
    await expectNoRendererErrors(app)
  })
})
