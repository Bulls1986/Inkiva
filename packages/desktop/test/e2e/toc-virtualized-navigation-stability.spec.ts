import { expect, test } from '@playwright/test'
import { launchWithMarkdown, showSidebarPanel } from './helpers'

const table = (rows: number, prefix: string): string => [
  '| Module | Current status | Observed result | Notes |',
  '| --- | --- | --- | --- |',
  ...Array.from({ length: rows }, (_, i) =>
    `| ${prefix}-${i} | verified | ${i * 17} records | Details with enough wrapping text for realistic geometry changes. |`
  )
].join('\n')

const buildVirtualizedReport = (): string => [
  '# Verification Report',
  '## Executive summary',
  'A document with many tables, headings, and ordinary Markdown paragraphs.',
  '## Statistics and completion conditions',
  ...Array.from({ length: 18 }, (_, i) =>
    `- Condition ${i}: the frozen results are checked against the accepted baseline.`
  ),
  '## Per-module coverage and test outcomes',
  table(70, 'module'),
  '## Failure causes and planned actions',
  table(20, 'cause'),
  '### Basis for each cause group and proposed scope',
  'This is the destination of an explicit jump across large virtualized tables.',
  ...Array.from({ length: 220 }, (_, i) => [
    `### Appendix section ${i + 1}`,
    `Supporting explanation for item ${i + 1}, including extra text that spans normal paragraph lines and changes measured block heights.`,
    table(4, `appendix-${i}`)
  ].join('\n\n'))
].join('\n\n') + '\n'

test('virtualized report TOC jump settles without repeated scroll reversal and highlights the destination', async() => {
  test.setTimeout(120000)
  const { app, page } = await launchWithMarkdown(buildVirtualizedReport(), {
    waitForEditorTimeout: 90000
  })
  try {
    await showSidebarPanel(app, page, 'toc')
    const toc = page.locator('.side-bar-toc')
    const earlier = toc.getByText('Statistics and completion conditions', { exact: true })
    const destination = toc.getByText('Basis for each cause group and proposed scope', { exact: true })
    await expect(earlier).toBeVisible()
    await expect(destination).toBeVisible()
    await expect(page.locator('.mu-container[data-virtualization-enabled="true"]')).toHaveCount(1)
    await earlier.click()
    await destination.click()

    // The first few paint boundaries may legitimately align the destination.
    // During the following 2 seconds it must stay settled rather than
    // repeatedly correcting to an estimated offscreen block position.
    const trace = await page.evaluate(() => new Promise<Array<{ elapsed: number; top: number }>>((resolve) => {
      const el = document.querySelector('.editor-component') as HTMLElement
      const start = performance.now()
      const samples: Array<{ elapsed: number; top: number }> = []
      const sample = () => {
        const elapsed = performance.now() - start
        samples.push({ elapsed, top: el.scrollTop })
        if (elapsed >= 2800) resolve(samples)
        else requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    }))
    const settled = trace.filter(sample => sample.elapsed >= 800)
    expect(settled.length).toBeGreaterThan(3)
    expect(Math.max(...settled.map(sample => sample.top)) -
      Math.min(...settled.map(sample => sample.top))).toBeLessThanOrEqual(80)

    const headingInViewport = await page.evaluate(() => {
      const editor = document.querySelector('.editor-component') as HTMLElement
      const heading = Array.from(document.querySelectorAll('.mu-container h3'))
        .find(node => node.textContent?.includes('Basis for each cause group and proposed scope'))
      if (!heading) return false
      const { top, bottom } = editor.getBoundingClientRect()
      const rect = heading.getBoundingClientRect()
      return rect.top >= top - 2 && rect.top <= bottom
    })
    expect(headingInViewport).toBe(true)
    await expect(destination).toHaveClass(/is-active/)
  } finally {
    await app.close()
  }
})
