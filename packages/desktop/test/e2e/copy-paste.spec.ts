import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import {
  clickMenuById,
  expectNoRendererErrors,
  focusEditor,
  getMarkdownContent,
  launchWithMarkdown,
  placeCaretInEditor,
  setSourceMarkdown
} from './helpers'

type ClipboardPayload = { text: string, html: string }

const COPY_DOC = 'A paragraph with **bold** text.\n'

const copyFromMenu = async(
  app: ElectronApplication,
  page: Page,
  id: string
): Promise<ClipboardPayload> => {
  // Capture the data on the real Electron copy event instead of reading the
  // process-global OS clipboard. This keeps the contract deterministic when
  // other Electron E2E files run in the second worker.
  const copied = page.evaluate(() => new Promise<ClipboardPayload>((resolve, reject) => {
    const onCopy = (event: ClipboardEvent) => {
      const data = event.clipboardData
      resolve({
        text: data?.getData('text/plain') || '',
        html: data?.getData('text/html') || ''
      })
    }
    document.addEventListener('copy', onCopy, { once: true })
    window.setTimeout(() => {
      document.removeEventListener('copy', onCopy)
      reject(new Error('copy event was not dispatched'))
    }, 8000)
  }))

  await clickMenuById(app, id)
  return copied
}

const dispatchPaste = async(
  page: Page,
  payload: { html?: string, text: string }
): Promise<void> => {
  await page.evaluate((value) => {
    const target = document.querySelector('.editor-component span.mu-paragraph-content')
    if (!target) throw new Error('editor content target not found')

    const range = document.createRange()
    range.selectNodeContents(target)
    range.collapse(false)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    const dataTransfer = new DataTransfer()
    if (value.html !== undefined) dataTransfer.setData('text/html', value.html)
    dataTransfer.setData('text/plain', value.text)
    target.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: dataTransfer,
      bubbles: true,
      cancelable: true
    }))
  }, payload)
}

test.describe('Typora-style intelligent copy and paste', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown(COPY_DOC, { suppressErrorDialog: true })
    app = launched.app
    page = launched.page
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('provides separate Markdown, rich HTML, and HTML-source menu commands', async() => {
    const ids = await app.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu()
      return [
        'copyAsMarkdownMenuItem',
        'copyAsRichMenuItem',
        'copyAsHtmlMenuItem'
      ].map(id => !!menu?.getMenuItemById(id))
    })

    expect(ids).toEqual([true, true, true])
  })

  test('Copy as Markdown writes portable Markdown only', async() => {
    await focusEditor(page)
    const copied = await copyFromMenu(app, page, 'copyAsMarkdownMenuItem')

    expect(copied.html).toBe('')
    expect(copied.text).toContain('**bold**')
    expect(copied.text).not.toContain('<strong>')
    await expectNoRendererErrors(app)
  })

  test('Copy as HTML source puts sanitized source in plain text', async() => {
    await focusEditor(page)
    const copied = await copyFromMenu(app, page, 'copyAsHtmlMenuItem')

    expect(copied.html).toBe('')
    expect(copied.text).toContain('<p>')
    expect(copied.text).toContain('<strong>bold</strong>')
    expect(copied.text).not.toContain('**bold**')
    await expectNoRendererErrors(app)
  })

  test('Copy as Rich keeps HTML and Markdown clipboard flavors', async() => {
    await focusEditor(page)
    const copied = await copyFromMenu(app, page, 'copyAsRichMenuItem')

    expect(copied.html).toContain('<strong>bold</strong>')
    expect(copied.text).toContain('**bold**')
    await expectNoRendererErrors(app)
  })

  test('prefers HTML over conflicting plain text and accepts HTML-only paste', async() => {
    await setSourceMarkdown(page, app, 'Target: \n')
    await placeCaretInEditor(page)
    await dispatchPaste(page, {
      html: '<p><strong>rich</strong></p>',
      text: 'plain fallback'
    })

    await expect.poll(() => getMarkdownContent(page, app), {
      timeout: 8000
    }).toContain('Target: **rich**')

    await setSourceMarkdown(page, app, 'HTML only: \n')
    await dispatchPaste(page, {
      html: '<p><em>markup</em></p>',
      text: ''
    })

    await expect.poll(() => getMarkdownContent(page, app), {
      timeout: 8000
    }).toContain('HTML only: *markup*')
    await expectNoRendererErrors(app)
  })

  test('sanitizes executable HTML before Markdown conversion', async() => {
    await setSourceMarkdown(page, app, 'Safe: \n')
    await placeCaretInEditor(page)
    await dispatchPaste(page, {
      html: '<p><strong>safe</strong><script>bad()</script>' +
        '<img src="x" onerror="bad()"></p>',
      text: 'unsafe fallback'
    })

    await expect.poll(() => getMarkdownContent(page, app), { timeout: 8000 }).toContain('Safe: **safe**')
    const result = await getMarkdownContent(page, app)
    expect(result).not.toContain('unsafe fallback')
    expect(result).not.toContain('bad()')
    await expectNoRendererErrors(app)
  })
})
