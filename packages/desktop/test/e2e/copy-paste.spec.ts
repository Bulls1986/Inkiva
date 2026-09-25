import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import {
  clickMenuById,
  expectNoRendererErrors,
  getMarkdownContent,
  launchWithMarkdown,
  setSourceMarkdown
} from './helpers'

type ClipboardPayload = { text: string, html: string }

const COPY_DOC = 'A paragraph with **bold** text.\n'

const commitEditorSelection = async(page: Page, collapse: boolean): Promise<void> => {
  const committed = await page.evaluate((shouldCollapse) => {
    const root = document.querySelector('.editor-component')
    const target = root?.querySelector('span.mu-paragraph-content')
    if (!(root instanceof HTMLElement) || !(target instanceof HTMLElement)) return false

    root.focus()
    const range = document.createRange()
    const textNodes: Text[] = []
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT)
    let current: Node | null
    while ((current = walker.nextNode())) textNodes.push(current as Text)

    if (textNodes.length > 0) {
      const first = textNodes[0]
      const last = textNodes[textNodes.length - 1]
      if (shouldCollapse) {
        range.setStart(last, last.data.length)
        range.collapse(true)
      } else {
        range.setStart(first, 0)
        range.setEnd(last, last.data.length)
      }
    } else {
      range.selectNodeContents(target)
      if (shouldCollapse) range.collapse(false)
    }

    const selection = window.getSelection()
    if (!selection) return false
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
    root.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true
    }))
    return true
  }, collapse)

  expect(committed).toBe(true)
  await page.waitForTimeout(150)
}

const selectEditorText = async(page: Page): Promise<void> => {
  // Use a real keyboard selection instead of synthesizing only the DOM Range.
  // Muya owns a cached editor selection used by menu-driven copy; a synthetic
  // selectionchange can leave that cache stale even when window.getSelection()
  // visually looks selected.
  await placeEditorCaret(page)
  await page.keyboard.press('ControlOrMeta+a')
  await expect.poll(
    () => page.evaluate(() => window.getSelection()?.toString() ?? ''),
    { timeout: 5000 }
  ).toContain('bold')
}

const placeEditorCaret = async(page: Page): Promise<void> => {
  await commitEditorSelection(page, true)
}

const copyFromMenu = async(
  app: ElectronApplication,
  page: Page,
  id: string
): Promise<ClipboardPayload> => {
  // Observe the exact clipboard flavors written by Muya's real copy handler.
  // A ClipboardEvent's DataTransfer is write-oriented while the copy event is
  // being dispatched; Chromium does not guarantee that a later listener can
  // read earlier setData() writes back through getData(). Intercept setData()
  // on this event instead, while still letting the browser receive the writes.
  await page.evaluate(() => {
    const state = window as typeof window & {
      __inkivaCopyCapture?: Promise<ClipboardPayload>
    }
    state.__inkivaCopyCapture = new Promise<ClipboardPayload>((resolve, reject) => {
      const onCopy = (event: ClipboardEvent) => {
        const data = event.clipboardData
        if (!data) {
          resolve({ text: '', html: '' })
          return
        }
        const payload: ClipboardPayload = { text: '', html: '' }
        const originalSetData = data.setData.bind(data)
        data.setData = (format: string, value: string): void => {
          if (format === 'text/plain') payload.text = value
          if (format === 'text/html') payload.html = value
          originalSetData(format, value)
        }
        queueMicrotask(() => resolve(payload))
      }
      document.addEventListener('copy', onCopy, { capture: true, once: true })
      window.setTimeout(() => {
        document.removeEventListener('copy', onCopy, true)
        reject(new Error('copy event was not dispatched'))
      }, 8000)
    })
  })

  await clickMenuById(app, id)
  return await page.evaluate(() => {
    const state = window as typeof window & {
      __inkivaCopyCapture?: Promise<ClipboardPayload>
    }
    if (!state.__inkivaCopyCapture) throw new Error('copy capture was not installed')
    return state.__inkivaCopyCapture
  })
}

const dispatchPaste = async(
  page: Page,
  payload: { html?: string, text: string }
): Promise<void> => {
  await page.evaluate((value) => {
    const target = document.querySelector('.editor-component span.mu-paragraph-content')
    if (!target) throw new Error('editor content target not found')

    // placeEditorCaret() already committed a text-node boundary to Muya's
    // selection model. Rebuilding a range from the element boundary here would
    // make Chromium resolve the caret before the first inline child.
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
    await selectEditorText(page)
    const copied = await copyFromMenu(app, page, 'copyAsMarkdownMenuItem')

    expect(copied.html).toBe('')
    expect(copied.text).toContain('**bold**')
    expect(copied.text).not.toContain('<strong>')
    await expectNoRendererErrors(app)
  })

  test('Copy as HTML source puts sanitized source in plain text', async() => {
    await selectEditorText(page)
    const copied = await copyFromMenu(app, page, 'copyAsHtmlMenuItem')

    expect(copied.html).toBe('')
    expect(copied.text).toContain('<p>')
    expect(copied.text).toContain('<strong>bold</strong>')
    expect(copied.text).not.toContain('**bold**')
    await expectNoRendererErrors(app)
  })

  test('Copy as Rich keeps HTML and Markdown clipboard flavors', async() => {
    await selectEditorText(page)
    const copied = await copyFromMenu(app, page, 'copyAsRichMenuItem')

    expect(copied.html).toContain('<strong>bold</strong>')
    expect(copied.text).toContain('**bold**')
    await expectNoRendererErrors(app)
  })

  test('prefers HTML over conflicting plain text and accepts HTML-only paste', async() => {
    await setSourceMarkdown(page, app, 'Target: \n')
    await placeEditorCaret(page)
    await dispatchPaste(page, {
      html: '<p><strong>rich</strong></p>',
      text: 'plain fallback'
    })

    await expect.poll(() => getMarkdownContent(page, app), {
      timeout: 8000
    }).toContain('Target: **rich**')

    await setSourceMarkdown(page, app, 'HTML only: \n')
    await placeEditorCaret(page)
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
    await placeEditorCaret(page)
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
