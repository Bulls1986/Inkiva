import { expect, test } from '@playwright/test'
import type { Page } from 'playwright'

import {
  clearRendererErrors,
  enterSourceMode,
  exitSourceMode,
  expectNoRendererErrors,
  launchWithMarkdown,
  sendIpcToRenderer,
  showSidebarPanel
} from './helpers'

type SourcePosition = { line: number; ch: number }

const sourceValue = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const root = document.querySelector('.source-code .CodeMirror') as
      | (Element & { CodeMirror?: { getValue(): string } })
      | null
    if (!root?.CodeMirror) throw new Error('CodeMirror source editor is unavailable')
    return root.CodeMirror.getValue()
  })

const replaceSourceRange = (
  page: Page,
  text: string,
  from: SourcePosition,
  to?: SourcePosition
): Promise<void> =>
  page.evaluate(
    ({ text, from, to }) => {
      const root = document.querySelector('.source-code .CodeMirror') as
        | (Element & {
          CodeMirror?: {
            focus(): void
            replaceRange(text: string, from: SourcePosition, to?: SourcePosition): void
          }
        })
        | null
      if (!root?.CodeMirror) throw new Error('CodeMirror source editor is unavailable')
      root.CodeMirror.focus()
      root.CodeMirror.replaceRange(text, from, to)
    },
    { text, from, to }
  )

const setSourceValue = (page: Page, markdown: string): Promise<void> =>
  page.evaluate((value) => {
    const root = document.querySelector('.source-code .CodeMirror') as
      | (Element & { CodeMirror?: { setValue(value: string): void } })
      | null
    if (!root?.CodeMirror) throw new Error('CodeMirror source editor is unavailable')
    root.CodeMirror.setValue(value)
  }, markdown)

const sourceCursor = (page: Page): Promise<{ anchor: SourcePosition; focus: SourcePosition }> =>
  page.evaluate(() => {
    const root = document.querySelector('.source-code .CodeMirror') as
      | (Element & {
        CodeMirror?: {
          getCursor(which: 'anchor' | 'focus'): SourcePosition
        }
      })
      | null
    if (!root?.CodeMirror) throw new Error('CodeMirror source editor is unavailable')
    return {
      anchor: root.CodeMirror.getCursor('anchor'),
      focus: root.CodeMirror.getCursor('focus')
    }
  })

test.describe('CORRECTNESS-02 / Source Mode P1 readiness', () => {
  test('Find follows the latest Source edit and the subsequent Source undo', async() => {
    const marker = 'SOURCE_FIND_LATEST_唯一🚀'
    const launched = await launchWithMarkdown('# Find\n\nbase text\n', {
      suppressErrorDialog: true
    })
    try {
      await clearRendererErrors(launched.app)
      await enterSourceMode(launched.page, launched.app)
      await replaceSourceRange(launched.page, '\n' + marker + '\n', { line: 2, ch: 9 })

      // Open Find immediately after the Source edit. The search UI delegates to
      // the hidden WYSIWYG editor, so this proves the current revision reaches
      // that search surface instead of searching a stale document.
      await sendIpcToRenderer(launched.app, 'mt::editor-edit-action', 'find')
      const input = launched.page.locator('.search-bar .search input')
      await expect(input).toBeVisible({ timeout: 5000 })
      await input.fill(marker)
      await expect(launched.page.locator('.search-bar .search-result'))
        .toContainText('1 / 1', { timeout: 10000 })
      await launched.page.keyboard.press('Escape')

      await sendIpcToRenderer(launched.app, 'mt::editor-edit-action', 'undo')
      await expect.poll(() => sourceValue(launched.page), { timeout: 5000 }).not.toContain(marker)

      await sendIpcToRenderer(launched.app, 'mt::editor-edit-action', 'find')
      await expect(input).toBeVisible({ timeout: 5000 })
      await input.fill(marker)
      await expect(launched.page.locator('.search-bar .search-result'))
        .toContainText('0 / 0', { timeout: 10000 })
      await launched.page.keyboard.press('Escape')
      await expectNoRendererErrors(launched.app)
    } finally {
      await launched.app.close()
    }
  })

  test('8 Source tabs keep independent buffers and undo never crosses documents', async() => {
    test.setTimeout(120000)
    const launched = await launchWithMarkdown('# TAB_0\n', { suppressErrorDialog: true })
    try {
      await clearRendererErrors(launched.app)
      await enterSourceMode(launched.page, launched.app)
      await replaceSourceRange(launched.page, '\nMARKER_0\n', { line: 1, ch: 0 })

      for (let index = 1; index < 8; index++) {
        await sendIpcToRenderer(
          launched.app,
          'mt::new-untitled-tab',
          true,
          '# TAB_' + index + '\n'
        )
        await expect.poll(() => sourceValue(launched.page), { timeout: 5000 })
          .toContain('# TAB_' + index)
        await replaceSourceRange(
          launched.page,
          '\nMARKER_' + index + '\n',
          { line: 1, ch: 0 }
        )
      }

      for (let index = 0; index < 8; index++) {
        await sendIpcToRenderer(launched.app, 'mt::switch-tab-by-index', index)
        await expect.poll(() => sourceValue(launched.page), { timeout: 5000 })
          .toContain('MARKER_' + index)
        const current = await sourceValue(launched.page)
        expect(current).toContain('# TAB_' + index)
        for (let other = 0; other < 8; other++) {
          if (other !== index) expect(current).not.toContain('MARKER_' + other)
        }
      }

      // Source history may be rebuilt on a tab switch; the hard contract is
      // isolation. Undo on TAB_3 may undo its own edit or be a no-op, but it
      // must never reveal content/history from another document.
      await sendIpcToRenderer(launched.app, 'mt::switch-tab-by-index', 3)
      await sendIpcToRenderer(launched.app, 'mt::editor-edit-action', 'undo')
      const afterUndo = await sourceValue(launched.page)
      expect(afterUndo).toContain('# TAB_3')
      for (let other = 0; other < 8; other++) {
        if (other !== 3) expect(afterUndo).not.toContain('MARKER_' + other)
      }

      await sendIpcToRenderer(launched.app, 'mt::switch-tab-by-index', 7)
      expect(await sourceValue(launched.page)).toContain('MARKER_7')
      await expectNoRendererErrors(launched.app)
    } finally {
      await launched.app.close()
    }
  })

  test('CJK and Unicode edit/delete/undo/redo survive a mode round trip exactly', async() => {
    const original = '中文，标点。Emoji😀🚀 FullＡＢＣ 日本語 한국어\n'
    const replaced = '中文，标点。Emoji🙂🚀 FullＡＢＣ 日本語 한국어\n'
    const launched = await launchWithMarkdown(original, { suppressErrorDialog: true })
    try {
      await clearRendererErrors(launched.app)
      await enterSourceMode(launched.page, launched.app)
      const emojiStart = original.indexOf('😀')
      expect(emojiStart).toBeGreaterThan(0)
      await replaceSourceRange(
        launched.page,
        '🙂',
        { line: 0, ch: emojiStart },
        { line: 0, ch: emojiStart + '😀'.length }
      )
      expect(await sourceValue(launched.page)).toBe(replaced)

      await sendIpcToRenderer(launched.app, 'mt::editor-edit-action', 'undo')
      expect(await sourceValue(launched.page)).toBe(original)
      await sendIpcToRenderer(launched.app, 'mt::editor-edit-action', 'redo')
      expect(await sourceValue(launched.page)).toBe(replaced)

      await exitSourceMode(launched.page, launched.app)
      await enterSourceMode(launched.page, launched.app)
      expect(await sourceValue(launched.page)).toBe(replaced)
      const cursor = await sourceCursor(launched.page)
      expect(cursor.anchor.line).toBeGreaterThanOrEqual(0)
      expect(cursor.focus.line).toBeGreaterThanOrEqual(0)
      await expectNoRendererErrors(launched.app)
    } finally {
      await launched.app.close()
    }
  })

  test('500 Source headings refresh Outline in order and remain navigable', async() => {
    test.setTimeout(120000)
    const headings = Array.from(
      { length: 500 },
      (_, index) => '# Source Heading ' + String(index + 1).padStart(3, '0') + '\n\nbody ' + index
    )
    const markdown = headings.join('\n\n') + '\n'
    const launched = await launchWithMarkdown('# seed\n', { suppressErrorDialog: true })
    try {
      await clearRendererErrors(launched.app)
      await enterSourceMode(launched.page, launched.app)
      await setSourceValue(launched.page, markdown)
      await exitSourceMode(launched.page, launched.app)
      await showSidebarPanel(launched.app, launched.page, 'toc', 15000)

      const tocSnapshot = await launched.page.evaluate(() => {
        const root = document.querySelector('#app') as
          | (Element & { __vue_app__?: { config?: { globalProperties?: { $pinia?: { _s?: Map<string, unknown> } } } } })
          | null
        const stores = root?.__vue_app__?.config?.globalProperties?.$pinia?._s
        const editor = stores?.get('editor') as { listToc?: Array<{ content?: string }> } | undefined
        return editor?.listToc?.map((item) => item.content ?? '') ?? []
      })
      expect(tocSnapshot).toHaveLength(500)
      expect(tocSnapshot[0]).toBe('Source Heading 001')
      expect(tocSnapshot[499]).toBe('Source Heading 500')

      const virtualTree = launched.page.locator('.side-bar-toc .toc-virtualized-tree')
      await expect(virtualTree).toBeVisible({ timeout: 10000 })
      const labels = virtualTree.locator('.toc-node-label')
      await expect(labels.first()).toHaveText('Source Heading 001')
      await virtualTree.evaluate((element) => {
        element.scrollTop = element.scrollHeight
        element.dispatchEvent(new Event('scroll'))
      })
      await expect(labels.last()).toHaveText('Source Heading 500', { timeout: 10000 })
      await labels.last().click()
      await expect
        .poll(
          () =>
            launched.page.evaluate(() => {
              const editor = document.querySelector<HTMLElement>('.editor-component')
              const normalizeHeading = (text: string): string => text.replace(/^[#\s]+/, '').trim()
              const target = Array.from(
                document.querySelectorAll<HTMLElement>('.mu-container h1')
              ).find((heading) => normalizeHeading(heading.textContent ?? '') === 'Source Heading 500')
              if (!editor || !target) return false
              const editorRect = editor.getBoundingClientRect()
              const targetRect = target.getBoundingClientRect()
              return targetRect.bottom > editorRect.top && targetRect.top < editorRect.bottom
            }),
          { timeout: 10000 }
        )
        .toBe(true)
      await expectNoRendererErrors(launched.app)
    } finally {
      await launched.app.close()
    }
  })
})
