import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchWithMarkdown } from './helpers'

const SUPPORTED_WIDTHS = [
  550,
  590,
  600,
  601,
  768,
  820,
  821,
  1000,
  1001,
  1280,
  1440
] as const

interface LayoutBox {
  left: number
  right: number
  width: number
  display: string
}

interface TitleBarMetrics {
  viewportWidth: number
  titleBar: LayoutBox
  menu: LayoutBox
  document: LayoutBox
  stats: LayoutBox
  controls: LayoutBox
  pathDisplay: string
}

const setWindowSize = async(
  app: ElectronApplication,
  width: number,
  height = 800
): Promise<void> => {
  await app.evaluate(
    ({ BrowserWindow }, [w, h]) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (!win) throw new Error('No editor BrowserWindow found')
      win.setSize(w, h)
    },
    [width, height] as const
  )
}

const waitForViewport = async(page: Page, width: number): Promise<void> => {
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width)
}

const titleBarMetrics = async(page: Page): Promise<TitleBarMetrics> =>
  page.evaluate(() => {
    const getBox = (selector: string): LayoutBox => {
      const element = document.querySelector(selector)
      if (!element) throw new Error(`Missing title bar element: ${selector}`)
      const { left, right, width } = element.getBoundingClientRect()
      return { left, right, width, display: getComputedStyle(element).display }
    }

    const pathElement = document.querySelector(
      '.title-bar .title > span > span:not(.filename):not(.save-dot)'
    )

    return {
      viewportWidth: window.innerWidth,
      titleBar: getBox('.title-bar'),
      menu: getBox('[data-testid="titlebar-menu"]'),
      document: getBox('[data-testid="titlebar-document"]'),
      stats: getBox('[data-testid="titlebar-stats"]'),
      controls: getBox('[data-testid="titlebar-controls"]'),
      pathDisplay: pathElement ? getComputedStyle(pathElement).display : 'missing'
    }
  })

test.describe('Inkiva title bar responsive layout', () => {
  test.skip(process.platform === 'darwin', 'macOS uses the native system menu and controls')

  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown(
      '# Title bar responsive contract\n\nKeep the chrome stable.\n'
    )
    app = launched.app
    page = launched.page
    await expect(page.locator('.title-bar')).toBeVisible()
    await expect(page.getByTestId('titlebar-menu')).toBeVisible()
    await expect(page.getByTestId('titlebar-controls')).toBeVisible()
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('keeps menu and document content clear of window controls at every supported width', async() => {
    for (const width of SUPPORTED_WIDTHS) {
      await setWindowSize(app, width)
      await waitForViewport(page, width)

      const metrics = await titleBarMetrics(page)
      expect(metrics.viewportWidth).toBe(width)
      expect(Math.round(metrics.titleBar.width)).toBe(width)
      expect(Math.round(metrics.controls.width)).toBe(138)
      expect(Math.round(metrics.controls.right)).toBe(width)
      expect(metrics.menu.right).toBeLessThanOrEqual(metrics.controls.left + 1)

      if (width <= 600) {
        expect(metrics.document.display).toBe('none')
      } else {
        expect(metrics.document.display).not.toBe('none')
        const documentLimit =
          metrics.stats.display === 'none' ? metrics.controls.left : metrics.stats.left
        expect(metrics.document.right).toBeLessThanOrEqual(documentLimit + 1)
      }

      if (width <= 820) expect(metrics.stats.display).toBe('none')
      else expect(metrics.stats.display).not.toBe('none')

      if (width <= 1000) expect(metrics.pathDisplay).toBe('none')
      else expect(metrics.pathDisplay).not.toBe('none')
    }
  })
})
