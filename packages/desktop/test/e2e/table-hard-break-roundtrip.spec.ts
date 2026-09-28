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
  await page.waitForTimeout(100)
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
    await expect(cell.locator('br')).toHaveCount(1)

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

    await enterSourceMode(first.page, first.app)
    const sourceBeforeSave = await readSource(first.page)
    expect(sourceBeforeSave).toContain('alpha<br>')
    expect(sourceBeforeSave.match(/<br>/g)).toHaveLength(1)
    expect(sourceBeforeSave).not.toContain('&lt;br&gt;')
    await exitSourceMode(first.page, first.app)

    await sendIpcToRenderer(first.app, 'mt::editor-ask-file-save')
    await expect.poll(
      () => fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n'),
      { timeout: 5000 }
    ).toContain('alpha<br>')
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
    expect(reopenedSource).toContain('alpha<br>')
    expect(reopenedSource).not.toContain('&lt;br&gt;')
  } finally {
    await first.app.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})
