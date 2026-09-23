import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { getMarkdownContent, launchWithMarkdown, sendIpcToRenderer } from './helpers'

const selectFirstEditorBlock = async(page: Page): Promise<string> => {
  return await page.evaluate(() => {
    const root = document.querySelector('.editor-component')
    const target = root?.querySelector('span.mu-paragraph-content')
    if (!(root instanceof HTMLElement) || !(target instanceof HTMLElement)) return ''

    root.focus()
    const range = document.createRange()
    range.selectNodeContents(target)

    const selection = window.getSelection()
    if (!selection) return ''
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
    root.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true
    }))
    return selection.toString()
  })
}

test.describe('Command palette', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# Palette\n')
    app = launched.app
    page = launched.page
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('IPC opens the palette', async() => {
    await sendIpcToRenderer(app, 'mt::show-command-palette')
    // The el-dialog renders a search input. It may be teleported outside
    // the .command-palette wrapper; locate by the search-wrapper or input.search.
    const searchInput = page.locator('.search-wrapper input.search, input.search').first()
    await expect(searchInput).toBeVisible({ timeout: 5000 })
    await page.keyboard.press('Escape')
  })

  test('titlebar search surface opens the same command palette', async() => {
    const launcher = page.locator('[data-testid="command-launcher"]')
    await expect(launcher).toBeVisible()
    await launcher.click()
    await expect(page.locator('input.search').first()).toBeVisible({ timeout: 5000 })
    await page.keyboard.press('Escape')
  })

  test('exposes launcher sections and keyboard selection', async() => {
    await sendIpcToRenderer(app, 'mt::show-command-palette')
    const listbox = page.locator('[role="listbox"]')
    const options = page.locator('[data-testid="command-palette-option"]')

    await expect(listbox).toBeVisible({ timeout: 5000 })
    await expect.poll(() => options.count()).toBeGreaterThan(1)
    await expect(options.first()).toHaveAttribute('aria-selected', 'true')

    await page.locator('input.search').first().focus()
    await page.keyboard.press('ArrowDown')
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('[data-testid="command-palette-section"]').first()).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('Escape closes the palette', async() => {
    await sendIpcToRenderer(app, 'mt::show-command-palette')
    await page.keyboard.press('Escape')
    await page.waitForFunction(
      () => {
        const inputs = document.querySelectorAll('input.search')
        for (const i of inputs) {
          const r = i.getBoundingClientRect()
          if (r.width > 0 && r.height > 0) return false
        }
        return true
      },
      null,
      { timeout: 5000 }
    )
  })

  test('first palette format command restores the original editor selection', async() => {
    const selected = await selectFirstEditorBlock(page)
    expect(selected).toContain('Palette')

    await sendIpcToRenderer(app, 'mt::show-command-palette')
    const searchInput = page.locator('input.search').first()
    await expect(searchInput).toBeVisible({ timeout: 5000 })
    await searchInput.fill('format.strong')

    const strongCommand = page.locator('#command-palette-option-format-strong')
    await expect(strongCommand).toBeVisible({ timeout: 5000 })
    await searchInput.press('Enter')

    await expect(searchInput).toBeHidden({ timeout: 5000 })
    await expect.poll(() => getMarkdownContent(page, app), { timeout: 8000 })
      .toContain('# **Palette**')
  })
})
