import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import {
  closeElectron,
  focusEditor,
  getMarkdownContent,
  launchWithMarkdown,
  placeCaretInEditor,
  waitForEditor
} from './helpers'

const settle = async(page: Page): Promise<void> => {
  await page.waitForTimeout(220)
}

const readMarkdown = async(page: Page, app: ElectronApplication): Promise<string> => {
  await settle(page)
  return getMarkdownContent(page, app)
}

const selectRenderedContents = async(page: Page, selector: string): Promise<void> => {
  const selected = await page.evaluate((targetSelector) => {
    const root = document.querySelector('.editor-component')
    const target = document.querySelector(targetSelector)
    if (!(root instanceof HTMLElement) || !(target instanceof HTMLElement)) return false

    const range = document.createRange()
    range.selectNodeContents(target)
    const selection = document.getSelection()
    if (!selection) return false
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
    root.dispatchEvent(new KeyboardEvent('keyup', {
      bubbles: true,
      cancelable: true,
      key: 'ArrowRight'
    }))
    return true
  }, selector)
  expect(selected).toBe(true)
  await settle(page)
}

const launchAutoPairDocument = async(markdown: string) => await launchWithMarkdown(markdown)

test.describe('Typora-style Markdown auto pairing', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeEach(async() => {
    const launched = await launchAutoPairDocument('seed\n')
    app = launched.app
    page = launched.page
    await waitForEditor(page)
  })

  test.afterEach(async() => {
    if (app) await closeElectron(app)
  })

  test('pairs brackets and quotes and absorbs a manually typed closer', async() => {
    await placeCaretInEditor(page)
    await page.keyboard.type('(', { delay: 30 })
    await page.keyboard.type('abc', { delay: 30 })
    await page.keyboard.type(')', { delay: 30 })

    const markdown = await readMarkdown(page, app)
    expect(markdown).toContain('seed(abc)')

    await placeCaretInEditor(page)
    await page.keyboard.type('"', { delay: 30 })
    const quoted = await readMarkdown(page, app)
    expect(quoted).toContain('seed(abc)""')
  })

  for (const [marker, expected] of [
    ['*', 'seed**'],
    ['_', 'seed__'],
    ['~', 'seed~~'],
    ['$', 'seed$$'],
    ['^', 'seed^^']
  ] as const) {
    test(`pairs Markdown marker ${marker}`, async() => {
      await placeCaretInEditor(page)
      await page.keyboard.type(' ', { delay: 30 })
      await page.keyboard.type(marker, { delay: 30 })

      const markdown = await readMarkdown(page, app)
      expect(markdown).toContain(`seed ${expected.slice('seed'.length)}`)
    })
  }

  test('wraps selected text with a Markdown marker and keeps the selection inside', async() => {
    await focusEditor(page)
    await page.keyboard.type('*', { delay: 30 })

    const markdown = await readMarkdown(page, app)
    expect(markdown).toContain('*seed*')
  })

  test('deletes an empty auto-paired bracket as one unit', async() => {
    await placeCaretInEditor(page)
    await page.keyboard.type('(', { delay: 30 })
    await page.keyboard.press('Backspace')

    const markdown = await readMarkdown(page, app)
    expect(markdown).not.toContain('()')
  })

  test('does not pair an escaped Markdown marker', async() => {
    await placeCaretInEditor(page)
    await page.keyboard.type('\\*', { delay: 30 })

    const markdown = await readMarkdown(page, app)
    expect(markdown).toContain('\\*')
    expect(markdown).not.toContain('\\**')
  })

  test('does not auto-pair Markdown markers inside a fenced code block', async() => {
    const launched = await launchAutoPairDocument('```js\nseed\n```\n')
    await closeElectron(app)
    app = launched.app
    page = launched.page
    await waitForEditor(page)

    const code = page.locator('.mu-codeblock-content').first()
    await expect(code).toBeVisible({ timeout: 5000 })
    await code.click()
    await page.keyboard.press('End')
    await page.keyboard.type('*', { delay: 30 })

    const markdown = await readMarkdown(page, app)
    expect(markdown).toContain('seed*')
    expect(markdown).not.toContain('seed**')
  })

  test('preserves the link destination when wrapping its rendered label', async() => {
    const launched = await launchAutoPairDocument('[seed](https://example.com)\n')
    await closeElectron(app)
    app = launched.app
    page = launched.page
    await waitForEditor(page)

    await selectRenderedContents(page, '.mu-link')
    await page.keyboard.type('*', { delay: 30 })

    const markdown = await readMarkdown(page, app)
    expect(markdown).toContain('[*seed*](https://example.com)')
  })

  test('keeps table structure while pairing in a table cell', async() => {
    const launched = await launchAutoPairDocument('| head |\n| --- |\n| seed |\n')
    await closeElectron(app)
    app = launched.app
    page = launched.page
    await waitForEditor(page)

    const cell = page.locator('.mu-table-cell-content').last()
    await expect(cell).toBeVisible({ timeout: 5000 })
    await cell.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' ', { delay: 30 })
    await page.keyboard.type('*', { delay: 30 })

    const markdown = await readMarkdown(page, app)
    expect(markdown.split('\n').filter((line) => line.trim().startsWith('|'))).toHaveLength(3)
    expect(markdown).toContain('seed **')
  })

  test('does not pair markers during IME composition and commits CJK text afterward', async() => {
    await placeCaretInEditor(page)

    const before = await page.evaluate(() => window.muya?.editor.activeContentBlock?.text ?? '')
    await page.evaluate(() => {
      const block = window.muya?.editor.activeContentBlock
      const node = block?.domNode as HTMLElement | undefined
      if (!block || !node) return

      const original = (node.textContent ?? '').replace(/\u200B/g, '')
      node.dispatchEvent(new CompositionEvent('compositionstart', {
        bubbles: true,
        cancelable: true,
        data: ''
      }))
      node.textContent = `${original}*`
      node.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        data: '*',
        inputType: 'insertCompositionText',
        isComposing: true
      }))
    })

    const during = await page.evaluate(() => ({
      composed: window.muya?.editor.activeContentBlock?.isComposed === true,
      text: window.muya?.editor.activeContentBlock?.text ?? ''
    }))
    expect(during.composed).toBe(true)
    expect(during.text).toBe(before)

    await page.evaluate(() => {
      const block = window.muya?.editor.activeContentBlock
      const node = block?.domNode as HTMLElement | undefined
      if (!block || !node) return

      const original = (node.textContent ?? '').replace(/\u200B/g, '').replace(/\*$/, '')
      const finalText = `${original}你`
      node.textContent = finalText
      const textNode = node.firstChild
      if (textNode) {
        const range = document.createRange()
        range.setStart(textNode, finalText.length)
        range.collapse(true)
        const selection = document.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
      }
      node.dispatchEvent(new CompositionEvent('compositionend', {
        bubbles: true,
        cancelable: true,
        data: '你'
      }))
    })

    await expect.poll(async() => page.evaluate(() => ({
      composed: window.muya?.editor.activeContentBlock?.isComposed === true,
      text: window.muya?.editor.activeContentBlock?.text ?? ''
    }))).toEqual({ composed: false, text: `${before}你` })
  })
})
