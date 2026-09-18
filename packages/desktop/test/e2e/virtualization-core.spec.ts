import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'

import {
  clearRendererErrors,
  expectNoRendererErrors,
  launchWithMarkdown,
  placeCaretAtTextBoundary,
  sendIpcToRenderer
} from './helpers'

const BLOCK_COUNT = 360
const NEEDLE = 'virtualization-e2e-needle-target'

const buildDocument = (): string =>
  Array.from({ length: BLOCK_COUNT }, (_, index) =>
    index === BLOCK_COUNT - 18 ? `paragraph ${index} ${NEEDLE}` : `paragraph ${index}`
  ).join('\n\n') + '\n'

interface VirtualizationSnapshot {
  enabled: boolean
  totalBlocks: number
  mountedBlocks: number
  materializedBlocks: number
}

const readVirtualization = (page: Page): Promise<VirtualizationSnapshot> =>
  page.evaluate(() => {
    const root = document.querySelector<HTMLElement>(
      '.mu-container[data-virtualization-enabled="true"]'
    )
    if (!root) {
      return {
        enabled: false,
        totalBlocks: 0,
        mountedBlocks: 0,
        materializedBlocks: 0
      }
    }
    return {
      enabled: true,
      totalBlocks: Number(root.dataset.virtualTotalBlocks ?? 0),
      mountedBlocks: Number(root.dataset.virtualMountedBlocks ?? 0),
      materializedBlocks: Number(root.dataset.virtualMaterializedBlocks ?? 0)
    }
  })

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

const expectBoundedVirtualization = async(page: Page): Promise<void> => {
  await expect.poll(() => readVirtualization(page)).toMatchObject({
    enabled: true,
    totalBlocks: BLOCK_COUNT
  })
  const snapshot = await readVirtualization(page)
  expect(snapshot.mountedBlocks).toBeGreaterThan(0)
  expect(snapshot.mountedBlocks).toBeLessThan(snapshot.totalBlocks / 2)
  expect(snapshot.materializedBlocks).toBeLessThan(snapshot.totalBlocks / 2)
}

test.describe('Render Surface 2.0 — Electron core interaction gate', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeEach(async() => {
    const launched = await launchWithMarkdown(buildDocument(), {
      filename: 'virtualization-core.md',
      waitForEditorTimeout: 30000,
      suppressErrorDialog: true
    })
    app = launched.app
    page = launched.page
    await clearRendererErrors(app)
    await expectBoundedVirtualization(page)
  })

  test.afterEach(async() => {
    if (app) await app.close()
  })

  test('Ctrl+A/Delete affects the complete logical document without full DOM mount, then Undo restores it', async() => {
    await placeCaretAtTextBoundary(page)

    // Electron local shortcuts are registered in the main process and
    // Playwright's synthetic key events do not exercise that native hook
    // reliably. Drive the same product command delivered by Ctrl/Cmd+A:
    // caret/partial -> whole block -> whole document.
    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'selectAll')
    await page.waitForTimeout(50)
    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'selectAll')
    await page.waitForTimeout(50)

    const selectionState = await page.evaluate(() => ({
      rangeCount: document.getSelection()?.rangeCount ?? 0,
      activeClass: document.activeElement?.className ?? ''
    }))
    expect(selectionState.rangeCount).toBe(1)
    expect(selectionState.activeClass).toContain('mu-editor')

    await expectBoundedVirtualization(page)
    await page.keyboard.press('Delete')
    await expect.poll(() => readStoreMarkdown(page), { timeout: 5000 }).toBe('')

    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'undo')
    await expect.poll(() => readStoreMarkdown(page), { timeout: 5000 }).toContain('paragraph 0')
    await expect.poll(() => readStoreMarkdown(page), { timeout: 5000 }).toContain(NEEDLE)
    await expectBoundedVirtualization(page)
    await expectNoRendererErrors(app)
  })

  test('composition pins the active block across a distant viewport recalculation and commits CJK text', async() => {
    const before = await readStoreMarkdown(page)

    await page.evaluate(() => {
      const node = document.querySelector<HTMLElement>(
        '.editor-component span.mu-paragraph-content'
      )
      if (!node) throw new Error('visible paragraph content was not found')

      const topLevel = node.closest<HTMLElement>('.mu-paragraph')
      if (!topLevel) throw new Error('top-level paragraph was not found')
      topLevel.dataset.imeVirtualizationProbe = 'true'

      node.focus()
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
      const textNode = walker.nextNode()
      if (!(textNode instanceof Text)) throw new Error('paragraph text node was not found')
      const range = document.createRange()
      range.setStart(textNode, textNode.data.length)
      range.collapse(true)
      const selection = document.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)

      node.dispatchEvent(
        new CompositionEvent('compositionstart', {
          bubbles: true,
          cancelable: true,
          data: ''
        })
      )
      node.textContent = `${node.textContent ?? ''}你`
      node.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          data: '你',
          inputType: 'insertCompositionText',
          isComposing: true
        })
      )
    })

    // Synthetic composition only verifies the editor lifecycle. Native Windows/
    // macOS IME candidate windows remain a separate platform acceptance gate.
    expect(await readStoreMarkdown(page)).toBe(before)

    await page.evaluate(() => {
      const editor = document.querySelector<HTMLElement>('.editor-component')
      if (!editor) throw new Error('editor scroll surface is missing')
      editor.scrollTop = editor.scrollHeight
      editor.dispatchEvent(new Event('scroll'))
    })
    await page.waitForTimeout(120)

    await expect.poll(() => page.locator('[data-ime-virtualization-probe="true"]').count()).toBe(1)
    await expectBoundedVirtualization(page)

    await page.evaluate(() => {
      const node = document.querySelector<HTMLElement>(
        '[data-ime-virtualization-probe="true"] span.mu-paragraph-content'
      )
      if (!node) throw new Error('composition block was unmounted')

      const textNode = node.firstChild
      if (textNode instanceof Text) {
        const range = document.createRange()
        range.setStart(textNode, textNode.data.length)
        range.collapse(true)
        const selection = document.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
      }

      node.dispatchEvent(
        new CompositionEvent('compositionend', {
          bubbles: true,
          cancelable: true,
          data: '你'
        })
      )
    })

    await expect.poll(() => readStoreMarkdown(page), { timeout: 5000 }).toContain('paragraph 0你')
    await expectBoundedVirtualization(page)
    await expectNoRendererErrors(app)
  })

  test('Find mounts an offscreen result and top-bottom-top scrolling remains bounded with no blank surface', async() => {
    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'find')
    const input = page.locator('.search-bar .search input')
    await expect(input).toBeVisible({ timeout: 5000 })
    await input.fill(NEEDLE)

    await expect(page.locator('.search-result')).toContainText('1 / 1', {
      timeout: 5000
    })
    await expect.poll(() => page.locator('.mu-highlight').count(), { timeout: 5000 }).toBeGreaterThan(0)
    await expect(page.locator('.mu-highlight').first()).toBeVisible()
    await expectBoundedVirtualization(page)
    await page.keyboard.press('Escape')

    for (const position of ['bottom', 'top', 'bottom', 'top'] as const) {
      await page.evaluate((target) => {
        const editor = document.querySelector<HTMLElement>('.editor-component')
        if (!editor) throw new Error('editor scroll surface is missing')
        editor.scrollTop = target === 'bottom' ? editor.scrollHeight : 0
        editor.dispatchEvent(new Event('scroll'))
      }, position)
      await page.waitForTimeout(120)
      await expectBoundedVirtualization(page)
      await expect
        .poll(() =>
          page.locator(
            '.mu-container[data-virtualization-enabled="true"] > :not(.mu-virtual-render-placeholder)'
          ).count()
        )
        .toBeGreaterThan(0)
    }

    await expectNoRendererErrors(app)
  })
})
