import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'

import {
  clearRendererErrors,
  expectNoRendererErrors,
  launchWithMarkdown,
  sendIpcToRenderer
} from './helpers'

const BLOCK_COUNT = 380

const buildDocument = (): string =>
  Array.from(
    { length: BLOCK_COUNT },
    (_, index) => `paragraph ${index} virtualization-editing-operation`
  ).join('\n\n') + '\n'

const readStoreMarkdown = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const root = document.querySelector('#app') as
      | (Element & {
        __vue_app__?: { config?: { globalProperties?: Record<string, unknown> } }
      })
      | null
    const pinia = root?.__vue_app__?.config?.globalProperties?.$pinia as
      | { _s?: Map<string, { currentFile?: { markdown?: string } | null }> }
      | undefined
    return pinia?._s?.get('editor')?.currentFile?.markdown ?? ''
  })

const virtualTotalBlocks = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const root = document.querySelector<HTMLElement>(
      '.mu-container[data-virtualization-enabled="true"]'
    )
    return Number(root?.dataset.virtualTotalBlocks ?? 0)
  })

const expectBoundedVirtualization = async(page: Page): Promise<void> => {
  await expect.poll(() => virtualTotalBlocks(page), { timeout: 8000 }).toBeGreaterThan(300)
  const snapshot = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>(
      '.mu-container[data-virtualization-enabled="true"]'
    )
    return {
      total: Number(root?.dataset.virtualTotalBlocks ?? 0),
      mounted: Number(root?.dataset.virtualMountedBlocks ?? 0)
    }
  })
  expect(snapshot.mounted).toBeGreaterThan(0)
  expect(snapshot.mounted).toBeLessThan(snapshot.total / 2)
}

const revealParagraph = async(
  app: ElectronApplication,
  page: Page,
  index: number
): Promise<ReturnType<Page['locator']>> => {
  const text = `paragraph ${index} virtualization-editing-operation`
  await sendIpcToRenderer(app, 'mt::editor-edit-action', 'find')
  const input = page.locator('.search-bar .search input')
  await expect(input).toBeVisible()
  await input.fill(text)
  await expect(page.locator('.search-result')).toContainText('1 / 1', { timeout: 8000 })
  await expect(page.locator('.mu-highlight').first()).toBeVisible({ timeout: 8000 })
  await page.keyboard.press('Escape')

  const paragraph = page.locator('.mu-paragraph-content').filter({ hasText: text }).first()
  await expect(paragraph).toBeVisible({ timeout: 8000 })
  return paragraph
}

test.describe('@virtualization-core virtualization daily editing operations', () => {
  let app: ElectronApplication
  let page: Page
  let filePath: string

  test.beforeEach(async() => {
    const launched = await launchWithMarkdown(buildDocument(), {
      filename: 'virtualization-editing-operations.md',
      suppressErrorDialog: true,
      waitForEditorTimeout: 30000
    })
    app = launched.app
    page = launched.page
    filePath = launched.filePath
    await clearRendererErrors(app)
    await expectBoundedVirtualization(page)
  })

  test.afterEach(async() => {
    if (app) await app.close()
  })

  test('EDIT-004/EDIT-005: Enter splits a distant virtualized paragraph and accepts immediate typing', async() => {
    const paragraph = await revealParagraph(app, page, 180)
    await paragraph.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    // Enter is a structural mutation. Wait for that observable model boundary
    // before sending the next real key events; this avoids unrealistically
    // queueing the entire follow-up string in the same Chromium event turn.
    await expect.poll(() => virtualTotalBlocks(page), { timeout: 8000 }).toBe(BLOCK_COUNT + 1)
    await page.keyboard.type('new paragraph after virtual split', { delay: 10 })

    await expect.poll(() => readStoreMarkdown(page), { timeout: 8000 }).toContain(
      'new paragraph after virtual split'
    )
    await expectBoundedVirtualization(page)
    await expectNoRendererErrors(app)
  })

  test('EDIT-008/EDIT-010/EDIT-011: Backspace and Delete merge adjacent blocks without corrupting virtual block count', async() => {
    const second = page
      .locator('.mu-paragraph-content')
      .filter({ hasText: /^paragraph 1 virtualization-editing-operation$/ })
      .first()
    await second.click()
    await page.keyboard.press('Home')
    await page.keyboard.press('Backspace')
    await expect.poll(() => virtualTotalBlocks(page), { timeout: 8000 }).toBe(BLOCK_COUNT - 1)
    let markdown = await readStoreMarkdown(page)
    expect(markdown).toContain('paragraph 0 virtualization-editing-operation')
    expect(markdown).toContain('paragraph 1 virtualization-editing-operation')

    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'undo')
    await expect.poll(() => virtualTotalBlocks(page), { timeout: 8000 }).toBe(BLOCK_COUNT)

    const first = page
      .locator('.mu-paragraph-content')
      .filter({ hasText: /^paragraph 0 virtualization-editing-operation$/ })
      .first()
    await first.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Delete')
    await expect.poll(() => virtualTotalBlocks(page), { timeout: 8000 }).toBe(BLOCK_COUNT - 1)
    markdown = await readStoreMarkdown(page)
    expect(markdown).toContain('paragraph 0 virtualization-editing-operation')
    expect(markdown).toContain('paragraph 1 virtualization-editing-operation')
    await expectNoRendererErrors(app)
  })

  test('PASTE-004/PASTE-005/PASTE-008: large multi-paragraph paste grows the logical document while DOM stays bounded', async() => {
    const paragraph = await revealParagraph(app, page, 220)
    await paragraph.click()
    await page.keyboard.press('End')

    const pasted = Array.from(
      { length: 36 },
      (_, index) => `VIRTUAL_PASTE_${index} 中文 mixed 🚀`
    ).join('\n\n')
    await paragraph.evaluate((node, text) => {
      const dataTransfer = new DataTransfer()
      dataTransfer.setData('text/plain', text)
      node.dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData: dataTransfer,
          bubbles: true,
          cancelable: true
        })
      )
    }, pasted)

    await expect.poll(() => readStoreMarkdown(page), { timeout: 10000 }).toContain(
      'VIRTUAL_PASTE_35 中文 mixed 🚀'
    )
    await expect.poll(() => virtualTotalBlocks(page), { timeout: 10000 }).toBeGreaterThan(
      BLOCK_COUNT + 20
    )
    await expectBoundedVirtualization(page)
    await expectNoRendererErrors(app)
  })

  test('SAVE-001/SAVE-004: save persists the latest revision and the still-unmounted document tail', async() => {
    const first = page
      .locator('.mu-paragraph-content')
      .filter({ hasText: /^paragraph 0 virtualization-editing-operation$/ })
      .first()
    await first.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' SAVED_LATEST_REVISION', { delay: 0 })
    await expect.poll(() => readStoreMarkdown(page)).toContain('SAVED_LATEST_REVISION')

    await sendIpcToRenderer(app, 'mt::editor-ask-file-save')
    await expect
      .poll(() => fs.readFileSync(filePath, 'utf-8'), { timeout: 10000 })
      .toContain('paragraph 0 virtualization-editing-operation SAVED_LATEST_REVISION')
    const disk = fs.readFileSync(filePath, 'utf-8')
    expect(disk).toContain('paragraph 379 virtualization-editing-operation')
    await expectBoundedVirtualization(page)
    await expectNoRendererErrors(app)
  })
})
