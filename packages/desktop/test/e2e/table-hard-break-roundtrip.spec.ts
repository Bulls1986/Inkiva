import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from 'playwright'
import {
  enterSourceMode,
  exitSourceMode,
  launchElectron,
  sendIpcToRenderer,
  waitForEditor
} from './helpers'

const TABLE = [
  '| alpha | beta |',
  '| --- | --- |',
  '| gamma | delta |',
  ''
].join('\n')

const placeCaretAtEndOfFirstTableCell = async(page: Page): Promise<void> => {
  const committed = await page.evaluate(() => {
    const target = document.querySelector('.editor-component .mu-table-cell-content')
    if (!(target instanceof HTMLElement)) return false

    const block = (target as unknown as Record<string, unknown>).__MUYA_BLOCK__ as
      | { text?: string; setCursor?: (start: number, end: number, force?: boolean) => void }
      | undefined
    if (!block?.setCursor || typeof block.text !== 'string') return false

    block.setCursor(block.text.length, block.text.length, true)
    return true
  })

  expect(committed).toBe(true)
}

const readFirstTableCellText = async(page: Page): Promise<string> =>
  page.evaluate(() => {
    const target = document.querySelector('.editor-component .mu-table-cell-content')
    if (!(target instanceof HTMLElement)) return ''

    const block = (target as unknown as Record<string, unknown>).__MUYA_BLOCK__ as
      | { text?: string }
      | undefined
    return typeof block?.text === 'string' ? block.text : ''
  })

const expectFirstTableCellCaret = async(page: Page, logicalOffset: number): Promise<void> => {
  const state = await page.evaluate(() => {
    const target = document.querySelector('.editor-component .mu-table-cell-content')
    if (!(target instanceof HTMLElement)) return null

    const block = (target as unknown as Record<string, unknown>).__MUYA_BLOCK__ as
      | {
        getCursor?: () =>
            | {
              isCollapsed?: boolean
              start?: { offset?: number }
              end?: { offset?: number }
            }
            | null
      }
      | undefined
    const selection = document.getSelection()
    const anchorNode = selection?.anchorNode ?? null
    const anchorElement =
      anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement ?? null
    const cursor = block?.getCursor?.() ?? null

    return {
      rangeCount: selection?.rangeCount ?? 0,
      nativeCollapsed: selection?.isCollapsed ?? false,
      insideHiddenSyntax: !!anchorElement?.closest('.mu-hide, .mu-output-remove'),
      logicalCollapsed: cursor?.isCollapsed ?? false,
      startOffset: cursor?.start?.offset ?? -1,
      endOffset: cursor?.end?.offset ?? -1
    }
  })

  expect(state).not.toBeNull()
  expect(state!.rangeCount).toBe(1)
  expect(state!.nativeCollapsed).toBe(true)
  expect(state!.insideHiddenSyntax).toBe(false)
  expect(state!.logicalCollapsed).toBe(true)
  expect(state!.startOffset).toBe(logicalOffset)
  expect(state!.endOffset).toBe(logicalOffset)
}

const readSource = async(page: Page): Promise<string> =>
  page.evaluate(() => {
    const cm = document.querySelector('.source-code .CodeMirror') as
      | (Element & { CodeMirror?: { getValue(): string } })
      | null
    return cm?.CodeMirror?.getValue() ?? ''
  })

test('Shift+Enter hard break stays visual in WYSIWYG and survives Source/save/reopen exactly once', async() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-table-hard-break-'))
  const filePath = path.join(root, 'hard-break.md')
  fs.writeFileSync(filePath, TABLE, 'utf8')

  let first = await launchElectron([filePath])
  try {
    await waitForEditor(first.page)
    await placeCaretAtEndOfFirstTableCell(first.page)
    await first.page.keyboard.press('Shift+Enter')

    const cell = first.page.locator('.editor-component .mu-table-cell-content').first()
    await expect.poll(() => readFirstTableCellText(first.page)).toBe('alpha<br>')
    await expect(cell.locator('br')).toHaveCount(1)
    await expectFirstTableCellCaret(first.page, 'alpha<br>'.length)

    // P0 contract: no second click/focus repair between hard break and continued typing.
    await first.page.keyboard.type('beta')
    await expect.poll(() => readFirstTableCellText(first.page)).toBe('alpha<br>beta')
    await expect(cell.locator('br')).toHaveCount(1)
    await expectFirstTableCellCaret(first.page, 'alpha<br>beta'.length)

    const marker = cell.locator('.mu-hide.mu-html-tag.mu-output-remove')
    await expect(marker).toHaveCount(1)
    const markerLayout = await marker.evaluate((node) => {
      const rect = node.getBoundingClientRect()
      const style = getComputedStyle(node)
      return {
        width: rect.width,
        height: rect.height,
        overflow: style.overflow
      }
    })
    expect(markerLayout.width).toBe(0)
    expect(markerLayout.height).toBe(0)
    expect(markerLayout.overflow).toBe('hidden')

    await sendIpcToRenderer(first.app, 'mt::editor-edit-action', 'undo')
    await expect.poll(() => readFirstTableCellText(first.page)).not.toBe('alpha<br>beta')
    await sendIpcToRenderer(first.app, 'mt::editor-edit-action', 'redo')
    await expect.poll(() => readFirstTableCellText(first.page)).toBe('alpha<br>beta')
    await expectFirstTableCellCaret(first.page, 'alpha<br>beta'.length)

    await enterSourceMode(first.page, first.app)
    const sourceBeforeSave = await readSource(first.page)
    expect(sourceBeforeSave).toContain('alpha<br>beta')
    expect(sourceBeforeSave.match(/<br>/g)).toHaveLength(1)
    expect(sourceBeforeSave).not.toContain('&lt;br&gt;')
    await exitSourceMode(first.page, first.app)

    await sendIpcToRenderer(first.app, 'mt::editor-ask-file-save')
    await expect.poll(
      () => fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n'),
      { timeout: 5000 }
    ).toContain('alpha<br>beta')
  } finally {
    await first.app.close()
  }

  first = await launchElectron([filePath])
  try {
    await waitForEditor(first.page)
    const reopenedCell = first.page.locator('.editor-component .mu-table-cell-content').first()
    await expect(reopenedCell.locator('br')).toHaveCount(1)
    const reopenedMarker = reopenedCell.locator('.mu-hide.mu-html-tag.mu-output-remove')
    await expect(reopenedMarker).toHaveCount(1)
    await expect.poll(async() => reopenedMarker.evaluate((node) => {
      const rect = node.getBoundingClientRect()
      return rect.width === 0 && rect.height === 0 && getComputedStyle(node).overflow === 'hidden'
    })).toBe(true)

    await enterSourceMode(first.page, first.app)
    const reopenedSource = await readSource(first.page)
    expect(reopenedSource.match(/<br>/g)).toHaveLength(1)
    expect(reopenedSource).toContain('alpha<br>beta')
    expect(reopenedSource).not.toContain('&lt;br&gt;')
  } finally {
    await first.app.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('typed <br> rerender keeps the caret live for the next character without a second click', async() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-table-typed-hard-break-'))
  const filePath = path.join(root, 'typed-hard-break.md')
  fs.writeFileSync(filePath, TABLE, 'utf8')

  const launched = await launchElectron([filePath])
  try {
    await waitForEditor(launched.page)
    await placeCaretAtEndOfFirstTableCell(launched.page)

    await launched.page.keyboard.type('<br>')
    await expect.poll(() => readFirstTableCellText(launched.page)).toBe('alpha<br>')
    await expect(
      launched.page.locator('.editor-component .mu-table-cell-content').first().locator('br')
    ).toHaveCount(1)
    await expectFirstTableCellCaret(launched.page, 'alpha<br>'.length)

    await launched.page.keyboard.type('beta')
    await expect.poll(() => readFirstTableCellText(launched.page)).toBe('alpha<br>beta')
    await expectFirstTableCellCaret(launched.page, 'alpha<br>beta'.length)

    await enterSourceMode(launched.page, launched.app)
    const source = await readSource(launched.page)
    expect(source).toContain('alpha<br>beta')
    expect(source.match(/<br>/g)).toHaveLength(1)
    expect(source).not.toContain('&lt;br&gt;')
  } finally {
    await launched.app.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})
