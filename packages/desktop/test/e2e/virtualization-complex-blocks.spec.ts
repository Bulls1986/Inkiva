import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'

import {
  clearRendererErrors,
  expectNoRendererErrors,
  getMarkdownContent,
  launchWithMarkdown,
  sendIpcToRenderer
} from './helpers'

const FILLERS = 220

const buildDocument = (): string => {
  const parts: string[] = ['# Virtual complex blocks']
  for (let index = 0; index < FILLERS; index++) {
    parts.push(`before table paragraph ${index}`)
  }
  parts.push(
    'TABLE_NAV_TARGET',
    [
      '| Name | Value |',
      '| --- | --- |',
      '| TABLE_CELL_TARGET | 中文😀 |'
    ].join('\n')
  )
  for (let index = 0; index < FILLERS; index++) {
    parts.push(`between blocks paragraph ${index}`)
  }
  parts.push(
    'CODE_NAV_TARGET',
    '```ts\nconst virtualCode = 1\n```'
  )
  for (let index = 0; index < FILLERS; index++) {
    parts.push(`after code paragraph ${index}`)
  }
  return parts.join('\n\n') + '\n'
}

const revealByFind = async(
  app: ElectronApplication,
  page: Page,
  needle: string
): Promise<void> => {
  await sendIpcToRenderer(app, 'mt::editor-edit-action', 'find')
  const input = page.locator('.search-bar .search input')
  await expect(input).toBeVisible({ timeout: 5000 })
  await input.fill(needle)
  await expect(page.locator('.search-result')).toContainText('1 / 1', { timeout: 8000 })
  await expect(page.locator('.mu-highlight').first()).toBeVisible({ timeout: 8000 })
  await page.keyboard.press('Escape')
}

const expectBoundedVirtualization = async(page: Page): Promise<void> => {
  const snapshot = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>(
      '.mu-container[data-virtualization-enabled="true"]'
    )
    return {
      enabled: !!root,
      total: Number(root?.dataset.virtualTotalBlocks ?? 0),
      mounted: Number(root?.dataset.virtualMountedBlocks ?? 0)
    }
  })
  expect(snapshot.enabled).toBe(true)
  expect(snapshot.total).toBeGreaterThan(500)
  expect(snapshot.mounted).toBeGreaterThan(0)
  expect(snapshot.mounted).toBeLessThan(snapshot.total / 2)
}

test.describe('@virtualization-core virtualization complex block editing', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeEach(async() => {
    const launched = await launchWithMarkdown(buildDocument(), {
      filename: 'virtualization-complex-blocks.md',
      suppressErrorDialog: true,
      waitForEditorTimeout: 30000
    })
    app = launched.app
    page = launched.page
    await clearRendererErrors(app)
    await expectBoundedVirtualization(page)
  })

  test.afterEach(async() => {
    if (app) await app.close()
  })

  test('TABL-004/TABL-012: a distant virtualized table can be edited and undone without full mounting', async() => {
    expect(await page.locator('.editor-component table').count()).toBe(0)

    await revealByFind(app, page, 'TABLE_CELL_TARGET')
    const cell = page.locator('.editor-component td.mu-table-cell').filter({ hasText: 'TABLE_CELL_TARGET' }).first()
    await expect(cell).toBeVisible({ timeout: 8000 })
    await cell.click()
    await page.keyboard.press('End')
    await page.keyboard.insertText('X')

    await expect.poll(() => getMarkdownContent(page, app), { timeout: 8000 }).toContain('TABLE_CELL_TARGETX')
    await expectBoundedVirtualization(page)

    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'undo')
    await expect.poll(() => getMarkdownContent(page, app), { timeout: 8000 }).not.toContain('TABLE_CELL_TARGETX')
    await expect.poll(() => getMarkdownContent(page, app), { timeout: 8000 }).toContain('TABLE_CELL_TARGET')
    await expectNoRendererErrors(app)
  })

  test('CODE-003/CODE-004/CODE-006: a distant fenced code block survives edit, scroll-away, remount and Undo', async() => {
    expect(await page.locator('.editor-component pre.mu-code-block').count()).toBe(0)

    await revealByFind(app, page, 'CODE_NAV_TARGET')
    const code = page.locator('.editor-component pre.mu-code-block .mu-codeblock-content').first()
    await expect(code).toBeVisible({ timeout: 8000 })
    await code.click()
    await page.keyboard.press('End')
    await page.keyboard.insertText(' // edited')

    await expect.poll(() => getMarkdownContent(page, app), { timeout: 8000 }).toContain(
      'const virtualCode = 1 // edited'
    )

    const homeModifier = process.platform === 'darwin' ? 'Meta' : 'Control'
    await page.keyboard.press(`${homeModifier}+Home`)
    const topParagraph = page
      .locator('.mu-paragraph-content')
      .filter({ hasText: /^before table paragraph 0$/ })
      .first()
    await expect(topParagraph).toBeVisible({ timeout: 8000 })
    await topParagraph.click()
    await expect
      .poll(() => page.locator('.editor-component pre.mu-code-block').count(), { timeout: 8000 })
      .toBe(0)

    await revealByFind(app, page, 'CODE_NAV_TARGET')
    await expect(page.locator('.editor-component pre.mu-code-block .mu-codeblock-content').first())
      .toContainText('const virtualCode = 1 // edited', { timeout: 8000 })
    await expectBoundedVirtualization(page)

    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'undo')
    await expect.poll(() => getMarkdownContent(page, app), { timeout: 8000 }).not.toContain(
      ' // edited'
    )
    await expectNoRendererErrors(app)
  })
})
