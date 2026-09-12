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
      expect(result?.spacing).toBe('19.2px')
    } finally {
      await app.close()
    }
  })
})
