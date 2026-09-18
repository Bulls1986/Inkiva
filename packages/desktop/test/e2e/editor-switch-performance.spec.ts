import { expect, test } from '@playwright/test'
import type { Page } from 'playwright'
import { launchWithMarkdown, placeCaretInEditor, sendIpcToRenderer } from './helpers'

type EditorMetrics = {
  setContentCalls: number
  setContentSources: string[]
  markdownSerializationCalls: number
  markdownSerializationRevisions: number[]
}

type RevisionSnapshotMetrics = {
  markdown: { hits: number; misses: number }
  wordCount: { hits: number; misses: number }
  blocks: { hits: number; misses: number }
  historyMeta: { hits: number; misses: number }
  invalidations: number
  staleDrops: number
  coalescedConsumers: number
  evictions: number
}

const readEditorMetrics = (page: Page): Promise<EditorMetrics> =>
  page.evaluate(() => {
    const state = (
      globalThis as typeof globalThis & {
        __inkiva_e2e_editor_metrics__?: EditorMetrics
      }
    ).__inkiva_e2e_editor_metrics__
    return (
      state ?? {
        setContentCalls: 0,
        setContentSources: [],
        markdownSerializationCalls: 0,
        markdownSerializationRevisions: []
      }
    )
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
      state.markdownSerializationCalls = 0
      state.markdownSerializationRevisions = []
    }
  })

const resetRevisionSnapshotMetrics = (page: Page): Promise<void> =>
  page.evaluate(() => {
    ;(
      globalThis as typeof globalThis & {
        __inkiva_reset_revision_snapshot_metrics__?: () => void
      }
    ).__inkiva_reset_revision_snapshot_metrics__?.()
  })

const readRevisionSnapshotMetrics = (page: Page): Promise<RevisionSnapshotMetrics | null> =>
  page.evaluate(
    () =>
      (
        globalThis as typeof globalThis & {
          __inkiva_get_revision_snapshot_metrics__?: () => RevisionSnapshotMetrics | null
        }
      ).__inkiva_get_revision_snapshot_metrics__?.() ?? null
  )

const typeAtCommittedCaret = async(page: Page, text: string): Promise<void> => {
  await page.keyboard.type(text, { delay: 30 })
  await page.waitForTimeout(150)
}

const readEditorText = (page: Page): Promise<string> =>
  page.evaluate(() => document.querySelector('.editor-component')?.textContent ?? '')

const createLargeDocument = (prefix: string): string =>
  `${Array.from({ length: 240 }, (_, index) => `${prefix} paragraph ${index}`).join('\n\n')}\n`

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

      await expect
        .poll(
          async() => {
            const lifecycles = await page
              .locator('.tabs-container > li')
              .evaluateAll((tabs) => tabs.map((tab) => tab.getAttribute('data-tab-lifecycle')))
            return {
              active: lifecycles.filter((value) => value === 'active').length,
              warm: lifecycles.filter((value) => value === 'warm').length,
              cold: lifecycles.filter((value) => value === 'cold').length
            }
          },
          { timeout: 10000 }
        )
        .toEqual({ active: 1, warm: 2, cold: 2 })
      expect(page.locator('.primary-editor-pane > .editor-wrapper')).toHaveCount(1)
    } finally {
      await app.close()
    }
  })

  test('switching back to an edited tab reuses its blocks snapshot', async() => {
    const { app, page } = await launchWithMarkdown('# Base\n')

    try {
      await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, 'tab B\n')
      await expect.poll(() => readEditorText(page), { timeout: 10000 }).toContain('tab B')

      await placeCaretInEditor(page)
      await typeAtCommittedCaret(page, ' edited')
      await expect.poll(() => readEditorText(page), { timeout: 10000 }).toContain('edited')

      await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 0)
      await expect.poll(() => readEditorText(page), { timeout: 10000 }).toContain('Base')

      await resetEditorMetrics(page)
      await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 1)
      await expect.poll(() => readEditorText(page), { timeout: 10000 }).toContain('edited')

      const metrics = await readEditorMetrics(page)
      expect(metrics.setContentCalls).toBe(1)
      expect(metrics.setContentSources).toEqual(['blocks'])
      expect(metrics.markdownSerializationCalls).toBe(0)
    } finally {
      await app.close()
    }
  })

  test('preserves an edit when the tab switch races the deferred snapshot', async() => {
    const { app, page } = await launchWithMarkdown('# Base\n')

    try {
      await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, 'tab B\n')
      await expect.poll(() => readEditorText(page), { timeout: 10000 }).toContain('tab B')

      await placeCaretInEditor(page)
      // Do not wait for the normal 80ms snapshot debounce. The switch must
      // flush the queued edit into tab B before replacing the live document.
      await page.keyboard.type(' edited', { delay: 0 })
      await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 0)
      await expect.poll(() => readEditorText(page), { timeout: 10000 }).toContain('Base')

      await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 1)
      await expect.poll(() => readEditorText(page), { timeout: 10000 }).toContain('edited')
    } finally {
      await app.close()
    }
  })

  test('serializes a saved revision only once across deferred enrichment', async() => {
    const { app, page } = await launchWithMarkdown('# Base\n')

    try {
      await placeCaretInEditor(page)
      await resetEditorMetrics(page)
      // Race save against the normal 80ms snapshot debounce so the save path
      // must capture the pending revision itself.
      await page.keyboard.type(' saved-once', { delay: 0 })
      await sendIpcToRenderer(app, 'mt::editor-ask-file-save')

      // A slower CI runner may legitimately serialize an intermediate revision
      // if the 80ms debounce expires while the synthetic typing is still in
      // progress. The invariant is per revision: persistence capture and the
      // later full enrichment must never serialize the SAME revision twice.
      await page.waitForTimeout(350)
      const metrics = await readEditorMetrics(page)
      expect(metrics.markdownSerializationRevisions.length).toBeGreaterThan(0)
      expect(new Set(metrics.markdownSerializationRevisions).size).toBe(
        metrics.markdownSerializationRevisions.length
      )
    } finally {
      await app.close()
    }
  })

  test('shares one revision snapshot across autosave, tab switch, save, export and close', async() => {
    const { app, page } = await launchWithMarkdown('# Base\n')

    try {
      // Pre-warm the second tab before the measured workflow so its own initial
      // snapshot does not contaminate the active document's serialization count.
      await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, 'tab B\n')
      await expect.poll(() => readEditorText(page), { timeout: 10000 }).toContain('tab B')
      await page.waitForTimeout(350)
      await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 0)
      await expect.poll(() => readEditorText(page), { timeout: 10000 }).toContain('Base')

      await sendIpcToRenderer(app, 'mt::user-preference', { autoSave: true, autoSaveDelay: 20 })
      await resetEditorMetrics(page)
      await resetRevisionSnapshotMetrics(page)

      await placeCaretInEditor(page)
      await page.keyboard.insertText(' shared-revision')
      await page.waitForTimeout(350)

      await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 1)
      await expect.poll(() => readEditorText(page), { timeout: 10000 }).toContain('tab B')
      await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 0)
      await expect.poll(() => readEditorText(page), { timeout: 10000 }).toContain('shared-revision')

      await sendIpcToRenderer(app, 'mt::editor-ask-file-save')
      await page.waitForTimeout(100)

      // PERF_TESTING calls the exact Markdown snapshot helper used by
      // handleExport(), while avoiding a native export destination dialog.
      const exportedMarkdown = await page.evaluate(
        () =>
          (
            globalThis as typeof globalThis & {
              __inkiva_get_export_markdown_snapshot__?: () => string
            }
          ).__inkiva_get_export_markdown_snapshot__?.() ?? ''
      )
      expect(exportedMarkdown).toContain('shared-revision')

      const editorMetrics = await readEditorMetrics(page)
      const snapshotMetrics = await readRevisionSnapshotMetrics(page)
      expect(snapshotMetrics).not.toBeNull()
      if (!snapshotMetrics) throw new Error('revision snapshot metrics are unavailable')
      expect(new Set(editorMetrics.markdownSerializationRevisions).size).toBe(
        editorMetrics.markdownSerializationRevisions.length
      )
      expect(editorMetrics.markdownSerializationCalls).toBeGreaterThan(0)
      expect(snapshotMetrics.markdown.misses).toBe(editorMetrics.markdownSerializationCalls)
      expect(snapshotMetrics.wordCount.misses).toBeLessThanOrEqual(snapshotMetrics.markdown.misses)
      expect(snapshotMetrics.blocks.misses).toBeLessThanOrEqual(snapshotMetrics.markdown.misses)

      // The close handshake may synchronously destroy the renderer. Sending
      // the IPC is the assertion boundary; do not touch the page afterwards.
      await sendIpcToRenderer(app, 'mt::ask-for-close')
    } finally {
      await app.close()
    }
  })

  test('reuses the warm render tree when switching a large document back', async() => {
    const { app, page } = await launchWithMarkdown(createLargeDocument('A'))

    try {
      await expect
        .poll(() => page.locator('.mu-progressive-render-placeholder').count(), { timeout: 10000 })
        .toBe(0)

      await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, createLargeDocument('B'))
      await expect.poll(() => readEditorText(page), { timeout: 10000 }).toContain('B paragraph 0')
      await expect
        .poll(() => page.locator('.mu-progressive-render-placeholder').count(), { timeout: 10000 })
        .toBe(0)

      await page.evaluate(() => {
        const container = document.querySelector('.editor-component .mu-container')
        ;(
          window as typeof window & { __inkiva_warm_first_block__?: Element }
        ).__inkiva_warm_first_block__ = container?.firstElementChild ?? undefined
      })

      await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 0)
      await expect.poll(() => readEditorText(page), { timeout: 10000 }).toContain('A paragraph 0')

      await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 1)
      await expect.poll(() => readEditorText(page), { timeout: 10000 }).toContain('B paragraph 0')

      const reused = await page.evaluate(() => {
        const container = document.querySelector('.editor-component .mu-container')
        const firstBlock = container?.firstElementChild
        const previous = (
          window as typeof window & {
            __inkiva_warm_first_block__?: Element
          }
        ).__inkiva_warm_first_block__
        return !!previous && previous === firstBlock
      })
      expect(reused).toBe(true)
    } finally {
      await app.close()
    }
  })
})
