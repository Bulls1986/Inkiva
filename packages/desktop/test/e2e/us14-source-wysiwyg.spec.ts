import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'

import {
  clearRendererErrors,
  clickMenuById,
  enterSourceMode,
  expectNoRendererErrors,
  launchWithMarkdown,
  sendIpcToRenderer
} from './helpers'

const sourceValue = (page: Page): Promise<string | null> =>
  page.evaluate(() => {
    const root = document.querySelector('.source-code .CodeMirror') as
      | (Element & { CodeMirror?: { getValue(): string } })
      | null
    return root?.CodeMirror?.getValue() ?? null
  })

const setSourceValue = (page: Page, markdown: string): Promise<void> =>
  page.evaluate((value) => {
    const root = document.querySelector('.source-code .CodeMirror') as
      | (Element & { CodeMirror?: { setValue(value: string): void } })
      | null
    if (!root?.CodeMirror) throw new Error('CodeMirror source editor is unavailable')
    root.CodeMirror.setValue(value)
  }, markdown)

const dispatchComposition = (page: Page, type: 'compositionstart' | 'compositionend'): Promise<void> =>
  page.evaluate((eventType) => {
    const editor = document.querySelector('.editor-component')
    if (!editor) throw new Error('WYSIWYG editor surface is unavailable')
    editor.dispatchEvent(new CompositionEvent(eventType, { bubbles: true, data: '中' }))
  }, type)

const addSecondTab = async(app: ElectronApplication, page: Page): Promise<void> => {
  await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, '# second tab\n')
  await expect.poll(() => page.locator('.tabs-container > li').count(), { timeout: 5000 }).toBe(2)
}

test.describe('US14 / Source-WYSIWYG continuity', () => {
  test('AC-60: source switch waits for active WYSIWYG IME composition', async() => {
    const launched = await launchWithMarkdown('# IME baseline\n', { suppressErrorDialog: true })
    try {
      await clearRendererErrors(launched.app)
      await dispatchComposition(launched.page, 'compositionstart')

      await clickMenuById(launched.app, 'sourceCodeModeMenuItem')
      await launched.page.waitForTimeout(250)
      await expect(launched.page.locator('.source-code')).toHaveCount(0)

      await dispatchComposition(launched.page, 'compositionend')
      await expect(launched.page.locator('.source-code .CodeMirror')).toHaveCount(1, {
        timeout: 5000
      })
      await expectNoRendererErrors(launched.app)
    } finally {
      await launched.app.close()
    }
  })

  test('AC-60: WYSIWYG switch waits for active Source IME composition', async() => {
    const launched = await launchWithMarkdown('# Source IME baseline\n', {
      suppressErrorDialog: true
    })
    try {
      await clearRendererErrors(launched.app)
      await enterSourceMode(launched.page, launched.app)
      await launched.page.evaluate(() => {
        const input = document.querySelector('.source-code textarea')
        if (!input) throw new Error('Source CodeMirror input is unavailable')
        input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '中' }))
      })

      await clickMenuById(launched.app, 'sourceCodeModeMenuItem')
      await launched.page.waitForTimeout(250)
      await expect(launched.page.locator('.source-code .CodeMirror')).toHaveCount(1)

      await launched.page.evaluate(() => {
        const input = document.querySelector('.source-code textarea')
        if (!input) throw new Error('Source CodeMirror input is unavailable')
        input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '中' }))
      })
      await expect(launched.page.locator('.source-code')).toHaveCount(0, { timeout: 5000 })
      await expectNoRendererErrors(launched.app)
    } finally {
      await launched.app.close()
    }
  })

  test('AC-60: only the latest mode intent survives an IME composition', async() => {
    const launched = await launchWithMarkdown('# latest intent\n', { suppressErrorDialog: true })
    try {
      await clearRendererErrors(launched.app)
      await dispatchComposition(launched.page, 'compositionstart')

      await clickMenuById(launched.app, 'sourceCodeModeMenuItem')
      await clickMenuById(launched.app, 'sourceCodeModeMenuItem')
      await launched.page.waitForTimeout(250)
      await expect(launched.page.locator('.source-code')).toHaveCount(0)

      await dispatchComposition(launched.page, 'compositionend')
      await launched.page.waitForTimeout(250)
      await expect(launched.page.locator('.source-code')).toHaveCount(0)
      await expect(launched.page.locator('.editor-component')).toContainText('latest intent')
      await expectNoRendererErrors(launched.app)
    } finally {
      await launched.app.close()
    }
  })

  test('AC-80: leaving the composing tab cancels its queued source switch', async() => {
    const launched = await launchWithMarkdown('# first tab\n', { suppressErrorDialog: true })
    try {
      await clearRendererErrors(launched.app)
      await addSecondTab(launched.app, launched.page)
      await sendIpcToRenderer(launched.app, 'mt::switch-tab-by-index', 0)

      await dispatchComposition(launched.page, 'compositionstart')
      await clickMenuById(launched.app, 'sourceCodeModeMenuItem')
      await launched.page.waitForTimeout(250)
      await expect(launched.page.locator('.source-code')).toHaveCount(0)

      await sendIpcToRenderer(launched.app, 'mt::switch-tab-by-index', 1)
      await expect(launched.page.locator('.editor-component')).toContainText('second tab')
      await dispatchComposition(launched.page, 'compositionend')

      await expect(launched.page.locator('.source-code')).toHaveCount(0)
      await expect(launched.page.locator('.editor-component')).toContainText('second tab')
      await expectNoRendererErrors(launched.app)
    } finally {
      await launched.app.close()
    }
  })

  test('AC-59: unsafe unfinished fence remains editable in Source', async() => {
    const launched = await launchWithMarkdown('# baseline\n', { suppressErrorDialog: true })
    try {
      await clearRendererErrors(launched.app)
      await enterSourceMode(launched.page, launched.app)

      const unfinished = '# Draft\n\n```ts\nconst value = 1\n'
      await setSourceValue(launched.page, unfinished)
      await expect(launched.page.locator('.source-code .CodeMirror')).toHaveCount(1)

      await clickMenuById(launched.app, 'sourceCodeModeMenuItem')

      await expect(launched.page.locator('.source-code .CodeMirror')).toHaveCount(1)
      expect(await sourceValue(launched.page)).toBe(unfinished)
      await expectNoRendererErrors(launched.app)
    } finally {
      await launched.app.close()
    }
  })
})
