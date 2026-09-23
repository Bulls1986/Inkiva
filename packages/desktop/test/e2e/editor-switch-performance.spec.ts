import { expect, test } from '@playwright/test'
import type { Page } from 'playwright'
import { createMarkdownFixture } from '../../../../perf/gate/fixtures'
import { launchWithMarkdown, placeCaretInEditor, sendIpcToRenderer } from './helpers'

type EditorMetrics = {
  setContentCalls: number
  setContentSources: string[]
  markdownSerializationCalls: number
  markdownSerializationRevisions: number[]
  activationPhaseDurations: Record<string, number[]>
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
        markdownSerializationRevisions: [],
        activationPhaseDurations: {}
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
      state.activationPhaseDurations = {}
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

const percentile = (values: number[], ratio: number): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const position = ratio * (sorted.length - 1)
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  const weight = position - lower
  return sorted[lower] + (sorted[upper] - sorted[lower]) * weight
}

const measureTabActivation = async(page: Page, targetIndex: number): Promise<number> => {
  return page.evaluate(async(index) => {
    const tab = document.querySelectorAll<HTMLElement>('.tabs-container > li')[index]
    if (!tab) throw new Error(`missing tab ${index}`)
    const startedAt = performance.now()
    await new Promise<void>((resolve) => {
      let settled = false
      const observer = new MutationObserver(() => {
        if (settled || !tab.classList.contains('active')) return
        settled = true
        observer.disconnect()
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
      observer.observe(tab, { attributes: true, attributeFilter: ['class'] })
      tab.click()
      if (tab.classList.contains('active')) {
        settled = true
        observer.disconnect()
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }
    })
    return performance.now() - startedAt
  }, targetIndex)
}

const createLargeDocument = (prefix: string): string =>
  `${Array.from({ length: 240 }, (_, index) => `${prefix} paragraph ${index}`).join('\n\n')}\n`

const createPerf01ActivationFixture = (targetChars: 10000 | 50000 | 100000 | 200000): string => {
  if (targetChars === 50000) return createMarkdownFixture('50k').markdown
  if (targetChars === 100000) return createMarkdownFixture('100k').markdown
  if (targetChars === 10000) return createMarkdownFixture('50k').markdown.slice(0, targetChars)
  const base = createMarkdownFixture('100k').markdown
  return `${base}\n\n${base}`.slice(0, targetChars)
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

  test('keeps warm large-document switches virtualized without retaining stale DOM', async() => {
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
        ).__inkiva_warm_first_block__ = container?.querySelector('.mu-paragraph') ?? undefined
      })

      await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 0)
      await expect.poll(() => readEditorText(page), { timeout: 10000 }).toContain('A paragraph 0')

      await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 1)
      await expect.poll(() => readEditorText(page), { timeout: 10000 }).toContain('B paragraph 0')

      const virtualized = await page.evaluate(() => {
        const container = document.querySelector('.editor-component .mu-container')
        const firstBlock = container?.querySelector('.mu-paragraph')
        const previous = (
          window as typeof window & {
            __inkiva_warm_first_block__?: Element
          }
        ).__inkiva_warm_first_block__
        const totalBlocks = Number((container as HTMLElement | null)?.dataset.virtualTotalBlocks ?? 0)
        const mountedBlocks = Number((container as HTMLElement | null)?.dataset.virtualMountedBlocks ?? 0)
        return {
          enabled: (container as HTMLElement | null)?.dataset.virtualizationEnabled === 'true',
          totalBlocks,
          mountedBlocks,
          staleDomRetained: !!previous && previous === firstBlock
        }
      })
      expect(virtualized.enabled).toBe(true)
      expect(virtualized.totalBlocks).toBeGreaterThan(0)
      expect(virtualized.mountedBlocks).toBeGreaterThan(0)
      expect(virtualized.mountedBlocks).toBeLessThan(virtualized.totalBlocks)
      expect(virtualized.staleDomRetained).toBe(false)
    } finally {
      await app.close()
    }
  })

  test('captures 50K warm activation critical-path phase costs without retaining virtual DOM', async() => {
    const markdown = createMarkdownFixture('50k').markdown
    const { app, page } = await launchWithMarkdown(markdown)

    try {
      await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, markdown.replace('Section 0', 'Section B'))
      await expect.poll(() => readEditorText(page), { timeout: 10000 }).toContain('Section B')
      await page.waitForTimeout(200)

      await resetEditorMetrics(page)
      await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 0)
      await expect.poll(() => readEditorText(page), { timeout: 10000 }).toContain('Section 0')
      await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 1)
      await expect.poll(() => readEditorText(page), { timeout: 10000 }).toContain('Section B')

      const metrics = await readEditorMetrics(page)
      expect(metrics.setContentCalls).toBe(2)
      expect(metrics.setContentSources).toEqual(['markdown', 'markdown'])
      expect(metrics.markdownSerializationCalls).toBe(0)
      expect(metrics.activationPhaseDurations['set-content-markdown']).toHaveLength(2)
      expect(
        metrics.activationPhaseDurations['set-content-markdown'].every(
          (duration) => Number.isFinite(duration) && duration >= 0
        )
      ).toBe(true)
      console.log('PERF-01 50K warm activation phases', JSON.stringify(metrics))
    } finally {
      await app.close()
    }
  })

  test('captures 50K cold activation constructor/init/serialization phase costs', async() => {
    const markdown = createMarkdownFixture('50k').markdown
    const frameDeliveryExperiment = true
    const { app, page } = await launchWithMarkdown(markdown, frameDeliveryExperiment
      ? {
        electronSwitches: [
          '--disable-background-timer-throttling',
          '--disable-renderer-backgrounding',
          '--disable-backgrounding-occluded-windows',
          ...(process.env.INKIVA_PERF_GRAPHICS_BACKEND === 'opengl' ? ['--use-angle=gl'] : [])
        ]
      }
      : {})

    try {
      await expect.poll(() => readEditorText(page), { timeout: 15000 }).toContain('Section 0')
      await page.waitForFunction(() => {
        const editor = document.querySelector<HTMLElement>('.editor-component')
        return Number.isFinite(Number(editor?.dataset.editorEditableAt))
      }, undefined, { timeout: 15000 })
      await page.waitForFunction(() => {
        const editor = document.querySelector<HTMLElement>('.editor-component')
        return Number.isFinite(Number(editor?.dataset.editorUiPluginsReadyAt))
      }, undefined, { timeout: 15000 })

      const metrics = await readEditorMetrics(page)
      const virtualization = await page.evaluate(() => {
        const container = document.querySelector<HTMLElement>('.editor-component .mu-container')
        return {
          totalBlocks: Number(container?.dataset.virtualTotalBlocks ?? 0),
          mountedBlocks: Number(container?.dataset.virtualMountedBlocks ?? 0)
        }
      })
      const milestones = await page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.editor-component')
        return {
          openStartAt: Number(editor?.dataset.editorOpenStartAt),
          firstScreenAt: Number(editor?.dataset.editorFirstScreenAt),
          interactiveAt: Number(editor?.dataset.editorInteractiveAt),
          editableAt: Number(editor?.dataset.editorEditableAt),
          uiPluginsReadyAt: Number(editor?.dataset.editorUiPluginsReadyAt),
          milestoneFrameTimings: editor?.dataset.editorMilestoneFrameTimings
            ? JSON.parse(editor.dataset.editorMilestoneFrameTimings)
            : [],
          milestoneLongTasks: editor?.dataset.editorMilestoneLongTasks
            ? JSON.parse(editor.dataset.editorMilestoneLongTasks)
            : []
        }
      })
      const windowState = await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0]
        return {
          visible: win?.isVisible() ?? false,
          focused: win?.isFocused() ?? false,
          minimized: win?.isMinimized() ?? false
        }
      })
      const rendererState = await page.evaluate(() => {
        const canvas = document.createElement('canvas')
        const gl = canvas.getContext('webgl')
        const debugInfo = gl?.getExtension('WEBGL_debug_renderer_info')
        return {
          visibilityState: document.visibilityState,
          hasFocus: document.hasFocus(),
          webgl: gl
            ? {
              vendor: String(gl.getParameter(gl.VENDOR)),
              renderer: String(gl.getParameter(gl.RENDERER)),
              unmaskedVendor: debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)) : null,
              unmaskedRenderer: debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : null
            }
            : null
        }
      })
      expect(metrics.activationPhaseDurations['muya-constructor']).toHaveLength(1)
      expect(metrics.activationPhaseDurations['muya-init']).toHaveLength(1)
      expect(metrics.activationPhaseDurations['serialize-markdown']).toHaveLength(1)
      expect(milestones.firstScreenAt).toBeGreaterThanOrEqual(milestones.openStartAt)
      expect(milestones.editableAt).toBeGreaterThan(milestones.firstScreenAt)
      expect(milestones.uiPluginsReadyAt).toBeGreaterThanOrEqual(milestones.editableAt)
      const pluginSlices = metrics.activationPhaseDurations['muya-ui-plugin-slice'] ?? []
      expect(pluginSlices.length).toBeGreaterThan(0)
      expect(pluginSlices.every((duration) => Number.isFinite(duration) && duration >= 0)).toBe(true)
      console.log('PERF-01 50K cold activation phases', JSON.stringify({
        metrics,
        milestones,
        virtualization,
        windowState,
        rendererState
      }))
    } finally {
      await app.close()
    }
  })

  test('captures PERF-01 10K/50K/100K/200K warm setContent scaling', async() => {
    test.setTimeout(120000)
    const results: Array<{ chars: number; totalBlocks: number; durationMs: number }> = []

    for (const chars of [10000, 50000, 100000, 200000] as const) {
      const markdown = createPerf01ActivationFixture(chars)
      const alternate = markdown.replace('Section 0', `Section PERF01 ${chars}`)
      const { app, page } = await launchWithMarkdown(markdown)

      try {
        await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, alternate)
        await expect.poll(() => readEditorText(page), { timeout: 15000 }).toContain(`Section PERF01 ${chars}`)
        await page.waitForTimeout(150)
        await resetEditorMetrics(page)

        await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 0)
        await expect.poll(() => readEditorText(page), { timeout: 15000 }).toContain('Section 0')

        const metrics = await readEditorMetrics(page)
        const durations = metrics.activationPhaseDurations['set-content-markdown'] ?? []
        expect(metrics.setContentSources).toEqual(['markdown'])
        expect(durations).toHaveLength(1)
        const totalBlocks = await page.evaluate(() => {
          const container = document.querySelector<HTMLElement>('.editor-component .mu-container')
          return Number(container?.dataset.virtualTotalBlocks ?? 0)
        })
        results.push({ chars, totalBlocks, durationMs: durations[0] })
      } finally {
        await app.close()
      }
    }

    expect(results.map((entry) => entry.chars)).toEqual([10000, 50000, 100000, 200000])
    expect(results.every((entry) => Number.isFinite(entry.durationMs) && entry.durationMs >= 0)).toBe(true)
    console.log('PERF-01 activation scaling', JSON.stringify(results))
  })

  test('captures twenty real 50K warm tab activations for paired PERF-01 comparison', async() => {
    test.setTimeout(60000)
    const markdown = createMarkdownFixture('50k').markdown
    const alternate = markdown.replace('Section 0', 'Section PERF01 paired')
    const { app, page } = await launchWithMarkdown(markdown)

    try {
      await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, alternate)
      await expect.poll(() => readEditorText(page), { timeout: 15000 }).toContain('Section PERF01 paired')
      await page.waitForTimeout(200)

      // Warm both cache keys before sampling so this measures reactivation,
      // not first-open construction or one-time parser initialization.
      await measureTabActivation(page, 0)
      await measureTabActivation(page, 1)
      await resetEditorMetrics(page)

      const activationMs: number[] = []
      for (let index = 0; index < 20; index += 1) {
        activationMs.push(await measureTabActivation(page, index % 2 === 0 ? 0 : 1))
      }

      const metrics = await readEditorMetrics(page)
      const setContentMs = metrics.activationPhaseDurations['set-content-markdown'] ?? []
      expect(activationMs).toHaveLength(20)
      expect(setContentMs).toHaveLength(20)
      expect(metrics.setContentSources).toEqual(Array.from({ length: 20 }, () => 'markdown'))
      expect(activationMs.every(Number.isFinite)).toBe(true)
      expect(setContentMs.every(Number.isFinite)).toBe(true)

      console.log(
        'PERF-01 paired warm activation',
        JSON.stringify({
          activation: {
            p50: percentile(activationMs, 0.5),
            p95: percentile(activationMs, 0.95),
            max: Math.max(...activationMs),
            samples: activationMs
          },
          setContent: {
            p50: percentile(setContentMs, 0.5),
            p95: percentile(setContentMs, 0.95),
            max: Math.max(...setContentMs),
            samples: setContentMs
          }
        })
      )
    } finally {
      await app.close()
    }
  })
})
