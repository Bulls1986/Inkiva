import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'

import {
  clearRendererErrors,
  clickMenuById,
  enterSourceMode,
  exitSourceMode,
  expectNoRendererErrors,
  launchWithMarkdown,
  placeCaretAtTextBoundary,
  sendIpcToRenderer,
  setSourceMarkdown
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

test.describe('@virtualization-core Render Surface 2.0 — Electron core interaction gate', () => {
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

  test('native Ctrl/Cmd+Z undoes a normal edit without moving the virtual viewport', async() => {
    const first = page.locator('.mu-paragraph-content').filter({ hasText: /^paragraph 0$/ }).first()
    await expect(first).toBeVisible({ timeout: 5000 })
    await first.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' edited')
    await expect.poll(() => readStoreMarkdown(page), { timeout: 5000 }).toContain('paragraph 0 edited')

    const beforeUndo = await page.locator('.editor-component').evaluate((node) => (node as HTMLElement).scrollTop)
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (!win || win.isDestroyed()) throw new Error('No focused editor window found')
      const modifier = process.platform === 'darwin' ? 'meta' : 'control'
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Z', modifiers: [modifier] })
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Z', modifiers: [modifier] })
    })

    await expect.poll(() => readStoreMarkdown(page), { timeout: 5000 }).not.toContain('paragraph 0 edited')
    const afterUndo = await page.locator('.editor-component').evaluate((node) => (node as HTMLElement).scrollTop)
    expect(Math.abs(afterUndo - beforeUndo)).toBeLessThanOrEqual(2)
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

  test('cross-block logical selection spans an originally unmounted range without full DOM mount', async() => {
    const first = page.locator('.mu-paragraph-content').filter({ hasText: /^paragraph 0$/ }).first()
    await expect(first).toBeVisible({ timeout: 5000 })
    await first.click({ position: { x: 2, y: 8 } })

    // Keep the original caret block active while Find reveals a distant block
    // that was outside the initial render window.
    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'find')
    const input = page.locator('.search-bar .search input')
    await expect(input).toBeVisible({ timeout: 5000 })
    await input.fill(NEEDLE)
    await expect(page.locator('.search-result')).toContainText('1 / 1', { timeout: 5000 })
    const target = page.locator('.mu-paragraph-content').filter({ hasText: NEEDLE }).first()
    await expect(target).toBeVisible({ timeout: 5000 })
    await page.keyboard.press('Escape')

    const selectedText = await page.evaluate((needle) => {
      type MuyaBlock = {
        text: string
        path: Array<string | number>
        muya: {
          editor: {
            scrollPage: { firstContentInDescendant: () => MuyaBlock | null }
            selection: {
              setSelection: (
                anchor: { offset: number; block: MuyaBlock; path: Array<string | number> },
                focus: { offset: number; block: MuyaBlock; path: Array<string | number> }
              ) => void
            }
            clipboard: { getClipboardData: () => { text: string }; cutHandler: () => void }
          }
        }
      }
      const blocks = Array.from(document.querySelectorAll<HTMLElement>('.mu-paragraph-content'))
      const targetNode = blocks.find((node) => node.textContent?.includes(needle))
      const targetBlock = (targetNode as (HTMLElement & { __MUYA_BLOCK__?: MuyaBlock }) | undefined)
        ?.__MUYA_BLOCK__
      if (!targetBlock) throw new Error('virtual selection focus endpoint was not mounted')

      const { editor } = targetBlock.muya
      const firstBlock = editor.scrollPage.firstContentInDescendant()
      if (!firstBlock) throw new Error('logical selection anchor block was not found')
      editor.selection.setSelection(
        { offset: 0, block: firstBlock, path: firstBlock.path },
        { offset: targetBlock.text.length, block: targetBlock, path: targetBlock.path }
      )
      return editor.clipboard.getClipboardData().text
    }, NEEDLE)
    expect(selectedText).toContain('paragraph 1')
    expect(selectedText).toContain(NEEDLE)
    await expectBoundedVirtualization(page)

    await page.evaluate(() => {
      type BlockWithClipboard = {
        muya: { editor: { clipboard: { cutHandler: () => void } } }
      }
      const node = document.querySelector<HTMLElement>('.mu-paragraph-content') as
        | (HTMLElement & { __MUYA_BLOCK__?: BlockWithClipboard })
        | null
      const block = node?.__MUYA_BLOCK__
      if (!block) throw new Error('mounted block was unavailable for logical cut')
      block.muya.editor.clipboard.cutHandler()
    })

    // The cut proves the logical range includes blocks that were never part of
    // the viewport window at the same time. Undo must restore the complete model.
    await expect.poll(() => readStoreMarkdown(page), { timeout: 5000 }).not.toContain('paragraph 1')
    await expect.poll(() => readStoreMarkdown(page), { timeout: 5000 }).toContain('paragraph 359')
    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'undo')
    await expect.poll(() => readStoreMarkdown(page), { timeout: 5000 }).toContain('paragraph 1')
    await expect.poll(() => readStoreMarkdown(page), { timeout: 5000 }).toContain(NEEDLE)
    await expectBoundedVirtualization(page)
    await expectNoRendererErrors(app)
  })

  test('Ctrl/Cmd+End and Ctrl/Cmd+Home jump to logical document boundaries without progressive full mount', async() => {
    await placeCaretAtTextBoundary(page)
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'

    await page.keyboard.press(`${modifier}+End`)
    await expect
      .poll(() => page.locator('.mu-paragraph-content').filter({ hasText: /^paragraph 359$/ }).count(), {
        timeout: 5000
      })
      .toBeGreaterThan(0)
    await expectBoundedVirtualization(page)

    await page.keyboard.press(`${modifier}+Home`)
    await expect
      .poll(() => page.locator('.mu-paragraph-content').filter({ hasText: /^paragraph 0$/ }).count(), {
        timeout: 5000
      })
      .toBeGreaterThan(0)
    await expectBoundedVirtualization(page)
    await expectNoRendererErrors(app)
  })

  test('tab switch restores a caret whose target block is outside the default render window', async() => {
    await placeCaretAtTextBoundary(page)
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
    await page.keyboard.press(`${modifier}+End`)
    await expect
      .poll(() => page.locator('.mu-paragraph-content').filter({ hasText: /^paragraph 359$/ }).count(), {
        timeout: 5000
      })
      .toBeGreaterThan(0)

    await page.waitForTimeout(200)
    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, 'temporary tab\n')
    await expect.poll(() => page.locator('.tabs-container > li').count(), { timeout: 5000 }).toBe(2)
    await expect.poll(() => readStoreMarkdown(page), { timeout: 5000 }).toContain('temporary tab')

    await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 0)
    await expect.poll(() => readStoreMarkdown(page), { timeout: 5000 }).toContain('paragraph 359')
    await expect
      .poll(() => page.locator('.mu-paragraph-content').filter({ hasText: /^paragraph 359$/ }).count(), {
        timeout: 5000
      })
      .toBeGreaterThan(0)

    const restoredCaret = await page.evaluate(() => {
      const selection = document.getSelection()
      if (!selection || selection.rangeCount === 0 || !selection.anchorNode) return null
      const anchor =
        selection.anchorNode.nodeType === Node.TEXT_NODE
          ? selection.anchorNode.parentElement
          : (selection.anchorNode as Element)
      const paragraph = anchor?.closest('.mu-paragraph-content')
      return paragraph?.textContent ?? null
    })
    expect(restoredCaret).toBe('paragraph 359')
    await expectBoundedVirtualization(page)
    await expectNoRendererErrors(app)
  })

  test('source mode round-trip restores a caret in an offscreen logical block', async() => {
    await placeCaretAtTextBoundary(page)
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
    await page.keyboard.press(`${modifier}+End`)
    await expect
      .poll(() => page.locator('.mu-paragraph-content').filter({ hasText: /^paragraph 359$/ }).count(), {
        timeout: 5000
      })
      .toBeGreaterThan(0)
    await page.waitForTimeout(200)

    await enterSourceMode(page, app)
    const sourceCursor = await page.evaluate(() => {
      const cm = document.querySelector('.source-code .CodeMirror') as
        | (Element & { CodeMirror?: { getCursor(): { line: number; ch: number } } })
        | null
      return cm?.CodeMirror?.getCursor() ?? null
    })
    expect(sourceCursor).toEqual({ line: (BLOCK_COUNT - 1) * 2, ch: 'paragraph 359'.length })

    await exitSourceMode(page, app)
    await expect
      .poll(() => page.locator('.mu-paragraph-content').filter({ hasText: /^paragraph 359$/ }).count(), {
        timeout: 5000
      })
      .toBeGreaterThan(0)
    const restoredCaret = await page.evaluate(() => {
      const selection = document.getSelection()
      if (!selection || selection.rangeCount === 0 || !selection.anchorNode) return null
      const anchor =
        selection.anchorNode.nodeType === Node.TEXT_NODE
          ? selection.anchorNode.parentElement
          : (selection.anchorNode as Element)
      const paragraph = anchor?.closest('.mu-paragraph-content')
      return paragraph?.textContent ?? null
    })
    expect(restoredCaret).toBe('paragraph 359')
    await expectBoundedVirtualization(page)
    await expectNoRendererErrors(app)
  })

  test('width reflow invalidates virtual height geometry instead of preserving stale spacer estimates', async() => {
    const longDocument = Array.from({ length: BLOCK_COUNT }, (_, index) =>
      `paragraph ${index} ${'wrapping-content '.repeat(36)}`
    ).join('\n\n') + '\n'
    await setSourceMarkdown(page, app, longDocument)
    await expect.poll(() => readVirtualization(page), { timeout: 10000 }).toMatchObject({
      enabled: true,
      totalBlocks: BLOCK_COUNT
    })

    const resize = async(width: number): Promise<void> => {
      await app.evaluate(({ BrowserWindow }, w) => {
        const win = BrowserWindow.getAllWindows()[0]
        if (!win) throw new Error('No editor BrowserWindow found')
        win.setSize(w, 800)
      }, width)
      await expect.poll(() => page.evaluate(() => window.innerWidth), { timeout: 5000 }).toBe(width)
      await page.waitForTimeout(250)
    }
    const scrollHeight = (): Promise<number> =>
      page.locator('.editor-component').evaluate((node) => (node as HTMLElement).scrollHeight)

    await resize(1400)
    const wideHeight = await scrollHeight()
    await resize(700)
    const narrowHeight = await scrollHeight()

    // Every paragraph wraps much more at 700px. A virtual surface whose offscreen
    // spacers still use the wide/initial estimates only reflects the handful of
    // currently mounted blocks and severely under-reports total document height.
    expect(narrowHeight / wideHeight).toBeGreaterThan(1.35)
    await expectBoundedVirtualization(page)
    await expectNoRendererErrors(app)
  })

  test('sidebar and editor max-width changes preserve the virtual viewport anchor', async() => {
    const longDocument = Array.from({ length: BLOCK_COUNT }, (_, index) =>
      `paragraph ${index} ${'responsive-anchor '.repeat(28)}`
    ).join('\n\n') + '\n'
    await setSourceMarkdown(page, app, longDocument)
    await expect.poll(() => readVirtualization(page), { timeout: 10000 }).toMatchObject({
      enabled: true,
      totalBlocks: BLOCK_COUNT
    })

    const editor = page.locator('.editor-component')
    await editor.evaluate((node) => {
      const element = node as HTMLElement
      // A real user starts scrolling with wheel/pointer input. This also proves
      // the bounded resize-settle guard yields immediately to user interaction.
      element.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true }))
      element.scrollTop = element.scrollHeight * 0.55
      element.dispatchEvent(new Event('scroll'))
    })
    await page.waitForTimeout(250)

    const readViewportAnchor = async(): Promise<{ index: number; width: number }> =>
      page.evaluate(() => {
        const editorNode = document.querySelector<HTMLElement>('.editor-component')
        const container = document.querySelector<HTMLElement>('.mu-container')
        if (!editorNode || !container) throw new Error('virtual editor surface is unavailable')
        const editorTop = editorNode.getBoundingClientRect().top
        const paragraphs = Array.from(container.querySelectorAll<HTMLElement>('.mu-paragraph-content'))
          .map((node) => {
            const match = /^paragraph (\d+)/.exec(node.textContent ?? '')
            return match
              ? { index: Number(match[1]), distance: Math.abs(node.getBoundingClientRect().top - editorTop) }
              : null
          })
          .filter((value): value is { index: number; distance: number } => value !== null)
        paragraphs.sort((left, right) => left.distance - right.distance)
        if (!paragraphs[0]) throw new Error('no mounted paragraph was available near the viewport')
        return { index: paragraphs[0].index, width: container.getBoundingClientRect().width }
      })

    const beforeSidebar = await readViewportAnchor()
    expect(beforeSidebar.index).toBeGreaterThan(100)
    await clickMenuById(app, 'sideBarMenuItem')
    // Chromium may reveal a focused contenteditable caret well after the
    // ResizeObserver callback. Simulate that late programmatic reveal after
    // the sidebar resize has started; unlike wheel/pointer input it must not
    // replace the logical viewport anchor.
    await editor.evaluate((node) => {
      const element = node as HTMLElement
      window.setTimeout(() => {
        element.scrollTop = 0
        element.dispatchEvent(new Event('scroll'))
      }, 220)
    })
    await page.waitForTimeout(300)
    const afterSidebar = await readViewportAnchor()
    expect(afterSidebar.width).toBeGreaterThan(beforeSidebar.width)
    expect(Math.abs(afterSidebar.index - beforeSidebar.index)).toBeLessThanOrEqual(2)
    await expectBoundedVirtualization(page)

    const setEditorWidthPreference = async(value: string): Promise<void> => {
      await page.evaluate((nextValue) => {
        const root = document.querySelector('#app') as
          | (Element & { __vue_app__?: { config?: { globalProperties?: Record<string, unknown> } } })
          | null
        const pinia = root?.__vue_app__?.config?.globalProperties?.$pinia as
          | { _s?: Map<string, { SET_SINGLE_PREFERENCE?: (payload: { type: string; value: unknown }) => void }> }
          | undefined
        const preferences = pinia?._s?.get('preferences')
        if (!preferences?.SET_SINGLE_PREFERENCE) throw new Error('preferences store is unavailable')
        preferences.SET_SINGLE_PREFERENCE({ type: 'editorLineWidth', value: nextValue })
      }, value)
      await page.waitForTimeout(300)
    }

    await setEditorWidthPreference('60%')
    const narrow = await readViewportAnchor()
    await setEditorWidthPreference('100%')
    const full = await readViewportAnchor()
    expect(full.width).toBeGreaterThan(narrow.width)
    expect(Math.abs(full.index - narrow.index)).toBeLessThanOrEqual(2)
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
