import { expect, test } from '@playwright/test'
import type { Page } from 'playwright'
import {
  launchWithMarkdown,
  placeCaretInEditor,
  sendIpcToRenderer
} from './helpers'

type EditorMetrics = {
  setContentCalls: number
  setContentSources: string[]
}

const readEditorMetrics = (page: Page): Promise<EditorMetrics> =>
  page.evaluate(() => {
    const state = (
      globalThis as typeof globalThis & {
        __inkiva_e2e_editor_metrics__?: EditorMetrics
      }
    ).__inkiva_e2e_editor_metrics__
    return state ?? { setContentCalls: 0, setContentSources: [] }
  })

const resetEditorMetrics = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const state = (
      globalThis as typeof globalThis & {
        __inkiva_e2e_editor_metrics__?: EditorMetrics
      }
    ).__inkiva_e2e_editor_metrics__
    if (state) {
      state.setContentCalls = 0
      state.setContentSources = []
    }
  })

const typeAtCommittedCaret = async(page: Page, text: string): Promise<void> => {
  await page.keyboard.type(text, { delay: 30 })
  await page.waitForTimeout(150)
}

test.describe('editor switch rebuild performance', () => {
  test('opening a new document mounts its content only once', async() => {
    const { app, page } = await launchWithMarkdown('# Base\n')

    try {
      await resetEditorMetrics(page)
      await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, 'new document\n')
      await expect(page.locator('.mu-paragraph-content').last()).toContainText('new document')

      const metrics = await readEditorMetrics(page)
      expect(metrics.setContentCalls).toBe(1)
    } finally {
      await app.close()
    }
  })

  test('switching back to an edited tab reuses its blocks snapshot', async() => {
    const { app, page } = await launchWithMarkdown('# Base\n')

    try {
      await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, 'tab B\n')
      await expect(page.locator('.mu-paragraph-content').first()).toContainText('tab B')

      await placeCaretInEditor(page)
      await typeAtCommittedCaret(page, ' edited')
      await expect(page.locator('.mu-paragraph-content').first()).toContainText('edited')

      await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 0)
      await expect(page.locator('.mu-paragraph-content').first()).toContainText('Base')

      await resetEditorMetrics(page)
      await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 1)
      await expect(page.locator('.mu-paragraph-content').first()).toContainText('edited')

      const metrics = await readEditorMetrics(page)
      expect(metrics.setContentCalls).toBe(1)
      expect(metrics.setContentSources).toEqual(['blocks'])
    } finally {
      await app.close()
    }
  })
})
