import { expect, test } from '@playwright/test'
import type { Page } from 'playwright'
import { launchWithMarkdown, sendIpcToRenderer, waitForMenuReady } from './helpers'

const tabSelector = '.tabs-container > li'

// A tall diagram makes the first synchronous layout materially shorter than
// the settled layout. The saved position is therefore a useful regression
// target: restoring it must wait for the diagram's asynchronous preview
// without manufacturing a permanent blank scroll range.
const TALL_MERMAID_DOCUMENT = [
  '# Scroll restore with a diagram',
  '',
  ...Array.from({ length: 24 }, (_, index) => `intro paragraph ${index}`),
  '',
  '```mermaid',
  'graph TD',
  ...Array.from(
    { length: 72 },
    (_, index) =>
      `N${index}["Node ${index}: ${'a long diagram label '.repeat(3)}"] --> N${index + 1}`
  ),
  '```',
  '',
  '## Document end',
  '',
  'The final paragraph is the end of the document.'
].join('\n')

const readScrollMetrics = (
  page: Page
): Promise<{
  scrollTop: number
  maxScrollTop: number
  inlinePaddingBottom: string
} | null> =>
  page.evaluate(() => {
    const container = document.querySelector('.editor-component') as HTMLElement | null
    const root = container?.firstElementChild as HTMLElement | null
    if (!container || !root) return null

    return {
      scrollTop: container.scrollTop,
      maxScrollTop: Math.max(0, container.scrollHeight - container.clientHeight),
      inlinePaddingBottom: root.style.paddingBottom
    }
  })

test.describe('Editor scroll restoration', () => {
  test('restores a tab position after an asynchronous diagram layout settles', async() => {
    const { app, page } = await launchWithMarkdown(TALL_MERMAID_DOCUMENT)

    try {
      await waitForMenuReady(app)
      await expect(page.locator('.mu-diagram-preview svg').first()).toBeVisible({ timeout: 15000 })
      await expect(page.locator('.mu-diagram-block').first()).toHaveClass(/mu-diagram-preview-only/)

      const captured = await page.evaluate(() => {
        const container = document.querySelector('.editor-component') as HTMLElement | null
        if (!container) return null
        container.scrollTop = container.scrollHeight
        container.dispatchEvent(new Event('scroll'))
        return container.scrollTop
      })
      expect(captured).not.toBeNull()
      if (captured == null) throw new Error('Editor scroll container was not available')
      expect(captured).toBeGreaterThan(1000)

      await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, 'short tab\n')
      await page.waitForFunction(
        (selector) => document.querySelectorAll(selector).length >= 2,
        tabSelector,
        { timeout: 5000 }
      )
      await expect
        .poll(() =>
          page.evaluate(() => {
            const container = document.querySelector('.editor-component') as HTMLElement | null
            return container?.scrollTop ?? -1
          })
        )
        .toBe(0)

      await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 0)
      await expect(page.locator('.mu-diagram-preview svg').first()).toBeVisible({ timeout: 15000 })
      await expect(page.locator('.mu-diagram-block').first()).toHaveClass(/mu-diagram-preview-only/)

      await expect
        .poll(async() => (await readScrollMetrics(page))?.scrollTop ?? -1, { timeout: 5000 })
        .toBeGreaterThan(captured - 2)

      const restored = await readScrollMetrics(page)
      expect(restored).not.toBeNull()
      if (!restored) throw new Error('Editor scroll metrics were not available')
      expect(restored.scrollTop).toBeLessThanOrEqual(restored.maxScrollTop)
      expect(restored.inlinePaddingBottom).toBe('')
    } finally {
      await app.close()
    }
  })
})
