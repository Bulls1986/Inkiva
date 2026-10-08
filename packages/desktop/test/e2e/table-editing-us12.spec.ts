import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import {
  expectNoRendererErrors,
  getMarkdownContent,
  launchWithMarkdown,
  setSourceMarkdown
} from './helpers'

const BASE_TABLE = [
  '| a | b |',
  '| --- | --- |',
  '| c | d |',
  ''
].join('\n')

const placeCaretInFirstTableCell = async(page: Page): Promise<void> => {
  const committed = await page.evaluate(() => {
    const target = document.querySelector('.editor-component .mu-table-cell-content')
    if (!(target instanceof HTMLElement)) return false

    target.focus()
    const range = document.createRange()
    range.selectNodeContents(target)
    range.collapse(false)

    const selection = window.getSelection()
    if (!selection) return false
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
    target.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true
    }))

    return true
  })

  expect(committed).toBe(true)
  await page.waitForTimeout(100)
}

const pasteIntoFirstTableCell = async(page: Page, text: string): Promise<void> => {
  await placeCaretInFirstTableCell(page)
  await page.evaluate((value) => {
    const target = document.querySelector('.editor-component .mu-table-cell-content')
    if (!(target instanceof HTMLElement)) throw new Error('table cell target not found')

    const dataTransfer = new DataTransfer()
    dataTransfer.setData('text/plain', value)
    target.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: dataTransfer,
      bubbles: true,
      cancelable: true
    }))
  }, text)
}

const readTableMatrix = async(page: Page): Promise<string[][]> =>
  await page.evaluate(() =>
    [...document.querySelectorAll('.mu-table-inner tr')].map(row =>
      [...row.querySelectorAll('td')].map(cell => cell.textContent ?? '')
    )
  )

const triggerAppUndo = async(app: ElectronApplication): Promise<void> => {
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('mt::editor-edit-action', 'undo')
  })
}

test.describe('us12 table editing fidelity', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown(BASE_TABLE, { suppressErrorDialog: true })
    app = launched.app
    page = launched.page
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('opens the table-cell context menu, activates a structural action by keyboard, and undoes atomically', async() => {
    await placeCaretInFirstTableCell(page)
    const cell = page.locator('.editor-component .mu-table-cell-content').first()
    await cell.click({ button: 'right' })

    const menu = page.locator('.mu-table-bar-tools [role="menu"]')
    await expect(menu).toBeVisible({ timeout: 5000 })
    const items = menu.locator('[role="menuitem"]')
    await expect(items).toHaveCount(7)
    await expect(items.first()).toBeFocused()

    await items.first().press('Enter')
    const float = page.locator('.mu-float-wrapper.mu-table-bar-tools')
    await expect.poll(async() => float.evaluate((node) => {
      const style = getComputedStyle(node)
      return style.opacity === '0' && Number.parseFloat(style.top) < -9000
    }), { timeout: 5000 }).toBe(true)
    await expect.poll(
      () => page.locator('.mu-table-inner tr').count(),
      { timeout: 5000 }
    ).toBe(3)

    await triggerAppUndo(app)
    await expect.poll(
      () => page.locator('.mu-table-inner tr').count(),
      { timeout: 5000 }
    ).toBe(2)
    expect(await readTableMatrix(page)).toEqual([
      ['a', 'b'],
      ['c', 'd']
    ])
    await expectNoRendererErrors(app)
  })

  test('dismisses the cell context menu with Escape and outside click without editing Markdown', async() => {
    page.on('console', (msg) => {
      if (msg.text().startsWith('ISSUE224_RESTORE_')) {
        console.info(msg.text())
      }
    })
    const before = await getMarkdownContent(page, app)
    const cell = page.locator('.editor-component .mu-table-cell-content').first()
    const menu = page.locator('.mu-table-bar-tools [role="menu"]')
    const float = page.locator('.mu-float-wrapper.mu-table-bar-tools')

    const expectOffscreen = async(): Promise<void> => {
      // BaseFloat dismisses through opacity and off-screen placement.
      // Playwright toBeHidden() does not recognize those CSS conditions.
      await expect.poll(() => float.evaluate((node) => {
        const style = getComputedStyle(node)
        const bounds = node.getBoundingClientRect()
        return style.opacity === '0' && bounds.right < 0 && bounds.bottom < 0
      }), { timeout: 5000 }).toBe(true)
    }

    await cell.click({ button: 'right' })
    await expect(menu).toBeVisible()
    await expect(menu.locator('[role="menuitem"]')).toHaveCount(7)
    await expect(menu.locator('[role="menuitem"]').first()).toBeFocused()
    await page.keyboard.press('Escape')
    await expectOffscreen()
    const focusAfterEscape = await page.evaluate(() => {
      const active = document.activeElement
      const cell = document.querySelector('.editor-component .mu-table-cell-content')
      return {
        activeTag: active?.tagName,
        activeClass: active instanceof HTMLElement ? active.className : '',
        activeText: active?.textContent?.slice(0, 60),
        activeConnected: active?.isConnected,
        cellConnected: cell?.isConnected,
        cellIsActive: active === cell,
        focusedCells: document.querySelectorAll('.mu-table-cell-content:focus').length
      }
    })
    console.info('ISSUE224_FOCUS_AFTER_ESCAPE', JSON.stringify(focusAfterEscape))
    if (!focusAfterEscape.cellIsActive) {
      const manual = await cell.evaluate((node) => {
        node.focus({ preventScroll: true })
        return {
          succeeded: document.activeElement === node,
          connected: node.isConnected,
          editable: (node as HTMLElement).isContentEditable
        }
      })
      console.info('ISSUE224_MANUAL_FOCUS', JSON.stringify(manual))
    }
    expect(focusAfterEscape.cellIsActive).toBe(true)

    await cell.click({ button: 'right' })
    await expect(menu).toBeVisible()
    await expect(menu.locator('[role="menuitem"]').first()).toBeFocused()
    const bounds = await float.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.x + bounds!.width).toBeLessThan(1180)
    expect(bounds!.y + bounds!.height).toBeLessThan(600)
    await page.mouse.click(1180, 600)
    await expectOffscreen()
    expect(await getMarkdownContent(page, app)).toBe(before)
    await expectNoRendererErrors(app)
  })

  test('confirms non-empty rectangular TSV overwrite, cancels cleanly, and undoes atomically', async() => {
    const before = await getMarkdownContent(page, app)

    await pasteIntoFirstTableCell(page, 'x\ty\tz\n1\t2\t3')

    const dialog = page.locator('.ag-table-paste-overwrite-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('R1C1–R2C3')
    await expect(dialog).toContainText('4')
    await dialog.locator('.dialog-footer .el-button').first().click()
    await expect(dialog).toBeHidden()

    expect(await getMarkdownContent(page, app)).toBe(before)

    await pasteIntoFirstTableCell(page, 'x\ty\tz\n1\t2\t3')
    await expect(dialog).toBeVisible()
    await dialog.locator('.dialog-footer .el-button').last().click()
    await expect(dialog).toBeHidden()

    const pasted = await getMarkdownContent(page, app)
    expect(pasted).toContain('| x')
    expect(pasted).toContain('y')
    expect(pasted).toContain('z')
    expect(pasted).toContain('| 1')
    expect(pasted).toContain('2')
    expect(pasted).toContain('3')

    await triggerAppUndo(app)
    await expect.poll(() => readTableMatrix(page), { timeout: 8000 }).toEqual([
      ['a', 'b'],
      ['c', 'd']
    ])
    const restored = await getMarkdownContent(page, app)
    expect(restored).not.toContain('| x')
    expect(restored).not.toContain('| 1')
    await expectNoRendererErrors(app)
  })

  test('keeps ultra-wide horizontal overflow inside the table surface', async() => {
    const columns = Array.from({ length: 16 }, (_, index) => `Column ${index + 1} long heading`)
    const values = Array.from({ length: 16 }, (_, index) => `value-${index + 1}-xxxxxxxxxxxx`)
    const wideTable = [
      `| ${columns.join(' | ')} |`,
      `| ${columns.map(() => '---').join(' | ')} |`,
      `| ${values.join(' | ')} |`,
      ''
    ].join('\n')

    await setSourceMarkdown(page, app, wideTable)
    await page.waitForTimeout(150)

    const geometry = await page.evaluate(() => {
      const table = document.querySelector('.mu-table')
      const editor = document.querySelector('.editor-component')
      if (!(table instanceof HTMLElement) || !(editor instanceof HTMLElement)) {
        throw new Error('table/editor geometry target not found')
      }

      return {
        tableClientWidth: table.clientWidth,
        tableScrollWidth: table.scrollWidth,
        editorClientWidth: editor.clientWidth,
        editorScrollWidth: editor.scrollWidth,
        overflowX: getComputedStyle(table).overflowX
      }
    })

    expect(geometry.tableScrollWidth).toBeGreaterThan(geometry.tableClientWidth)
    expect(geometry.overflowX).toBe('auto')
    expect(geometry.editorScrollWidth).toBeLessThanOrEqual(geometry.editorClientWidth + 2)
    await expectNoRendererErrors(app)
  })
})
