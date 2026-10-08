import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { getMarkdownContent, launchWithMarkdown, setSourceMarkdown } from './helpers'

// Drive real keys through Electron after anchoring a native caret to the
// selected content span. The Muya unit contracts own all list/quote tree
// branches; this suite proves the desktop input pipeline reaches them.
const placeCaretAtStart = async(page: Page, selector: string, text: string): Promise<void> => {
  const matchingSpan = page.locator(selector).filter({ hasText: text }).first()
  await expect(matchingSpan).toBeAttached()
  const located = await page.evaluate(({ selector, text }) => {
    const root = document.querySelector('.editor-component') as HTMLElement | null
    const span = Array.from(document.querySelectorAll(selector))
      .find((item) => item.textContent?.trim() === text)
    if (!root || !span) return false

    root.focus()
    const range = document.createRange()
    range.selectNodeContents(span)
    range.collapse(true)
    const selection = window.getSelection()
    if (!selection) return false
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
    root.dispatchEvent(
      new KeyboardEvent('keyup', { key: 'ArrowLeft', bubbles: true, cancelable: true })
    )
    return true
  }, { selector, text })
  expect(located).toBe(true)
}

test.describe('US11 — structured block keyboard integration', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('US11 keyboard acceptance\n')
    app = launched.app
    page = launched.page
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('AC-48: nested list item Backspace promotes the item without dropping text', async() => {
    await setSourceMarkdown(page, app, '- parent\n  - child\n')
    await expect(page.locator('.editor-component ul li ul li')).toHaveCount(1)

    await placeCaretAtStart(page, '.editor-component ul li span.mu-paragraph-content', 'child')
    await page.keyboard.press('Backspace')

    await expect(page.locator('.editor-component ul li ul li')).toHaveCount(0)
    await expect.poll(() => getMarkdownContent(page, app)).toContain('- parent\n- child')
  })

  test('AC-49: Tab and Shift+Tab change only the selected quote paragraph depth', async() => {
    await setSourceMarkdown(page, app, '> first\n>\n> second\n\noutside\n')
    await expect(page.locator('.editor-component blockquote span.mu-paragraph-content')).toHaveCount(2)

    await placeCaretAtStart(page, '.editor-component blockquote span.mu-paragraph-content', 'second')
    await page.keyboard.press('Tab')

    await expect(page.locator('.editor-component blockquote blockquote')).toHaveCount(1)
    await expect.poll(() => getMarkdownContent(page, app)).toContain('> > second')

    await placeCaretAtStart(page, '.editor-component blockquote span.mu-paragraph-content', 'second')
    await page.keyboard.press('Shift+Tab')

    await expect(page.locator('.editor-component blockquote blockquote')).toHaveCount(0)
    const markdown = await getMarkdownContent(page, app)
    expect(markdown).toContain('> second')
    expect(markdown).toContain('outside')
    expect(markdown).not.toContain('> > second')
  })
})
