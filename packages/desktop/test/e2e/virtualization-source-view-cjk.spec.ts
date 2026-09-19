import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'

import {
  clearRendererErrors,
  clickMenuById,
  enterSourceMode,
  exitSourceMode,
  expectNoRendererErrors,
  launchWithMarkdown,
  sendIpcToRenderer,
  showSidebarPanel
} from './helpers'

const SECTION_COUNT = 42
const PARAGRAPHS_PER_SECTION = 8
const DISTANT_CJK_NEEDLE = '远端中文目标段落-虚拟化查找'

const buildDocument = (): string => {
  const parts: string[] = []
  for (let section = 1; section <= SECTION_COUNT; section++) {
    parts.push('# 中文标题 ' + section)
    for (let paragraph = 0; paragraph < PARAGRAPHS_PER_SECTION; paragraph++) {
      const suffix =
        section === SECTION_COUNT - 2 && paragraph === 6
          ? ' ' + DISTANT_CJK_NEEDLE
          : ''
      parts.push(
        '第' +
          section +
          '节第' +
          paragraph +
          '段 Inkiva 编辑器，包含中文标点“测试”、Emoji 🚀 与版本 v0.4.0。' +
          suffix
      )
    }
  }
  return parts.join('\n\n') + '\n'
}

const readVirtualization = (page: Page): Promise<{
  enabled: boolean
  totalBlocks: number
  mountedBlocks: number
}> =>
  page.evaluate(() => {
    const root = document.querySelector<HTMLElement>(
      '.mu-container[data-virtualization-enabled="true"]'
    )
    return {
      enabled: !!root,
      totalBlocks: Number(root?.dataset.virtualTotalBlocks ?? 0),
      mountedBlocks: Number(root?.dataset.virtualMountedBlocks ?? 0)
    }
  })

const sourceValue = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const root = document.querySelector('.source-code .CodeMirror') as
      | (Element & { CodeMirror?: { getValue(): string } })
      | null
    return root?.CodeMirror?.getValue() ?? ''
  })

const appendSource = async(page: Page, value: string): Promise<void> => {
  await page.evaluate((append) => {
    const root = document.querySelector('.source-code .CodeMirror') as
      | (Element & {
        CodeMirror?: {
          getValue(): string
          setValue(value: string): void
        }
      })
      | null
    if (!root?.CodeMirror) throw new Error('CodeMirror source editor is unavailable')
    root.CodeMirror.setValue(root.CodeMirror.getValue() + append)
  }, value)
}

test.describe('@virtualization-core virtualization Source/Focus/CJK regressions', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeEach(async() => {
    const launched = await launchWithMarkdown(buildDocument(), {
      filename: '虚拟化-中文-source-focus.md',
      suppressErrorDialog: true,
      waitForEditorTimeout: 30000
    })
    app = launched.app
    page = launched.page
    await clearRendererErrors(app)
  })

  test.afterEach(async() => {
    if (app) await app.close()
  })

  test('SOURCE-LIFE-006/SOURCE-SYNC-013: Source mode receives the complete logical Markdown, not only mounted WYSIWYG blocks', async() => {
    const before = await readVirtualization(page)
    expect(before.enabled).toBe(true)
    expect(before.mountedBlocks).toBeGreaterThan(0)
    expect(before.mountedBlocks).toBeLessThan(before.totalBlocks / 2)

    await enterSourceMode(page, app)
    const fullSource = await sourceValue(page)
    expect(fullSource).toContain('# 中文标题 1')
    expect(fullSource).toContain('# 中文标题 ' + SECTION_COUNT)
    expect(fullSource).toContain(DISTANT_CJK_NEEDLE)

    await appendSource(page, '\n# Source 新增中文标题 🚀\n\n源码新增段落。\n')
    expect(await sourceValue(page)).toContain('Source 新增中文标题 🚀')
    await exitSourceMode(page, app)

    await showSidebarPanel(app, page, 'toc')
    await expect(
      page.locator('.side-bar-toc').getByText('Source 新增中文标题 🚀', { exact: true })
    ).toBeVisible({ timeout: 10000 })

    const after = await readVirtualization(page)
    expect(after.enabled).toBe(true)
    expect(after.mountedBlocks).toBeLessThan(after.totalBlocks / 2)
    await expectNoRendererErrors(app)
  })

  test('CN-FIND-006/CN-OUT-003: distant Chinese Find and Outline navigation work independently of mounted DOM', async() => {
    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'find')
    const input = page.locator('.search-bar .search input')
    await expect(input).toBeVisible()
    await input.fill(DISTANT_CJK_NEEDLE)
    await expect(page.locator('.search-result')).toContainText('1 / 1', { timeout: 8000 })
    await expect(page.locator('.mu-highlight').first()).toBeVisible({ timeout: 8000 })
    await page.keyboard.press('Escape')

    await showSidebarPanel(app, page, 'toc')
    const targetText = '中文标题 37'
    await page.locator('.side-bar-toc').getByText(targetText, { exact: true }).click()
    await expect
      .poll(
        () =>
          page
            .locator('.side-bar-toc .toc-node-label.is-active[aria-current="location"]')
            .first()
            .textContent(),
        { timeout: 8000 }
      )
      .toContain(targetText)

    await expect(
      page
        .locator('.mu-container h1, .mu-container h2, .mu-container h3')
        .filter({ hasText: targetText })
        .first()
    ).toBeVisible({ timeout: 8000 })
    await expectNoRendererErrors(app)
  })

  test('FOCUS-008/FOCUS-034/CN-FOCUS-001: Focus mode preserves the virtual reading anchor while editing Chinese text and undoing it', async() => {
    await showSidebarPanel(app, page, 'toc')
    const headingText = '中文标题 25'
    await page.locator('.side-bar-toc').getByText(headingText, { exact: true }).click()
    const heading = page
      .locator('.mu-container h1, .mu-container h2, .mu-container h3')
      .filter({ hasText: headingText })
      .first()
    await expect(heading).toBeVisible({ timeout: 8000 })
    const paragraph = page
      .locator('.mu-paragraph-content')
      .filter({ hasText: /^第25节第0段/ })
      .first()
    await expect(paragraph).toBeVisible({ timeout: 8000 })

    const scrollTop = (): Promise<number> =>
      page.locator('.editor-component').evaluate((node) => (node as HTMLElement).scrollTop)
    const beforeFocus = await scrollTop()

    await clickMenuById(app, 'focusModeMenuItem')
    await expect(page.locator('.editor-wrapper')).toHaveClass(/(^|\s)focus(\s|$)/)
    await expect.poll(() => scrollTop(), { timeout: 5000 }).toBeGreaterThan(beforeFocus - 80)

    await paragraph.click()
    await page.keyboard.press('End')
    await page.keyboard.insertText(' 中文输入😀')
    await expect(page.locator('.editor-component')).toContainText('中文输入😀')

    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'undo')
    await expect(page.locator('.editor-component')).not.toContainText('中文输入😀')

    const beforeExit = await scrollTop()
    await clickMenuById(app, 'focusModeMenuItem')
    await expect(page.locator('.editor-wrapper')).not.toHaveClass(/(^|\s)focus(\s|$)/)
    const afterExit = await scrollTop()
    expect(Math.abs(afterExit - beforeExit)).toBeLessThanOrEqual(80)
    await expectNoRendererErrors(app)
  })
})
