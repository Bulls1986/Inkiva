import { expect, test } from '@playwright/test'
import { launchWithMarkdown, showSidebarPanel, waitForEditor } from './helpers'

const HEADING_COUNT = 340
const DOCUMENT = Array.from({ length: HEADING_COUNT }, (_, index) =>
  `# Topic ${index + 1}\n\nParagraph ${index + 1}\n`
).join('\n')

test('V06-09: large outline keyboard focus, deep reveal and explicit navigation', async() => {
  const { app, page } = await launchWithMarkdown(DOCUMENT, {
    filename: 'outline-large-keyboard.md',
    waitForEditorTimeout: 60000
  })
  try {
    await waitForEditor(page)
    await showSidebarPanel(app, page, 'toc')
    const outline = page.locator('.toc-virtualized-tree[role="tree"]')
    await expect(outline).toBeVisible()
    const currentItem = () => page.locator('.toc-virtualized-tree [role="treeitem"]:focus')
    const editorScroll = page.locator('.editor-component')
    const before = await editorScroll.evaluate((el) => el.scrollTop)

    // Actual keyboard entry must expose exactly one Tab stop, not rely on
    // Playwright's programmatic focus of an otherwise unreachable item.
    await page.locator('[data-testid="toc-collapse-all"]').focus()
    await page.keyboard.press('Tab')
    await expect(currentItem()).toHaveAttribute('aria-label', 'Topic 1')
    await page.keyboard.press('ArrowDown')
    await expect(currentItem()).toContainText('Topic 2')
    expect(await editorScroll.evaluate((el) => el.scrollTop)).toBe(before)

    await page.keyboard.press('End')
    await expect(currentItem()).toContainText(`Topic ${HEADING_COUNT}`)
    await expect(currentItem()).toBeInViewport()
    expect(await editorScroll.evaluate((el) => el.scrollTop)).toBe(before)

    await page.keyboard.press('Home')
    await expect(currentItem()).toContainText('Topic 1')
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await expect.poll(() => editorScroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(before)
  } finally {
    await app.close()
  }
})
