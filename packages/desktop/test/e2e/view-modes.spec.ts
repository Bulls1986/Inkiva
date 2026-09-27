import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import {
  launchWithMarkdown,
  clickMenuById,
  enterSourceMode,
  exitSourceMode
} from './helpers'

// Read the live `checked`/`enabled` state of a view-mode menu item straight
// from the active application menu — the same Menu instance that
// `viewLayoutChanged` (main/menu/actions/view.ts) mutates after the renderer
// round-trips `mt::view-layout-changed`. Mirrors menu-sanity.spec.ts:60 and
// parity-pg1-menu-state.spec.ts:23.
const viewModeMenuItem = async(
  app: ElectronApplication,
  id: string
): Promise<{ checked: boolean; enabled: boolean } | null> =>
  app.evaluate(({ Menu }, menuId) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(menuId)
    return item ? { checked: !!item.checked, enabled: !!item.enabled } : null
  }, id)

// Poll the menu item until its `checked` flag matches `want` (the toggle ->
// renderer -> `mt::view-layout-changed` -> main round-trip is async).
const waitForChecked = async(
  app: ElectronApplication,
  id: string,
  want: boolean,
  timeout = 4000
): Promise<{ checked: boolean; enabled: boolean }> => {
  const deadline = Date.now() + timeout
  let last = await viewModeMenuItem(app, id)
  while (Date.now() < deadline) {
    if (last && last.checked === want) return last
    await new Promise((resolve) => setTimeout(resolve, 100))
    last = await viewModeMenuItem(app, id)
  }
  return last ?? { checked: false, enabled: false }
}

const waitForEnabled = async(
  app: ElectronApplication,
  id: string,
  want: boolean,
  timeout = 4000
): Promise<{ checked: boolean; enabled: boolean }> => {
  const deadline = Date.now() + timeout
  let last = await viewModeMenuItem(app, id)
  while (Date.now() < deadline) {
    if (last && last.enabled === want) return last
    await new Promise((resolve) => setTimeout(resolve, 100))
    last = await viewModeMenuItem(app, id)
  }
  return last ?? { checked: false, enabled: false }
}

test.describe('View modes', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# View modes\n\nBody.\n')
    app = launched.app
    page = launched.page
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('Toggle focus mode adds and removes .focus on .editor-wrapper', async() => {
    await clickMenuById(app, 'focusModeMenuItem')
    await expect(page.locator('.editor-wrapper')).toHaveClass(/(^|\s)focus(\s|$)/)
    await clickMenuById(app, 'focusModeMenuItem')
    await page.waitForFunction(
      () => {
        const el = document.querySelector('.editor-wrapper')
        return !el || !el.classList.contains('focus')
      },
      null,
      { timeout: 5000 }
    )
  })

  test('Toggle typewriter mode adds and removes .typewriter on .editor-wrapper', async() => {
    await clickMenuById(app, 'typewriterModeMenuItem')
    await expect(page.locator('.editor-wrapper')).toHaveClass(/(^|\s)typewriter(\s|$)/)
    await clickMenuById(app, 'typewriterModeMenuItem')
    await page.waitForFunction(
      () => {
        const el = document.querySelector('.editor-wrapper')
        return !el || !el.classList.contains('typewriter')
      },
      null,
      { timeout: 5000 }
    )
  })

  test('Toggle source-code mode swaps editor for CodeMirror', async() => {
    await clickMenuById(app, 'sourceCodeModeMenuItem')
    await page.waitForSelector('.source-code .CodeMirror', { state: 'attached', timeout: 10000 })
    await expect(page.locator('.editor-wrapper')).toHaveClass(/(^|\s)source(\s|$)/)
    await clickMenuById(app, 'sourceCodeModeMenuItem')
    await page.waitForFunction(() => !document.querySelector('.source-code'), null, {
      timeout: 10000
    })
  })

  // Item 155 — In source-code mode the Typewriter and Focus menu items are
  // disabled (editing modes don't apply to the CodeMirror surface), and become
  // enabled again on exit. `viewLayoutChanged`'s `sourceCode` branch toggles
  // `focusModeMenuItem.enabled` / `typewriterModeMenuItem.enabled` off; nothing
  // else covers this disabled-in-source assertion.
  test('Item 155: source mode disables Typewriter + Focus menu items, exit re-enables', async() => {
    // Baseline: both enabled in WYSIWYG.
    expect((await waitForEnabled(app, 'typewriterModeMenuItem', true)).enabled).toBe(true)
    expect((await waitForEnabled(app, 'focusModeMenuItem', true)).enabled).toBe(true)

    await enterSourceMode(page, app)

    // The renderer round-trips `mt::view-layout-changed` with sourceCode:true,
    // which disables both editing-mode items.
    expect((await waitForEnabled(app, 'typewriterModeMenuItem', false)).enabled).toBe(false)
    expect((await waitForEnabled(app, 'focusModeMenuItem', false)).enabled).toBe(false)

    await exitSourceMode(page, app)

    expect((await waitForEnabled(app, 'typewriterModeMenuItem', true)).enabled).toBe(true)
    expect((await waitForEnabled(app, 'focusModeMenuItem', true)).enabled).toBe(true)
  })

  // Item 265 — The three view-mode menu items are checkboxes whose `checked`
  // state must flip with each toggle. view-modes' other tests only assert the
  // `.editor-wrapper` class; menu-sanity only asserts the ids EXIST.
  test('Item 265: view-mode menu items track their checked state on toggle', async() => {
    // Source-code mode checkbox.
    expect((await viewModeMenuItem(app, 'sourceCodeModeMenuItem'))?.checked).toBe(false)
    await enterSourceMode(page, app)
    expect((await waitForChecked(app, 'sourceCodeModeMenuItem', true)).checked).toBe(true)
    await exitSourceMode(page, app)
    expect((await waitForChecked(app, 'sourceCodeModeMenuItem', false)).checked).toBe(false)

    // Typewriter mode checkbox.
    expect((await viewModeMenuItem(app, 'typewriterModeMenuItem'))?.checked).toBe(false)
    await clickMenuById(app, 'typewriterModeMenuItem')
    expect((await waitForChecked(app, 'typewriterModeMenuItem', true)).checked).toBe(true)
    await clickMenuById(app, 'typewriterModeMenuItem')
    expect((await waitForChecked(app, 'typewriterModeMenuItem', false)).checked).toBe(false)

    // Focus mode checkbox.
    expect((await viewModeMenuItem(app, 'focusModeMenuItem'))?.checked).toBe(false)
    await clickMenuById(app, 'focusModeMenuItem')
    expect((await waitForChecked(app, 'focusModeMenuItem', true)).checked).toBe(true)
    await clickMenuById(app, 'focusModeMenuItem')
    expect((await waitForChecked(app, 'focusModeMenuItem', false)).checked).toBe(false)
  })
})

// Click into a top-level block the way parity-pg1-menu-state.spec.ts:41 does —
// a real bubbling click on the content span drives Muya's selection handling,
// which flips the `.mu-active` ancestor-chain class that focus mode keys off.
const placeCaretIn = async(page: Page, selector: string): Promise<void> => {
  await page.evaluate((sel) => {
    const span = document.querySelector(sel) as HTMLElement | null
    if (!span) throw new Error(`no element for ${sel}`)
    span.scrollIntoView({ block: 'center' })
    const range = document.createRange()
    range.selectNodeContents(span)
    range.collapse(false)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    span.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  }, selector)
  await page.waitForTimeout(120)
}

// Item 250 — 专注模式：活动块与非活动块计算后不透明度不同. Real Chromium computes the
// `.mu-focus-mode .mu-container > *` { opacity: 0.25 } / `> .mu-active`
// { opacity: 1 } cascade (blockSyntax.css), so we can assert the *computed*
// opacity differs — something the happy-dom muya unit can only do by class.
test.describe('View modes — focus mode dims non-active blocks (item 250)', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown(
      'first paragraph\n\nsecond paragraph\n\nthird paragraph\n'
    )
    app = launched.app
    page = launched.page
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('item 250: active top-level block is full opacity, siblings are dimmed', async() => {
    await clickMenuById(app, 'focusModeMenuItem')
    await expect(page.locator('.editor-component')).toHaveClass(/(^|\s)mu-focus-mode(\s|$)/)

    // Put the caret in the FIRST paragraph; its top-level block must carry
    // `.mu-active`, the others must not.
    await placeCaretIn(page, '.mu-container > p.mu-paragraph:nth-of-type(1) .mu-paragraph-content')

    // The selection-change -> mu-active flip is async; poll for it.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const blocks = Array.from(
              document.querySelectorAll('.mu-focus-mode .mu-container > p.mu-paragraph')
            )
            return blocks.length >= 2 && blocks[0].classList.contains('mu-active')
          }),
        { timeout: 4000 }
      )
      .toBe(true)

    const readOpacities = (): Promise<{ active: number; inactive: number } | null> =>
      page.evaluate(() => {
        const blocks = Array.from(
          document.querySelectorAll('.mu-focus-mode .mu-container > p.mu-paragraph')
        ) as HTMLElement[]
        const active = blocks.find((b) => b.classList.contains('mu-active'))
        const inactive = blocks.find((b) => !b.classList.contains('mu-active'))
        if (!active || !inactive) return null
        return {
          active: parseFloat(window.getComputedStyle(active).opacity),
          inactive: parseFloat(window.getComputedStyle(inactive).opacity)
        }
      })

    // The dimming has a 0.2s opacity transition; poll until it settles at the
    // 0.25 target rather than catching the animation mid-flight.
    await expect
      .poll(
        async() => {
          const o = await readOpacities()
          return o ? o.inactive < 0.5 : false
        },
        { timeout: 4000 }
      )
      .toBe(true)

    const opacities = (await readOpacities())!
    // Active block is fully opaque; siblings are dimmed (CSS sets 0.25).
    expect(opacities.active).toBeCloseTo(1, 2)
    expect(opacities.inactive).toBeLessThan(opacities.active)
    expect(opacities.inactive).toBeLessThan(0.5)

    // Reset: turn focus mode back off so the class is cleared.
    await clickMenuById(app, 'focusModeMenuItem')
    await page.waitForFunction(
      () => {
        const el = document.querySelector('.editor-component')
        return !el || !el.classList.contains('mu-focus-mode')
      },
      null,
      { timeout: 5000 }
    )
  })
})

// Item 173 — Typewriter mode keeps the caret near the vertical center of the
// scroll container, and toggling it OFF must NOT slam the editor to the bottom
// (the regression note: "editor scrolled to bottom on toggle-off"). The scroll
// container is `editor.value.domNode` (the `.editor-component`); STANDAR_Y=320
// is the centered top offset the renderer scrolls the caret to.
test.describe('View modes — typewriter scrolling (item 173)', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    // A tall document so the editor actually scrolls.
    const lines: string[] = []
    for (let i = 0; i < 80; i++) lines.push(`line number ${i} of the tall document`)
    const launched = await launchWithMarkdown(lines.join('\n\n') + '\n')
    app = launched.app
    page = launched.page
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  // Caret block bounding-box top relative to the scroll container's viewport.
  const caretBlockOffset = (): Promise<{
    relativeTop: number
    containerHeight: number
  } | null> =>
    page.evaluate(() => {
      const container = document.querySelector('.editor-component') as HTMLElement | null
      if (!container) return null
      const sel = window.getSelection()
      let block: Element | null = null
      if (sel && sel.rangeCount) {
        const node = sel.getRangeAt(0).startContainer
        const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
        block = el?.closest('p.mu-paragraph') ?? null
      }
      if (!block) return null
      const cRect = container.getBoundingClientRect()
      const bRect = block.getBoundingClientRect()
      return { relativeTop: bRect.top - cRect.top, containerHeight: cRect.height }
    })

  test('US15 AC-62: manual body click suspends typewriter follow until the next text input', async() => {
    await clickMenuById(app, 'typewriterModeMenuItem')
    await expect(page.locator('.editor-wrapper')).toHaveClass(/(^|\s)typewriter(\s|$)/)
    await expect
      .poll(
        async() => {
          const offset = await caretBlockOffset()
          if (!offset) return false
          const reference = offset.containerHeight * 0.4
          return Math.abs(offset.relativeTop - reference) <= 60
        },
        { timeout: 4000 }
      )
      .toBe(true)
    await expect
      .poll(
        async() => {
          const before = await page.evaluate(() => {
            const container = document.querySelector('.editor-component') as HTMLElement | null
            return container?.scrollTop ?? null
          })
          if (before == null) return false
          await page.waitForTimeout(80)
          const after = await page.evaluate(() => {
            const container = document.querySelector('.editor-component') as HTMLElement | null
            return container?.scrollTop ?? null
          })
          return after != null && Math.abs(after - before) <= 1
        },
        { timeout: 4000 }
      )
      .toBe(true)

    // Move the viewport without touching the editor selection. Virtualized
    // blocks may remount while this settles, so choose the click target only
    // from the DOM that is actually visible after the scroll.
    await page.evaluate(() => {
      const container = document.querySelector('.editor-component') as HTMLElement | null
      if (!container) throw new Error('US15 scroll container unavailable')
      container.scrollTop = Math.min(
        container.scrollHeight - container.clientHeight,
        container.scrollTop + container.clientHeight * 0.8
      )
      container.dispatchEvent(new Event('scroll'))
    })

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const container = document.querySelector('.editor-component') as HTMLElement | null
            if (!container) return false
            const containerRect = container.getBoundingClientRect()
            return Array.from(document.querySelectorAll<HTMLElement>('p.mu-paragraph')).some(
              (target) => {
                const content = target.querySelector<HTMLElement>('.mu-paragraph-content')
                if (!content) return false
                const targetRect = target.getBoundingClientRect()
                const relativeTop = targetRect.top - containerRect.top
                const reference = containerRect.height * 0.4
                return (
                  relativeTop > 80 &&
                  relativeTop < containerRect.height - 120 &&
                  Math.abs(relativeTop - reference) > 160
                )
              }
            )
          }),
        { timeout: 4000 }
      )
      .toBe(true)

    const clickTarget = await page.evaluate(() => {
      const container = document.querySelector('.editor-component') as HTMLElement | null
      if (!container) throw new Error('US15 target paragraph unavailable')
      const containerRect = container.getBoundingClientRect()
      const candidates = Array.from(document.querySelectorAll<HTMLElement>('p.mu-paragraph'))
        .map((target) => ({
          target,
          content: target.querySelector<HTMLElement>('.mu-paragraph-content'),
          rect: target.getBoundingClientRect()
        }))
        .filter(({ content, rect }) => {
          const relativeTop = rect.top - containerRect.top
          const reference = containerRect.height * 0.4
          return (
            !!content &&
            relativeTop > 80 &&
            relativeTop < containerRect.height - 120 &&
            Math.abs(relativeTop - reference) > 160
          )
        })
        .sort(
          (a, b) =>
            Math.abs(b.rect.top - containerRect.top - containerRect.height * 0.4) -
            Math.abs(a.rect.top - containerRect.top - containerRect.height * 0.4)
        )
      const candidate = candidates[0]
      if (!candidate?.content) throw new Error('US15 visible target paragraph unavailable')
      const contentRect = candidate.content.getBoundingClientRect()
      const x = contentRect.left + Math.min(12, Math.max(4, contentRect.width / 3))
      const y = contentRect.top + contentRect.height / 2
      const hit = document.elementFromPoint(x, y)
      if (!hit || !candidate.target.contains(hit)) {
        throw new Error('US15 target coordinates failed hit testing')
      }
      return {
        relativeTop: candidate.rect.top - containerRect.top,
        containerHeight: containerRect.height,
        x,
        y,
        text: candidate.target.textContent ?? ''
      }
    })

    expect(clickTarget.containerHeight).toBeGreaterThan(300)
    const clickReference = clickTarget.containerHeight * 0.4
    expect(Math.abs(clickTarget.relativeTop - clickReference)).toBeGreaterThan(160)

    // Use the real mouse at the already-visible target. Locator.click() can
    // auto-scroll and would obscure which layer owns the resulting viewport.
    await page.mouse.click(clickTarget.x, clickTarget.y)
    await expect
      .poll(() =>
        page.evaluate(() => {
          const selection = window.getSelection()
          const node = selection?.focusNode ?? null
          if (!node) return ''
          const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement
          return element?.closest('p.mu-paragraph')?.textContent ?? ''
        })
      )
      .toBe(clickTarget.text)

    // This is intentionally a bounded negative-condition window: the legacy
    // implementation animates every selection-change back toward STANDAR_Y in
    // 100 ms. After a manual click, US15 requires that animation not to happen.
    await page.waitForTimeout(250)

    const afterClick = await caretBlockOffset()
    expect(afterClick).not.toBeNull()
    if (!afterClick) throw new Error('US15 caret offset unavailable after manual click')
    expect(
      Math.abs(afterClick.relativeTop - afterClick.containerHeight * 0.4)
    ).toBeGreaterThan(80)

    // The next actual text input resumes Typewriter follow from the new caret.
    await page.keyboard.type('x')
    await expect
      .poll(
        async() => {
          const offset = await caretBlockOffset()
          if (!offset) return false
          const reference = offset.containerHeight * 0.4
          return Math.abs(offset.relativeTop - reference) <= 60
        },
        { timeout: 4000 }
      )
      .toBe(true)

    await clickMenuById(app, 'typewriterModeMenuItem')
  })

  // FIXME(headless): typewriter centering and the post-toggle scroll-into-view
  // assertions depend on a real rendered viewport and stable scroll settling,
  // which xvfb does not reproduce (this passes on a headed display). The
  // `.typewriter` class toggle is covered by the test above, and the checklist
  // classifies typewriter centering as manual QA.
  test.fixme('item 173: typewriter centers the caret; toggling off keeps it in view (not at the bottom)', async() => {
    await clickMenuById(app, 'typewriterModeMenuItem')
    await expect(page.locator('.editor-wrapper')).toHaveClass(/(^|\s)typewriter(\s|$)/)

    // Place the caret in a middle paragraph and type so the engine re-centers.
    await placeCaretIn(
      page,
      '.mu-container > p.mu-paragraph:nth-of-type(40) .mu-paragraph-content'
    )
    await page.click('.editor-component')
    await placeCaretIn(
      page,
      '.mu-container > p.mu-paragraph:nth-of-type(40) .mu-paragraph-content'
    )
    await page.keyboard.type(' typed', { delay: 0 })

    // Typewriter re-centers the caret to STANDAR_Y (320) within a tolerance
    // band — layout/scroll settling on xvfb is timing sensitive, so poll.
    await expect
      .poll(
        async() => {
          const o = await caretBlockOffset()
          if (!o) return false
          return o.relativeTop > 120 && o.relativeTop < o.containerHeight - 120
        },
        { timeout: 5000 }
      )
      .toBe(true)

    const centered = await caretBlockOffset()
    expect(centered).not.toBeNull()
    // Caret block sits in the vertical middle band, not pinned to top/bottom.
    expect(centered!.relativeTop).toBeGreaterThan(120)
    expect(centered!.relativeTop).toBeLessThan(centered!.containerHeight - 120)

    // The regression: toggling typewriter OFF jumped the editor to the bottom.
    // After toggle-off the caret block must remain within the viewport.
    await clickMenuById(app, 'typewriterModeMenuItem')
    await page.waitForFunction(
      () => {
        const el = document.querySelector('.editor-wrapper')
        return !el || !el.classList.contains('typewriter')
      },
      null,
      { timeout: 5000 }
    )

    await expect
      .poll(
        async() => {
          const o = await caretBlockOffset()
          if (!o) return false
          // In view = top within [0, containerHeight]. The bug pushed the block
          // off-screen (relativeTop far exceeding the container height).
          return o.relativeTop >= 0 && o.relativeTop <= o.containerHeight
        },
        { timeout: 5000 }
      )
      .toBe(true)

    const afterToggle = await caretBlockOffset()
    expect(afterToggle).not.toBeNull()
    expect(afterToggle!.relativeTop).toBeGreaterThanOrEqual(0)
    expect(afterToggle!.relativeTop).toBeLessThanOrEqual(afterToggle!.containerHeight)
  })
})
