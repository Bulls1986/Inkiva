import { expect, test } from '@playwright/test'
import { launchWithMarkdown } from './helpers'

test.describe('writing-area personalization', () => {
  test('paragraph spacing changes through a root CSS variable without replacing blocks', async() => {
    const { app, page } = await launchWithMarkdown('First paragraph.\n\nSecond paragraph.\n')

    try {
      const result = await page.evaluate(() => {
        const root = document.querySelector('.mu-editor') as HTMLElement | null
        const paragraph = root?.querySelector('.mu-paragraph') ?? null
        if (!root || !paragraph) return null

        root.style.setProperty('--mu-paragraph-spacing', '1.2em')
        return {
          paragraphText: paragraph.textContent,
          sameParagraph: paragraph === root.querySelector('.mu-paragraph'),
          spacing: getComputedStyle(paragraph).marginBlockStart
        }
      })

      expect(result).not.toBeNull()
      expect(result?.paragraphText).toContain('First paragraph.')
      expect(result?.sameParagraph).toBe(true)
      // The reference editor uses an 18px body size, so 1.2em resolves to
      // 21.6px. Keep the assertion tied to the configured type scale rather
      // than the previous 16px default.
      expect(result?.spacing).toBe('21.6px')
    } finally {
      await app.close()
    }
  })
})
