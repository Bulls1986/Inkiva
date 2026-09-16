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

const readEditorText = (page: Page): Promise<string> =>
  page.evaluate(() => document.querySelector('.editor-component')?.textContent ?? '')

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

  test('keeps one full editor and bounds warm tab resources', async() => {
    const { app, page } = await launchWithMarkdown('# Base\n')

    try {
      for (let index = 1; index <= 4; index += 1) {
        await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, `tab ${index}\n`)
      }

      await expect.poll(async() => {
        const lifecycles = await page.locator('.tabs-container > li').evaluateAll((tabs) =>
          tabs.map((tab) => tab.getAttribute('data-tab-lifecycle'))
        )
        return {
          active: lifecycles.filter((value) => value === 'active').length,
          warm: lifecycles.filter((value) => value === 'warm').length,
          cold: lifecycles.filter((value) => value === 'cold').length
        }
      }, { timeout: 10000 }).toEqual({ active: 1, warm: 2, cold: 2 })
      expect(page.locator('.primary-editor-pane > .editor-wrapper')).toHaveCount(1)
    } finally {
      await app.close()
    }
  })

  test('switching back to an edited tab reuses its blocks snapshot', async() => {
    const { app, page } = await launchWithMarkdown('# Base\n')

    try {
      await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, 'tab B\n')
      await expect
        .poll(() => readEditorText(page), { timeout: 10000 })
        .toContain('tab B')

      await placeCaretInEditor(page)
      await typeAtCommittedCaret(page, ' edited')
      await expect
        .poll(() => readEditorText(page), { timeout: 10000 })
        .toContain('edited')

      await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 0)
      await expect
        .poll(() => readEditorText(page), { timeout: 10000 })
        .toContain('Base')

      await resetEditorMetrics(page)
      await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 1)
      await expect
        .poll(() => readEditorText(page), { timeout: 10000 })
        .toContain('edited')

      const metrics = await readEditorMetrics(page)
      expect(metrics.setContentCalls).toBe(1)
      expect(metrics.setContentSources).toEqual(['blocks'])
    } finally {
      await app.close()
    }
  })
})
