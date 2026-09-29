import { expect, test } from '@playwright/test'
import type { ElectronApplication, Locator, Page } from 'playwright'
import {
  enterSourceMode,
  exitSourceMode,
  expectNoRendererErrors,
  getMarkdownContent,
  launchWithMarkdown,
  setSourceMarkdown,
  sendIpcToRenderer
} from './helpers'

const TABLE_2X2 = [
  '| a | b |',
  '| --- | --- |',
  '| c | d |',
  ''
].join('\n')

const EMPTY_TABLE_2X2 = [
  '|  |  |',
  '| --- | --- |',
  '|  |  |',
  ''
].join('\n')

const IME_TABLE_2X2 = [
  '| a |  |',
  '| --- | --- |',
  '| c | d |',
  ''
].join('\n')

const DRAG_TABLE = [
  '| h1 | h2 | h3 |',
  '| --- | --- | --- |',
  '| r1c1 | r1c2 | r1c3 |',
  '| r2c1 | r2c2 | r2c3 |',
  '| r3c1 | r3c2 | r3c3 |',
  ''
].join('\n')

const TABLE_3X3 = [
  '| a | b | c |',
  '| --- | :---: | ---: |',
  '| d | e | f |',
  '| g | h | i |',
  ''
].join('\n')

const cell = (page: Page, row: number, column: number): Locator =>
  page.locator('.mu-table-inner tr').nth(row).locator('.mu-table-cell-content').nth(column)

const tableDimensions = async(page: Page): Promise<{ rows: number; columns: number }> =>
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.mu-table-inner tr')]
    return {
      rows: rows.length,
      columns: rows[0]?.querySelectorAll('td').length ?? 0
    }
  })

const tableMatrix = async(page: Page): Promise<string[][]> =>
  await page.evaluate(() =>
    [...document.querySelectorAll('.mu-table-inner tr')].map(row =>
      [...row.querySelectorAll('.mu-table-cell-content')].map(node => {
        const block = (node as unknown as Record<string, unknown>).__MUYA_BLOCK__ as
          | { text?: string }
          | undefined
        return block?.text ?? ''
      })
    )
  )

const setCellCaret = async(page: Page, row: number, column: number, atEnd = true): Promise<void> => {
  const ok = await cell(page, row, column).evaluate((node, end) => {
    const block = (node as unknown as Record<string, unknown>).__MUYA_BLOCK__ as
      | { text?: string; setCursor?: (start: number, end: number, force?: boolean) => void }
      | undefined
    if (!block?.setCursor || typeof block.text !== 'string') return false
    const offset = end ? block.text.length : 0
    block.setCursor(offset, offset, true)
    return true
  }, atEnd)
  expect(ok).toBe(true)
}

const activeCell = async(page: Page): Promise<{ row: number; column: number; collapsed: boolean } | null> =>
  await page.evaluate(() => {
    const selection = document.getSelection()
    const node = selection?.anchorNode ?? null
    const element = node instanceof Element ? node : node?.parentElement ?? null
    const td = element?.closest('td')
    const tr = td?.parentElement
    const tbody = tr?.parentElement
    if (!(td instanceof HTMLTableCellElement) || !(tr instanceof HTMLTableRowElement) || !tbody) return null
    return {
      row: [...tbody.children].indexOf(tr),
      column: td.cellIndex,
      collapsed: selection?.isCollapsed ?? false
    }
  })

const dragSelect = async(
  page: Page,
  startRow: number,
  startColumn: number,
  endRow: number,
  endColumn: number
): Promise<void> => {
  const start = await cell(page, startRow, startColumn).boundingBox()
  const end = await cell(page, endRow, endColumn).boundingBox()
  if (!start || !end) throw new Error('Unable to resolve table-cell geometry')
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 8 })
  await page.mouse.up()
  await expect.poll(() => page.locator('.mu-table-cell-selected').count()).toBeGreaterThan(1)
}

const pasteText = async(page: Page, text: string, row = 0, column = 0): Promise<void> => {
  await cell(page, row, column).evaluate((target, value) => {
    const data = new DataTransfer()
    data.setData('text/plain', value)
    target.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: data,
      bubbles: true,
      cancelable: true
    }))
  }, text)
}

const openContextMenu = async(page: Page, row: number, column: number): Promise<Locator> => {
  await cell(page, row, column).click({ button: 'right' })
  const menu = page.locator('.mu-table-bar-tools [role="menu"]')
  await expect(menu).toBeVisible()
  return menu
}

const CONTEXT_INDEX: Record<string, number> = {
  'Insert Row Above': 0,
  'Insert Row Below': 1,
  'Insert Column Left': 2,
  'Insert Column Right': 3,
  'Delete Row': 4,
  'Delete Column': 5,
  'Delete Table': 6
}

const invokeContext = async(page: Page, row: number, column: number, label: string): Promise<void> => {
  const menu = await openContextMenu(page, row, column)
  const index = CONTEXT_INDEX[label]
  if (index === undefined) throw new Error(`Unknown table context action: ${label}`)
  await menu.locator('[role="menuitem"]').nth(index).click()
}

const openProperties = async(
  page: Page,
  row: number,
  column: number,
  expectedSize?: string
): Promise<Locator> => {
  const box = await cell(page, row, column).boundingBox()
  if (!box) throw new Error('Unable to resolve table-cell geometry for property toolbar')
  await page.mouse.move(box.x + box.width / 2, Math.max(1, box.y - 8))
  const toolbar = page.locator('.mu-table-column-tools-container [role="toolbar"]')
  const float = page.locator('.mu-table-column-tools-container')
  await expect.poll(async() => Number.parseFloat(await float.evaluate(node => (node as HTMLElement).style.opacity || '0')))
    .toBeGreaterThan(0)
  if (expectedSize) {
    await expect(toolbar.locator('li.item.size')).toContainText(expectedSize)
  }
  return toolbar
}

const chooseSize = async(page: Page, rows: number, columns: number): Promise<void> => {
  const toolbar = page.locator('.mu-table-column-tools-container [role="toolbar"]')
  await toolbar.locator('li.item.size').focus()
  await toolbar.locator('li.item.size').press('Enter')
  const picker = page.locator('.mu-table-picker')
  await expect(picker).toBeVisible()
  const rowInput = picker.locator('input.row-input')
  const columnInput = picker.locator('input.column-input')
  await rowInput.focus()
  await rowInput.press('Control+A')
  await rowInput.type(String(rows))
  await columnInput.focus()
  await columnInput.press('Control+A')
  await columnInput.type(String(columns))
  await columnInput.press('Enter')
}

const revealDragHandle = async(
  page: Page,
  type: 'right' | 'bottom',
  row: number,
  column: number
): Promise<{ handle: Locator; pressX: number; pressY: number }> => {
  const td = page.locator('.mu-table-inner tr').nth(row).locator('td.mu-table-cell').nth(column)
  const box = await td.boundingBox()
  if (!box) throw new Error('Unable to resolve table-cell geometry for drag handle')

  const revealX = type === 'right' ? box.x + box.width + 6 : box.x + box.width / 2
  const revealY = type === 'right' ? box.y + box.height / 2 : box.y + box.height + 6
  await page.mouse.move(revealX, revealY)

  const handle = page.locator(`.mu-table-drag-bar[data-drag="${type}"]`)
  await expect(handle).toBeVisible()
  const handleBox = await handle.boundingBox()
  if (!handleBox) throw new Error('Unable to resolve visible drag-handle geometry')

  // Pick a point that is simultaneously inside the rendered handle and inside
  // the drag-bar hover ownership band (OFFSET=20). This keeps the trailing
  // throttled mousemove from hiding the handle before the long press arms.
  let pressX: number
  let pressY: number
  if (type === 'right') {
    const minX = Math.max(handleBox.x + 1, box.x + box.width + 1)
    const maxX = Math.min(handleBox.x + handleBox.width - 1, box.x + box.width + 19)
    if (minX > maxX) throw new Error('Right drag handle does not overlap its hover ownership band')
    pressX = (minX + maxX) / 2
    pressY = Math.min(
      Math.max(box.y + box.height / 2, handleBox.y + 1),
      handleBox.y + handleBox.height - 1
    )
  } else {
    const minY = Math.max(handleBox.y + 1, box.y + box.height + 1)
    const maxY = Math.min(handleBox.y + handleBox.height - 1, box.y + box.height + 19)
    if (minY > maxY) throw new Error('Bottom drag handle does not overlap its hover ownership band')
    pressX = Math.min(
      Math.max(box.x + box.width / 2, handleBox.x + 1),
      handleBox.x + handleBox.width - 1
    )
    pressY = (minY + maxY) / 2
  }
  await page.mouse.move(pressX, pressY)
  const hitType = await page.evaluate(({ x, y }) =>
    document.elementFromPoint(x, y)?.closest('.mu-table-drag-bar')?.getAttribute('data-drag') ?? null,
  { x: pressX, y: pressY })
  expect(hitType).toBe(type)
  return { handle, pressX, pressY }
}

const dragVisibleHandleToCell = async(
  page: Page,
  probe: { handle: Locator; pressX: number; pressY: number },
  type: 'right' | 'bottom',
  targetRow: number,
  targetColumn: number
): Promise<void> => {
  const targetBox = await cell(page, targetRow, targetColumn).boundingBox()
  if (!targetBox) throw new Error('Unable to resolve drag geometry')
  const { pressX: x, pressY: y } = probe
  const targetX = targetBox.x + targetBox.width / 2
  const targetY = targetBox.y + targetBox.height / 2
  await page.mouse.down()

  // `_startDrag()` arms the document-level drag listeners and marks the
  // non-drag cells with `mu-cell-transform` before any >5px movement occurs.
  // Wait for that observable product state while the pointer remains still;
  // do not guess that a fixed 300ms timer has fired under CI load.
  await expect.poll(() => page.locator('.mu-table-inner .mu-cell-transform').count()).toBeGreaterThan(0)

  // Now cross the real 5px threshold and wait for the dragged row/column to
  // enter its public drag state.
  await page.mouse.move(
    type === 'bottom' ? x + 6 : x,
    type === 'right' ? y + 6 : y
  )
  await expect.poll(() => page.locator('.mu-table-inner .mu-drag-cell').count()).toBeGreaterThan(0)

  await page.mouse.move(targetX, targetY, { steps: 8 })
  await page.mouse.up()
}

const dragVisibleHandleBelowThreshold = async(
  page: Page,
  probe: { handle: Locator; pressX: number; pressY: number }
): Promise<void> => {
  const { pressX: x, pressY: y } = probe
  await page.mouse.down()
  await expect.poll(() => page.locator('.mu-table-inner .mu-cell-transform').count()).toBeGreaterThan(0)
  await page.mouse.move(x, y + 2)
  await page.mouse.up()
  await expect.poll(() => page.locator('.mu-table-inner .mu-cell-transform').count()).toBe(0)
  await expect(page.locator('.mu-table-inner .mu-drag-cell')).toHaveCount(0)
}

const undo = async(app: ElectronApplication): Promise<void> =>
  await sendIpcToRenderer(app, 'mt::editor-edit-action', 'undo')

test.describe.serial('P1 table interaction simplification — Electron acceptance', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown(TABLE_2X2, { suppressErrorDialog: true })
    app = launched.app
    page = launched.page
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('Flow A+B — continuous keyboard editing and final-cell Tab growth stay live', async() => {
    await setSourceMarkdown(page, app, EMPTY_TABLE_2X2)
    await setCellCaret(page, 0, 0)

    await page.keyboard.type('A')
    await page.keyboard.press('Tab')
    await page.keyboard.type('B')
    await page.keyboard.press('Enter')
    await page.keyboard.type('C')
    await page.keyboard.press('Shift+Enter')
    await page.keyboard.type('D')

    await expect.poll(() => tableMatrix(page)).toEqual([
      ['A', 'B'],
      ['', 'C<br>D']
    ])
    expect(await activeCell(page)).toEqual({ row: 1, column: 1, collapsed: true })

    await setSourceMarkdown(page, app, EMPTY_TABLE_2X2)
    await setCellCaret(page, 1, 1)
    await page.keyboard.press('Tab')
    await expect.poll(() => tableDimensions(page)).toEqual({ rows: 3, columns: 2 })
    expect(await activeCell(page)).toEqual({ row: 2, column: 0, collapsed: true })
    await undo(app)
    await expect.poll(() => tableDimensions(page)).toEqual({ rows: 2, columns: 2 })
    await expectNoRendererErrors(app)
  })

  test('Flow C — context-menu structure actions each undo atomically', async() => {
    const cases = [
      { label: 'Insert Row Below', changed: { rows: 3, columns: 2 } },
      { label: 'Insert Column Right', changed: { rows: 2, columns: 3 } },
      { label: 'Delete Row', changed: { rows: 1, columns: 2 } },
      { label: 'Delete Column', changed: { rows: 2, columns: 1 } }
    ]

    for (const entry of cases) {
      await setSourceMarkdown(page, app, TABLE_2X2)
      await invokeContext(page, 0, 0, entry.label)
      await expect.poll(() => tableDimensions(page)).toEqual(entry.changed)
      await undo(app)
      await expect.poll(() => tableDimensions(page)).toEqual({ rows: 2, columns: 2 })
      expect(await tableMatrix(page)).toEqual([['a', 'b'], ['c', 'd']])
    }
    await expectNoRendererErrors(app)
  })

  test('Flow D+E — compact properties resize safely and preserve four alignment states', async() => {
    await setSourceMarkdown(page, app, TABLE_3X3)
    await setCellCaret(page, 0, 1)
    await page.keyboard.press('Alt+Enter')
    const keyboardToolbar = page.locator('.mu-table-column-tools-container [role="toolbar"]')
    await expect(keyboardToolbar).toBeVisible()
    await expect(keyboardToolbar.locator('li.item').first()).toBeFocused()
    await chooseSize(page, 5, 4)
    await expect.poll(() => tableDimensions(page)).toEqual({ rows: 5, columns: 4 })

    await openProperties(page, 0, 1, '5 × 4')
    await chooseSize(page, 2, 2)
    const dialog = page.locator('.ag-table-resize-confirm-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('5 × 4')
    await expect(dialog).toContainText('2 × 2')
    await dialog.locator('.dialog-footer .el-button').first().click()
    await expect(dialog).toBeHidden()
    expect(await tableDimensions(page)).toEqual({ rows: 5, columns: 4 })

    await openProperties(page, 0, 1, '5 × 4')
    await chooseSize(page, 2, 2)
    await expect(dialog).toBeVisible()
    await dialog.locator('.dialog-footer .el-button').last().click()
    await expect(dialog).toBeHidden()
    await expect.poll(() => tableDimensions(page)).toEqual({ rows: 2, columns: 2 })
    await undo(app)
    await expect.poll(() => tableDimensions(page)).toEqual({ rows: 5, columns: 4 })

    await setSourceMarkdown(page, app, TABLE_3X3)
    for (const [label, marker] of [
      ['Align Left', ':---'],
      ['Align Center', ':---:'],
      ['Align Right', '---:']
    ] as const) {
      const toolbar = await openProperties(page, 0, 0, '3 × 3')
      const type = label === 'Align Left' ? 'left' : label === 'Align Center' ? 'center' : 'right'
      await toolbar.locator(`li.item.${type}`).focus()
      await toolbar.locator(`li.item.${type}`).press('Enter')
      const markdown = await getMarkdownContent(page, app)
      expect(markdown).toContain(marker)
    }

    const toolbar = await openProperties(page, 0, 0, '3 × 3')
    await toolbar.locator('li.item.none').focus()
    await toolbar.locator('li.item.none').press('Enter')
    const defaultMarkdown = await getMarkdownContent(page, app)
    expect(defaultMarkdown.split('\n')[1]).toMatch(/^\|\s*---\s*\|/)

    await enterSourceMode(page, app)
    const source = await page.evaluate(() => {
      const cm = document.querySelector('.source-code .CodeMirror') as
        | (Element & { CodeMirror?: { getValue(): string } })
        | null
      return cm?.CodeMirror?.getValue() ?? ''
    })
    expect(source).toContain('| --- |')
    await exitSourceMode(page, app)
    expect(await getMarkdownContent(page, app)).toBe(source)
    await expectNoRendererErrors(app)
  })

  test('Flow F — border handles reorder rows/columns atomically and invalid drag is a no-op', async() => {
    await setSourceMarkdown(page, app, DRAG_TABLE)
    const rowHandle = await revealDragHandle(page, 'right', 1, 2)
    await dragVisibleHandleToCell(page, rowHandle, 'right', 2, 2)
    await expect.poll(() => tableMatrix(page)).toEqual([
      ['h1', 'h2', 'h3'],
      ['r2c1', 'r2c2', 'r2c3'],
      ['r1c1', 'r1c2', 'r1c3'],
      ['r3c1', 'r3c2', 'r3c3']
    ])
    await undo(app)
    await expect.poll(() => tableMatrix(page)).toEqual([
      ['h1', 'h2', 'h3'],
      ['r1c1', 'r1c2', 'r1c3'],
      ['r2c1', 'r2c2', 'r2c3'],
      ['r3c1', 'r3c2', 'r3c3']
    ])

    await setSourceMarkdown(page, app, DRAG_TABLE)
    // Column reorder handle lives on the table's bottom edge, so reveal it
    // from the last row rather than an internal row boundary.
    const columnHandle = await revealDragHandle(page, 'bottom', 3, 0)
    await dragVisibleHandleToCell(page, columnHandle, 'bottom', 3, 1)
    await expect.poll(() => tableMatrix(page)).toEqual([
      ['h2', 'h1', 'h3'],
      ['r1c2', 'r1c1', 'r1c3'],
      ['r2c2', 'r2c1', 'r2c3'],
      ['r3c2', 'r3c1', 'r3c3']
    ])
    await undo(app)
    await expect.poll(() => tableMatrix(page)).toEqual([
      ['h1', 'h2', 'h3'],
      ['r1c1', 'r1c2', 'r1c3'],
      ['r2c1', 'r2c2', 'r2c3'],
      ['r3c1', 'r3c2', 'r3c3']
    ])

    const beforeInvalidDrag = await getMarkdownContent(page, app)
    const invalidHandle = await revealDragHandle(page, 'right', 1, 2)
    await dragVisibleHandleBelowThreshold(page, invalidHandle)
    expect(await getMarkdownContent(page, app)).toBe(beforeInvalidDrag)
    await expectNoRendererErrors(app)
  })

  test('Flow G+H — rectangular Delete and Cut never delete table structure', async() => {
    await setSourceMarkdown(page, app, TABLE_2X2)
    await dragSelect(page, 0, 0, 1, 1)
    await page.keyboard.press('Delete')
    await page.keyboard.press('Delete')
    await expect.poll(() => tableDimensions(page)).toEqual({ rows: 2, columns: 2 })
    expect(await tableMatrix(page)).toEqual([['', ''], ['', '']])
    await undo(app)
    await expect.poll(() => tableMatrix(page)).toEqual([['a', 'b'], ['c', 'd']])

    for (const [start, end] of [
      [[0, 0], [0, 1]],
      [[0, 0], [1, 0]],
      [[0, 0], [1, 1]]
    ] as const) {
      await setSourceMarkdown(page, app, TABLE_2X2)
      await dragSelect(page, start[0], start[1], end[0], end[1])
      await page.keyboard.press('Control+x')
      await expect.poll(() => tableDimensions(page)).toEqual({ rows: 2, columns: 2 })
      await undo(app)
      await expect.poll(() => tableMatrix(page)).toEqual([['a', 'b'], ['c', 'd']])
    }
    await expectNoRendererErrors(app)
  })

  test('Flow I — rectangular paste has deterministic scalar/matrix/fallback behavior and no silent no-op', async() => {
    const overwrite = page.locator('.ag-table-paste-overwrite-dialog')

    await setSourceMarkdown(page, app, TABLE_2X2)
    await dragSelect(page, 0, 0, 1, 1)
    await pasteText(page, 'x')
    await expect(overwrite).toBeVisible()
    await overwrite.locator('.dialog-footer .el-button').last().click()
    await expect.poll(() => tableMatrix(page)).toEqual([['x', 'x'], ['x', 'x']])

    await setSourceMarkdown(page, app, TABLE_2X2)
    await dragSelect(page, 0, 0, 1, 1)
    await pasteText(page, '1\t2\n3\t4')
    await expect(overwrite).toBeVisible()
    await overwrite.locator('.dialog-footer .el-button').last().click()
    await expect.poll(() => tableMatrix(page)).toEqual([['1', '2'], ['3', '4']])
    await undo(app)
    await expect.poll(() => tableMatrix(page)).toEqual([['a', 'b'], ['c', 'd']])

    await setSourceMarkdown(page, app, TABLE_2X2)
    await dragSelect(page, 0, 0, 1, 1)
    await pasteText(page, 'left\tright\nragged')
    await expect(overwrite).toBeVisible()
    await overwrite.locator('.dialog-footer .el-button').last().click()
    await expect.poll(() => tableMatrix(page)).toEqual([
      ['left\tright<br>ragged', 'left\tright<br>ragged'],
      ['left\tright<br>ragged', 'left\tright<br>ragged']
    ])

    await setSourceMarkdown(page, app, TABLE_2X2)
    await dragSelect(page, 1, 0, 1, 1)
    await pasteText(page, 'w\tx\tq\ny\tz\tr', 1, 0)
    await expect(overwrite).toBeVisible()
    await overwrite.locator('.dialog-footer .el-button').last().click()
    await expect.poll(() => tableDimensions(page)).toEqual({ rows: 3, columns: 3 })
    expect((await tableMatrix(page)).slice(1)).toEqual([
      ['w', 'x', 'q'],
      ['y', 'z', 'r']
    ])
    await expectNoRendererErrors(app)
  })

  test('Flow J — hard-break Source/WYSIWYG round-trip stays stable', async() => {
    await setSourceMarkdown(page, app, TABLE_2X2)
    await setCellCaret(page, 0, 0)
    await page.keyboard.press('Shift+Enter')
    await page.keyboard.type('tail')
    await expect.poll(() => tableMatrix(page)).toEqual([
      ['a<br>tail', 'b'],
      ['c', 'd']
    ])

    const beforeRoundTrip = await getMarkdownContent(page, app)
    expect(beforeRoundTrip).toContain('a<br>tail')
    await enterSourceMode(page, app)
    await exitSourceMode(page, app)
    expect(await getMarkdownContent(page, app)).toBe(beforeRoundTrip)
    await expectNoRendererErrors(app)
  })

  test('Flow K — CJK composition survives Tab, hard break, and paste without structural mutation', async() => {
    await setSourceMarkdown(page, app, IME_TABLE_2X2)
    await setCellCaret(page, 0, 0)
    await cell(page, 0, 0).evaluate(node => {
      const original = node.textContent ?? ''
      node.dispatchEvent(new CompositionEvent('compositionstart', {
        bubbles: true,
        cancelable: true,
        data: ''
      }))
      node.textContent = `${original}中`
      node.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        data: '中',
        inputType: 'insertCompositionText',
        isComposing: true
      }))
    })
    expect(await tableDimensions(page)).toEqual({ rows: 2, columns: 2 })

    await cell(page, 0, 0).evaluate(node => {
      node.dispatchEvent(new CompositionEvent('compositionend', {
        bubbles: true,
        cancelable: true,
        data: '中'
      }))
    })
    await expect.poll(async() => (await tableMatrix(page))[0][0]).toContain('中')
    expect(await tableDimensions(page)).toEqual({ rows: 2, columns: 2 })

    await page.keyboard.press('Tab')
    expect(await activeCell(page)).toEqual({ row: 0, column: 1, collapsed: true })
    await page.keyboard.press('Shift+Enter')
    await page.keyboard.type('tail')
    await expect.poll(async() => (await tableMatrix(page))[0][1]).toBe('<br>tail')

    await pasteText(page, '粘', 0, 1)
    await expect.poll(async() => (await tableMatrix(page))[0][1]).toBe('<br>tail粘')
    expect(await tableDimensions(page)).toEqual({ rows: 2, columns: 2 })
    await expectNoRendererErrors(app)
  })
})
