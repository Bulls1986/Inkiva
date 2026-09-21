import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'

import {
  clearRendererErrors,
  expectNoRendererErrors,
  launchWithMarkdown,
  showSidebarPanel
} from './helpers'

const HEADING_COUNT = 48
const FILLERS_PER_HEADING = 8

const buildHeadingDocument = (): string => {
  const parts: string[] = []
  for (let heading = 1; heading <= HEADING_COUNT; heading++) {
    parts.push(`# Virtual Heading ${heading}`)
    for (let filler = 0; filler < FILLERS_PER_HEADING; filler++) {
      parts.push(
        `section ${heading} filler ${filler} ${'outline-scroll-regression '.repeat(3)}`
      )
    }
  }
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

    // The editor intentionally keeps one viewport of bottom writing space
    // (`padding-bottom: 100vh`). When the scrollbar is at the physical end there
    // may be no Markdown block inside the viewport; the active outline heading is
    // then the heading owning the nearest preceding logical block.
    const candidate = blocks.find(({ rect }) =>
      rect.bottom > viewport.top + 8 && rect.top < viewport.bottom
    )?.node ?? [...blocks].reverse().find(({ rect }) => rect.bottom <= viewport.top + 8)?.node
    if (!candidate) return ''

    const text = candidate.textContent ?? ''
    const fillerMatch = /^section (\d+) filler/.exec(text)
    if (fillerMatch) return `Virtual Heading ${fillerMatch[1]}`

    if (/^H[1-6]$/.test(candidate.tagName)) {
      return text.replace(/^[#\s]+/, '').trim()
    }
    return ''
  })

const scrollToRatio = async(page: Page, ratio: number): Promise<void> => {
  await page.locator('.editor-component').evaluate((node, targetRatio) => {
    const editor = node as HTMLElement
    editor.scrollTop = Math.max(0, (editor.scrollHeight - editor.clientHeight) * targetRatio)
    editor.dispatchEvent(new Event('scroll'))
  }, ratio)
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

test.describe('@virtualization-core virtualization outline + scroll synchronization', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeEach(async() => {
    const launched = await launchWithMarkdown(buildHeadingDocument(), {
      filename: 'virtualization-outline-scroll.md',
      suppressErrorDialog: true,
      waitForEditorTimeout: 30000
    })
    app = launched.app
    page = launched.page
    await clearRendererErrors(app)
    await showSidebarPanel(app, page, 'toc')
    await expect
      .poll(() => page.locator('.side-bar-toc [data-testid="toc-node-label"]').count(), {
        timeout: 10000
      })
      .toBe(HEADING_COUNT)
  })

  test.afterEach(async() => {
    if (app) await app.close()
  })

  test('OUT-006/OUT-007: document scroll and scrollbar-style jumps keep the active outline heading synchronized', async() => {
    for (const ratio of [0.18, 0.42, 0.68, 0.88]) {
      await scrollToRatio(page, ratio)
      await assertOutlineMatchesViewport(page)
    }
    await expectNoRendererErrors(app)
  })

  test('OUT-003/OUT-005: clicking distant outline entries mounts and lands on the exact heading repeatedly', async() => {
    const jumpTo = async(heading: number): Promise<void> => {
      const text = `Virtual Heading ${heading}`
      const label = page.locator('.side-bar-toc').getByText(text, { exact: true })
      await label.click()

      const target = page
        .locator('.mu-container h1, .mu-container h2, .mu-container h3, .mu-container h4, .mu-container h5, .mu-container h6')
        .filter({ hasText: text })
        .first()
      await expect(target).toBeVisible({ timeout: 8000 })
      await expect
        .poll(() => activeOutlineLabel(page), { timeout: 8000 })
        .toBe(text)
      await expect.poll(() => expectedHeadingAtViewport(page), { timeout: 8000 }).toBe(text)
    }

    await jumpTo(42)
    await jumpTo(7)
    await jumpTo(46)
    await jumpTo(3)
    await expectNoRendererErrors(app)
  })

  test('OUT-015/OUT-020: repeated top-middle-bottom navigation does not accumulate outline mismatch', async() => {
    for (let cycle = 0; cycle < 5; cycle++) {
      await scrollToRatio(page, 0)
      await assertOutlineMatchesViewport(page)
      await scrollToRatio(page, 0.55)
      await assertOutlineMatchesViewport(page)
      await scrollToRatio(page, 1)
      await assertOutlineMatchesViewport(page)
    }
    await expectNoRendererErrors(app)
  })
})
