import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { focusEditor, launchWithMarkdown, showSidebarPanel } from './helpers'

const RESPONSIVE_LAYOUT_DOC = [
  '# Responsive editor layout',
  '',
  'This paragraph must remain inside the editor at every supported window width.',
  '',
  '```mermaid',
  'graph TD',
  '    A[Start] --> B[Review]',
  '    B --> C[Done]',
  '```',
  ''
].join('\n')

interface LayoutBox {
  left: number
  right: number
  width: number
}

interface EditorBox extends LayoutBox {
  clientWidth: number
  scrollWidth: number
}

interface ResponsiveLayoutMetrics {
  viewportWidth: number
  sidebar: LayoutBox | null
  sidebarOverlay: boolean
  editorMiddle: LayoutBox | null
  editorWithTabs: LayoutBox | null
  editorComponent: EditorBox | null
  heading: LayoutBox | null
  diagram: LayoutBox | null
}

const responsiveLayoutMetrics = async(page: Page): Promise<ResponsiveLayoutMetrics> =>
  page.evaluate(() => {
    const getBox = (selector: string): LayoutBox | null => {
      const element = document.querySelector(selector)
      if (!element) return null
      const { left, right, width } = element.getBoundingClientRect()
      return { left, right, width }
    }

    const editor = document.querySelector('.editor-component') as HTMLElement | null
    const editorBox = getBox('.editor-component')

    return {
      viewportWidth: window.innerWidth,
      sidebar: getBox('.side-bar'),
      sidebarOverlay: !!document.querySelector('.side-bar.side-bar--overlay'),
      editorMiddle: getBox('.editor-middle'),
      editorWithTabs: getBox('.editor-with-tabs'),
      editorComponent:
        editor && editorBox
          ? { ...editorBox, clientWidth: editor.clientWidth, scrollWidth: editor.scrollWidth }
          : null,
      heading: getBox('.mu-container > h1'),
      diagram: getBox('.mu-diagram-preview svg')
    }
  })

const sidebarWidth = async(page: Page): Promise<number> =>
  page.evaluate(() => {
    const el = document.querySelector('.side-bar') as HTMLElement | null
    return el ? Math.round(el.getBoundingClientRect().width) : 0
  })

const editorMiddleLeft = async(page: Page): Promise<number> =>
  page.evaluate(() => {
    const el = document.querySelector('.editor-middle') as HTMLElement | null
    return el ? Math.round(el.getBoundingClientRect().left) : -1
  })

const setWindowSize = async(
  app: ElectronApplication,
  width: number,
  height = 800
): Promise<void> => {
  await app.evaluate(({ BrowserWindow }, [w, h]) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) throw new Error('No editor BrowserWindow found')
    win.setSize(w, h)
  }, [width, height] as const)
}

const waitForViewport = async(page: Page, width: number): Promise<void> => {
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width)
}

test.describe('Typora sidebar responsive parity', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# Sidebar responsive parity\n')
    app = launched.app
    page = launched.page
    await showSidebarPanel(app, page, 'files')
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('uses the Typora 270px default width on a regular window', async() => {
    await setWindowSize(app, 1200)
    await waitForViewport(page, 1200)
    await showSidebarPanel(app, page, 'files')

    await expect.poll(() => sidebarWidth(page)).toBe(270)
    await expect.poll(() => editorMiddleLeft(page)).toBe(270)
  })

  test('caps the rendered sidebar at 240px at or below 1000px without changing the saved preference', async() => {
    await setWindowSize(app, 1200)
    await waitForViewport(page, 1200)
    await showSidebarPanel(app, page, 'files')

    const dragBar = page.locator('.side-bar .drag-bar')
    const box = await dragBar.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.move(box!.x + 1, box!.y + 80)
    await page.mouse.down()
    await page.mouse.move(box!.x + 91, box!.y + 80, { steps: 6 })
    await page.mouse.up()

    await expect.poll(() => sidebarWidth(page)).toBeGreaterThan(300)
    const preferredWidth = await page.evaluate(() => Number(localStorage.getItem('side-bar-width')))
    expect(preferredWidth).toBeGreaterThan(300)

    await setWindowSize(app, 1000)
    await waitForViewport(page, 1000)
    await expect.poll(() => sidebarWidth(page)).toBe(240)
    await expect.poll(() => editorMiddleLeft(page)).toBe(240)

    const savedAtNarrowWidth = await page.evaluate(() => Number(localStorage.getItem('side-bar-width')))
    expect(savedAtNarrowWidth).toBe(preferredWidth)

    await setWindowSize(app, 1200)
    await waitForViewport(page, 1200)
    await expect.poll(() => sidebarWidth(page)).toBe(preferredWidth)
  })

  test('switches to overlay mode from 590px down so the sidebar no longer squeezes the editor', async() => {
    await setWindowSize(app, 590)
    await waitForViewport(page, 590)
    await showSidebarPanel(app, page, 'files')

    await expect(page.locator('.side-bar')).toHaveClass(/side-bar--overlay/)
    await expect.poll(() => sidebarWidth(page)).toBe(240)
    await expect.poll(() => editorMiddleLeft(page)).toBe(0)

    // Inkiva's BrowserWindow has minWidth: 550, so this is the smallest real
    // editor window and the most important compact-layout regression case.
    await setWindowSize(app, 550)
    await waitForViewport(page, 550)
    await expect(page.locator('.side-bar')).toHaveClass(/side-bar--overlay/)
    await expect.poll(() => editorMiddleLeft(page)).toBe(0)
  })

  test('leaves overlay mode again above 590px and resumes normal flex layout', async() => {
    await setWindowSize(app, 591)
    await waitForViewport(page, 591)
    await showSidebarPanel(app, page, 'files')

    await expect(page.locator('.side-bar')).not.toHaveClass(/side-bar--overlay/)
    await expect.poll(() => sidebarWidth(page)).toBe(240)
    await expect.poll(() => editorMiddleLeft(page)).toBe(240)
  })
})

test.describe('Responsive editor content layout', () => {
  let app: ElectronApplication
  let page: Page
  let preferredSidebarWidth: number

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown(RESPONSIVE_LAYOUT_DOC)
    app = launched.app
    page = launched.page
    await showSidebarPanel(app, page, 'files')

    // Reproduce the persisted-width state from the reported screenshots. The
    // narrow breakpoints render this preference at 240px, but the preference
    // itself must remain larger when the window returns to desktop size.
    const dragBar = page.locator('.side-bar .drag-bar')
    const box = await dragBar.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.move(box!.x + 1, box!.y + 80)
    await page.mouse.down()
    await page.mouse.move(box!.x + 61, box!.y + 80, { steps: 6 })
    await page.mouse.up()
    await expect.poll(() => sidebarWidth(page)).toBeGreaterThan(300)
    preferredSidebarWidth = await sidebarWidth(page)

    await focusEditor(page)
    await expect(page.locator('.mu-container > h1')).toBeVisible()
    await expect(page.locator('.mu-diagram-preview svg').first()).toBeVisible({ timeout: 15000 })
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('keeps document and diagram width aligned at desktop, narrow, and overlay breakpoints', async() => {
    // The 550px case is the minimum BrowserWindow size. At that width the
    // sidebar is fixed/overlay and must not reduce the editor's layout width.
    const cases = [
      { width: 1050, sidebar: preferredSidebarWidth, overlay: false },
      { width: 680, sidebar: 240, overlay: false },
      { width: 550, sidebar: 240, overlay: true }
    ]

    for (const { width, sidebar, overlay } of cases) {
      await setWindowSize(app, width)
      await waitForViewport(page, width)

      await expect.poll(() => sidebarWidth(page)).toBe(sidebar)
      if (overlay) {
        await expect(page.locator('.side-bar')).toHaveClass(/side-bar--overlay/)
      } else {
        await expect(page.locator('.side-bar')).not.toHaveClass(/side-bar--overlay/)
      }

      const expectedEditorWidth = width - (overlay ? 0 : sidebar)
      await expect.poll(() => editorMiddleLeft(page)).toBe(overlay ? 0 : sidebar)
      await expect
        .poll(async() =>
          Math.round((await responsiveLayoutMetrics(page)).editorMiddle?.width ?? -1)
        )
        .toBe(expectedEditorWidth)
      await expect
        .poll(async() =>
          Math.round((await responsiveLayoutMetrics(page)).editorWithTabs?.width ?? -1)
        )
        .toBe(expectedEditorWidth)

      const metrics = await responsiveLayoutMetrics(page)
      expect(metrics.editorMiddle).not.toBeNull()
      expect(metrics.editorWithTabs).not.toBeNull()
      expect(metrics.editorComponent).not.toBeNull()
      expect(metrics.heading).not.toBeNull()
      expect(metrics.diagram).not.toBeNull()
      expect(metrics.viewportWidth).toBe(width)
      expect(metrics.sidebar).not.toBeNull()
      expect(Math.round(metrics.sidebar!.width)).toBe(sidebar)
      expect(metrics.sidebarOverlay).toBe(overlay)

      const editorRight = metrics.editorComponent!.right
      expect(metrics.editorWithTabs!.right).toBeLessThanOrEqual(metrics.editorMiddle!.right + 1)
      expect(metrics.editorComponent!.scrollWidth).toBeLessThanOrEqual(
        metrics.editorComponent!.clientWidth + 2
      )
      expect(metrics.heading!.left).toBeGreaterThanOrEqual(metrics.editorComponent!.left - 1)
      expect(metrics.heading!.right).toBeLessThanOrEqual(editorRight + 1)
      expect(metrics.diagram!.right).toBeLessThanOrEqual(editorRight + 1)
    }
  })
})
