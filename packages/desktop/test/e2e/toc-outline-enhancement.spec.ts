import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchWithMarkdown, placeCaretInEditor, showSidebarPanel, waitForEditor } from './helpers'

const DOCUMENT = [
  '# Product guide',
  '',
  '## Installation',
  '',
  'Install the app.',
  '',
  '### Windows',
  '',
  'Windows notes.',
  '',
  '## Configuration',
  '',
  'Configuration notes.',
  '',
  '### Advanced configuration',
  '',
  'Advanced notes.',
  '',
  '## Troubleshooting',
  '',
  'Troubleshooting notes.',
  ''
].join('\n')

const visibleLabels = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="toc-node-label"]'))
      .filter((element) => (element as HTMLElement).offsetParent !== null)
      .map((element) => (element.textContent || '').trim())
  )

test.describe('TOC outline navigation enhancements', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown(DOCUMENT)
    app = launched.app
    page = launched.page
    await waitForEditor(page)
    await showSidebarPanel(app, page, 'toc')
    await page.waitForSelector('.side-bar-toc [data-testid="toc-search"]', { state: 'visible' })
    await expect
      .poll(() => visibleLabels(page), { timeout: 10000 })
      .toEqual([
        'Product guide',
        'Installation',
        'Windows',
        'Configuration',
        'Advanced configuration',
        'Troubleshooting'
      ])
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('tracks the heading at the current scroll position', async() => {
    const activeLabel = page.locator('[data-testid="toc-node-label"].is-active')
    await expect(activeLabel).toHaveText('Product guide')

    await page.evaluate(() => {
      const editor = document.querySelector('.editor-component') as HTMLElement | null
      if (editor) editor.scrollTop = editor.scrollHeight
    })

    await expect
      .poll(() => activeLabel.textContent?.trim(), { timeout: 8000 })
      .toBe('Troubleshooting')
  })

  test('search retains ancestors and filters unrelated headings', async() => {
    await page.locator('[data-testid="toc-search"]').fill('advanced')
    await expect
      .poll(() => visibleLabels(page), { timeout: 5000 })
      .toEqual(['Configuration', 'Advanced configuration'])

    await page.locator('[data-testid="toc-search"]').fill('')
    await expect.poll(() => visibleLabels(page), { timeout: 5000 }).toHaveLength(6)
  })

  test('expand all and collapse all preserve the complete outline', async() => {
    await page.locator('[data-testid="toc-collapse-all"]').click()
    await expect
      .poll(() => visibleLabels(page), { timeout: 5000 })
      .toEqual(['Product guide', 'Installation', 'Configuration', 'Troubleshooting'])

    await page.locator('[data-testid="toc-expand-all"]').click()
    await expect.poll(() => visibleLabels(page), { timeout: 5000 }).toHaveLength(6)
  })

  test('keeps a heading runtime anchor stable after its title changes', async() => {
    const heading = page.locator('.mu-container > h2').filter({ hasText: 'Configuration' }).first()
    const before = await heading.getAttribute('data-inkiva-toc-slug')
    expect(before).toBeTruthy()

    await heading.locator('.mu-atxheading-content').click()
    await page.keyboard.press('End')
    await page.keyboard.type(' updated', { delay: 0 })

    await expect
      .poll(() => visibleLabels(page), { timeout: 8000 })
      .toContain('Configuration updated')
    const renamedHeading = page
      .locator('.mu-container > h2')
      .filter({ hasText: 'Configuration updated' })
      .first()
    await expect
      .poll(() => renamedHeading.getAttribute('data-inkiva-toc-slug'), { timeout: 5000 })
      .toBe(before)
  })
})

type TocMetrics = {
  scheduledRefreshes: number
  refreshCalls: number
}

const readTocMetrics = (page: Page): Promise<TocMetrics> =>
  page.evaluate(() => {
    const state = (globalThis as typeof globalThis & { __inkiva_e2e_toc_metrics__?: TocMetrics })
      .__inkiva_e2e_toc_metrics__
    return state ?? { scheduledRefreshes: 0, refreshCalls: 0 }
  })

const resetTocMetrics = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const state = (globalThis as typeof globalThis & { __inkiva_e2e_toc_metrics__?: TocMetrics })
      .__inkiva_e2e_toc_metrics__
    if (state) {
      state.scheduledRefreshes = 0
      state.refreshCalls = 0
    }
  })

const LARGE_DOCUMENT =
  Array.from(
    { length: 10000 },
    (_, index) => `Paragraph ${index} remains outside the outline refresh path.`
  ).join('\n\n') + '\n'

test.describe('TOC large-document performance smoke', () => {
  test('typing in 10k paragraphs does not schedule a TOC refresh', async() => {
    test.setTimeout(60000)
    const { app, page } = await launchWithMarkdown(LARGE_DOCUMENT)

    try {
      await resetTocMetrics(page)
      await placeCaretInEditor(page)
      await page.keyboard.type('x', { delay: 0 })
      await page.waitForTimeout(250)

      expect(await readTocMetrics(page)).toEqual({
        scheduledRefreshes: 0,
        refreshCalls: 0
      })
    } finally {
      await app.close()
    }
  })
})
