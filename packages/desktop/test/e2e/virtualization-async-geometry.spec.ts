import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'

import {
  clearRendererErrors,
  enterSourceMode,
  exitSourceMode,
  expectNoRendererErrors,
  launchWithMarkdown,
  sendIpcToRenderer,
  showSidebarPanel
} from './helpers'

const SEGMENT_BLOCKS = 64

const growthTarget = (section: number): string =>
  `ASYNC-GROWTH-TARGET-${section} deterministic ResizeObserver geometry change`

/**
 * Put every growth target at the last logical block of a 64-block segment:
 * 63, 127, 191, ... . Its logical next block is therefore mounted in the
 * following segment, reproducing the cross-segment ResizeObserver boundary.
 */
const buildAsyncGeometryDocument = (): string => {
  const parts: string[] = ['# Async geometry invalidation regression']
  for (let section = 1; section <= 5; section++) {
    parts.push(`## Async Geometry Section ${section}`)
    const fillerCount = section === 1 ? SEGMENT_BLOCKS - 3 : SEGMENT_BLOCKS - 2
    for (let filler = 0; filler < fillerCount; filler++) {
      parts.push(
        `async section ${section} filler ${filler} ${'geometry-propagation '.repeat(3)}`
      )
    }
    parts.push(growthTarget(section))
  }
  parts.push('## Async Geometry End', 'end marker')
  return parts.join('\n\n') + '\n'
}

const activeOutlineLabel = (page: Page): Promise<string> =>
  page
    .locator('.side-bar-toc .toc-node-label.is-active[aria-current="location"]')
    .first()
    .textContent()
    .then((value) => value?.trim() ?? '')

const expectedHeadingAtViewport = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('.editor-component')
    if (!editor) return ''
    const viewport = editor.getBoundingClientRect()
    const blocks = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.mu-container > .mu-virtual-segment > :not(.mu-virtual-render-placeholder), ' +
        '.mu-container > :not(.mu-virtual-segment):not(.mu-virtual-render-placeholder)'
      )
    )
      .map((node) => ({ node, rect: node.getBoundingClientRect() }))
      .sort((left, right) => left.rect.top - right.rect.top)
    const candidate = blocks.find(({ rect }) =>
      rect.bottom > viewport.top + 8 && rect.top < viewport.bottom
    )?.node ?? [...blocks].reverse().find(({ rect }) => rect.bottom <= viewport.top + 8)?.node
    if (!candidate) return ''

    const text = candidate.textContent ?? ''
    const filler = /async section (\d+) filler/i.exec(text)
    if (filler) return `Async Geometry Section ${filler[1]}`
    const growthTargetMatch = /ASYNC-GROWTH-TARGET-(\d+)/i.exec(text)
    if (growthTargetMatch) return `Async Geometry Section ${growthTargetMatch[1]}`
    if (/^H[1-6]$/.test(candidate.tagName)) {
      return text.replace(/^[#\s]+/, '').trim()
    }
    return ''
  })

const readViewportMaterializationMetrics = (page: Page) =>
  page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('.editor-component')
    if (!editor) return null
    const viewport = editor.getBoundingClientRect()
    const blocks = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.mu-container > .mu-virtual-segment > :not(.mu-virtual-render-placeholder), ' +
        '.mu-container > :not(.mu-virtual-segment):not(.mu-virtual-render-placeholder)'
      )
    )
      .map((node) => node.getBoundingClientRect())
      .filter((rect) => rect.bottom > viewport.top && rect.top < viewport.bottom)
      .sort((left, right) => left.top - right.top)

    if (blocks.length === 0) {
      return {
        visibleBlocks: 0,
        viewportHeight: viewport.height,
        topGap: viewport.height,
        bottomGap: viewport.height,
        maxGap: viewport.height
      }
    }

    let maxGap = 0
    for (let index = 1; index < blocks.length; index++) {
      maxGap = Math.max(maxGap, blocks[index].top - blocks[index - 1].bottom)
    }
    return {
      visibleBlocks: blocks.length,
      viewportHeight: viewport.height,
      topGap: Math.max(0, blocks[0].top - viewport.top),
      bottomGap: Math.max(0, viewport.bottom - blocks[blocks.length - 1].bottom),
      maxGap
    }
  })

const assertViewportMaterialized = async(page: Page): Promise<void> => {
  await expect
    .poll(
      async() => {
        const metrics = await readViewportMaterializationMetrics(page)
        if (!metrics || metrics.visibleBlocks === 0) return false
        return (
          metrics.topGap < metrics.viewportHeight * 0.3 &&
          metrics.bottomGap < metrics.viewportHeight * 0.3 &&
          metrics.maxGap < metrics.viewportHeight * 0.45
        )
      },
      {
        timeout: 1500,
        intervals: [16, 32, 64, 128]
      }
    )
    .toBe(true)
}

const assertOutlineMatchesViewport = async(page: Page): Promise<void> => {
  await expect
    .poll(
      async() => {
        const expected = await expectedHeadingAtViewport(page)
        const active = await activeOutlineLabel(page)
        return expected !== '' && active === expected
      },
      { timeout: 8000 }
    )
    .toBe(true)
}

const scrollToRatio = async(page: Page, ratio: number): Promise<void> => {
  await page.locator('.editor-component').evaluate((node, targetRatio) => {
    const editor = node as HTMLElement
    editor.scrollTop = Math.max(0, (editor.scrollHeight - editor.clientHeight) * targetRatio)
    editor.dispatchEvent(new Event('scroll'))
  }, ratio)
}

const scrollToMountedGrowthTarget = async(page: Page): Promise<number> => {
  for (const ratio of [0.18, 0.36, 0.54, 0.72, 0.9]) {
    await scrollToRatio(page, ratio)
    await assertViewportMaterialized(page)
    const section = await page.evaluate(() => {
      const target = Array.from(
        document.querySelectorAll<HTMLElement>(
          '.mu-container > .mu-virtual-segment > :not(.mu-virtual-render-placeholder), ' +
          '.mu-container > :not(.mu-virtual-segment):not(.mu-virtual-render-placeholder)'
        )
      ).find((node) =>
        /ASYNC-GROWTH-TARGET-\d+/.test(node.textContent ?? '') &&
        node.dataset.asyncGeometryExpanded !== 'true'
      )
      const match = /ASYNC-GROWTH-TARGET-(\d+)/.exec(target?.textContent ?? '')
      return match ? Number(match[1]) : 0
    })
    if (section > 0) return section
  }
  return 0
}

const moveGrowthTargetAboveViewport = async(page: Page, section: number): Promise<boolean> => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const state = await page.evaluate((targetSection) => {
      const editor = document.querySelector<HTMLElement>('.editor-component')
      const target = Array.from(
        document.querySelectorAll<HTMLElement>(
          '.mu-container > .mu-virtual-segment > :not(.mu-virtual-render-placeholder)'
        )
      ).find((node) => (node.textContent ?? '').includes(`ASYNC-GROWTH-TARGET-${targetSection}`))
      if (!editor || !target) return 'missing'
      const viewport = editor.getBoundingClientRect()
      if (target.getBoundingClientRect().bottom <= viewport.top) return 'above'
      editor.scrollTop += editor.clientHeight * 0.35
      editor.dispatchEvent(new Event('scroll'))
      return 'move'
    }, section)
    if (state === 'above') return true
    if (state === 'missing') return false
    await assertViewportMaterialized(page)
  }

  return page.evaluate((targetSection) => {
    const editor = document.querySelector<HTMLElement>('.editor-component')
    const target = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.mu-container > .mu-virtual-segment > :not(.mu-virtual-render-placeholder)'
      )
    ).find((node) => (node.textContent ?? '').includes(`ASYNC-GROWTH-TARGET-${targetSection}`))
    if (!editor || !target) return false
    return target.getBoundingClientRect().bottom <= editor.getBoundingClientRect().top
  }, section)
}

const triggerMountedAsyncGrowth = (page: Page): Promise<boolean> =>
  page.evaluate(async() => {
    const blocks = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.mu-container > .mu-virtual-segment > :not(.mu-virtual-render-placeholder), ' +
        '.mu-container > :not(.mu-virtual-segment):not(.mu-virtual-render-placeholder)'
      )
    )
    const target = blocks.find((node) => /ASYNC-GROWTH-TARGET-\d+/.test(node.textContent ?? ''))
    if (!target || target.dataset.asyncGeometryExpanded === 'true') return false

    const before = target.getBoundingClientRect().height
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        target.style.paddingBottom = '320px'
        target.dataset.asyncGeometryExpanded = 'true'
        resolve()
      })
    })
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    return target.getBoundingClientRect().height > before + 250
  })

const scheduleMountedAsyncGrowth = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const blocks = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.mu-container > .mu-virtual-segment > :not(.mu-virtual-render-placeholder), ' +
        '.mu-container > :not(.mu-virtual-segment):not(.mu-virtual-render-placeholder)'
      )
    )
    const target = blocks.find((node) =>
      /ASYNC-GROWTH-TARGET-\d+/.test(node.textContent ?? '') &&
      node.dataset.asyncGeometryExpanded !== 'true'
    )
    if (!target) return false

    requestAnimationFrame(() => {
      target.style.paddingBottom = '320px'
      target.dataset.asyncGeometryExpanded = 'true'
    })
    return true
  })

test.describe('@virtualization-core async geometry invalidation closure', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeEach(async() => {
    const launched = await launchWithMarkdown(buildAsyncGeometryDocument(), {
      filename: 'virtualization-async-geometry.md',
      suppressErrorDialog: true,
      waitForEditorTimeout: 30000
    })
    app = launched.app
    page = launched.page
    await clearRendererErrors(app)
    await showSidebarPanel(app, page, 'toc')
  })

  test.afterEach(async() => {
    if (app) await app.close()
  })

  test('GEO-ASYNC-001: async growth across segment boundaries preserves viewport coverage and outline geometry', async() => {
    let asyncGrowthObserved = false
    for (const ratio of [0.36, 0.5, 0.64, 0.78]) {
      await scrollToRatio(page, ratio)
      await assertViewportMaterialized(page)
      await assertOutlineMatchesViewport(page)

      // Deterministically grow an ordinary paragraph when a segment-tail target
      // is mounted. The mutation is asynchronous so ResizeObserver owns the
      // geometry invalidation path, matching real diagrams/images/fonts without
      // coupling this regression to any renderer-specific scheduling.
      asyncGrowthObserved = (await triggerMountedAsyncGrowth(page)) || asyncGrowthObserved
      await assertViewportMaterialized(page)
      await assertOutlineMatchesViewport(page)

      // Continue scrolling after async geometry settles. A stale prefix index
      // used to produce a partially blank viewport that filled in only after
      // more wheel/scroll activity.
      await page.locator('.editor-component').evaluate((node) => {
        const editor = node as HTMLElement
        editor.scrollTop = Math.min(
          editor.scrollHeight - editor.clientHeight,
          editor.scrollTop + editor.clientHeight * 0.55
        )
        editor.dispatchEvent(new Event('scroll'))
      })
      await assertViewportMaterialized(page)
    }

    expect(asyncGrowthObserved).toBe(true)
    await expectNoRendererErrors(app)
  })

  test('GEO-E2E-02: scrolling while async geometry resolves keeps the viewport materialized', async() => {
    expect(await scrollToMountedGrowthTarget(page)).toBeGreaterThan(0)
    expect(await scheduleMountedAsyncGrowth(page)).toBe(true)

    await scrollToRatio(page, 0.78)
    await assertViewportMaterialized(page)
    await scrollToRatio(page, 0.62)
    await assertViewportMaterialized(page)
    await assertOutlineMatchesViewport(page)
    await expectNoRendererErrors(app)
  })

  test('GEO-E2E-03: outline navigation converges after async geometry changes', async() => {
    const section = await scrollToMountedGrowthTarget(page)
    expect(section).toBeGreaterThan(0)
    expect(await triggerMountedAsyncGrowth(page)).toBe(true)

    const targetLabel = `Async Geometry Section ${section}`
    await page.locator('.side-bar-toc').getByText(targetLabel, { exact: true }).click()
    await expect.poll(() => activeOutlineLabel(page), { timeout: 8000 }).toBe(targetLabel)
    await assertViewportMaterialized(page)
    await assertOutlineMatchesViewport(page)
    await expectNoRendererErrors(app)
  })

  test('GEO-E2E-04: growth above the viewport preserves the reading anchor', async() => {
    const section = await scrollToMountedGrowthTarget(page)
    expect(section).toBeGreaterThan(0)
    expect(await moveGrowthTargetAboveViewport(page, section)).toBe(true)

    const result = await page.evaluate(async(targetSection) => {
      const editor = document.querySelector<HTMLElement>('.editor-component')
      if (!editor) return null
      const viewport = editor.getBoundingClientRect()
      const blocks = Array.from(document.querySelectorAll<HTMLElement>(
        '.mu-container > .mu-virtual-segment > :not(.mu-virtual-render-placeholder)'
      ))
      const target = [...blocks].reverse().find((node) =>
        (node.textContent ?? '').includes(`ASYNC-GROWTH-TARGET-${targetSection}`) &&
        node.dataset.asyncGeometryExpanded !== 'true' &&
        node.getBoundingClientRect().bottom <= viewport.top
      )
      const anchor = blocks.find((node) => {
        const rect = node.getBoundingClientRect()
        return rect.top >= viewport.top && rect.bottom <= viewport.bottom
      })
      if (!target || !anchor) return null

      const anchorText = anchor.textContent ?? ''
      const beforeTop = anchor.getBoundingClientRect().top
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          target.style.paddingBottom = '320px'
          target.dataset.asyncGeometryExpanded = 'true'
          resolve()
        })
      })
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      return {
        anchorText,
        beforeTop,
        afterTop: anchor.getBoundingClientRect().top
      }
    }, section)

    expect(result).not.toBeNull()
    expect(result?.anchorText.length).toBeGreaterThan(0)
    expect(Math.abs((result?.afterTop ?? 0) - (result?.beforeTop ?? 0))).toBeLessThan(80)
    await assertViewportMaterialized(page)
    await assertOutlineMatchesViewport(page)
    await expectNoRendererErrors(app)
  })

  test('GEO-E2E-05: a queued async resize cannot pollute a different active tab', async() => {
    expect(await scrollToMountedGrowthTarget(page)).toBeGreaterThan(0)
    expect(await scheduleMountedAsyncGrowth(page)).toBe(true)

    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, '# Geometry race tab B\n\nplain body\n')
    await expect(page.locator('.editor-component')).toContainText('Geometry race tab B', { timeout: 10000 })
    await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 0)

    await expect(page.locator('.editor-component')).toContainText('Async geometry invalidation regression', {
      timeout: 10000
    })
    await assertViewportMaterialized(page)
    await assertOutlineMatchesViewport(page)
    await expectNoRendererErrors(app)
  })

  test('GEO-E2E-06: WYSIWYG to Source to WYSIWYG drops stale geometry and rebuilds cleanly', async() => {
    expect(await scrollToMountedGrowthTarget(page)).toBeGreaterThan(0)
    expect(await scheduleMountedAsyncGrowth(page)).toBe(true)

    await enterSourceMode(page, app)
    await exitSourceMode(page, app)

    await assertViewportMaterialized(page)
    await assertOutlineMatchesViewport(page)
    await expectNoRendererErrors(app)
  })
})
