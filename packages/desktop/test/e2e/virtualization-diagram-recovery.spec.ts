import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'

import {
  clearRendererErrors,
  enterSourceMode,
  exitSourceMode,
  expectNoRendererErrors,
  launchWithMarkdown
} from './helpers'

const FENCE = '\x60\x60\x60'

const diagram = (index: number): string => [
  FENCE + 'mermaid',
  'graph TD',
  '  A' + index + '[阶段 ' + index + ' 开始] --> B' + index + '{是否继续}',
  '  B' + index + ' -->|是| C' + index + '[执行步骤]',
  '  C' + index + ' --> D' + index + '[阶段 ' + index + ' 完成]',
  FENCE
].join('\n')

const buildDiagramDocument = (): string => {
  const parts: string[] = ['# Diagram virtualization regression']
  for (let section = 1; section <= 5; section++) {
    parts.push('## Diagram Section ' + section)
    for (let filler = 0; filler < 55; filler++) {
      parts.push(
        'section ' + section + ' filler ' + filler + ' ' + 'diagram-scroll-anchor '.repeat(2)
      )
    }
    parts.push(diagram(section))
  }
  parts.push('## Document End', 'end marker')
  return parts.join('\n\n') + '\n'
}

const readScrollTop = (page: Page): Promise<number> =>
  page.locator('.editor-component').evaluate((node) => (node as HTMLElement).scrollTop)

const waitForScrollSettled = async(page: Page): Promise<number> => {
  let previous = await readScrollTop(page)
  let stableSamples = 0
  const deadline = Date.now() + 6000

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50))
    const current = await readScrollTop(page)
    if (Math.abs(current - previous) <= 2) stableSamples += 1
    else stableSamples = 0
    previous = current
    if (stableSamples >= 4) return current
  }
  throw new Error('editor scrollTop did not settle after diagram/height correction')
}

const setSourceValue = async(page: Page, value: string): Promise<void> => {
  await page.evaluate((markdown) => {
    const root = document.querySelector('.source-code .CodeMirror') as
      | (Element & {
        CodeMirror?: {
          setValue(value: string): void
          getValue(): string
        }
      })
      | null
    if (!root?.CodeMirror) throw new Error('CodeMirror source editor is unavailable')
    root.CodeMirror.setValue(markdown)
  }, value)
}

test.describe('@virtualization-core virtualization diagram scroll + invalid-source recovery', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeEach(async() => {
    const launched = await launchWithMarkdown(buildDiagramDocument(), {
      filename: 'virtualization-diagram-recovery.md',
      suppressErrorDialog: true,
      waitForEditorTimeout: 30000
    })
    app = launched.app
    page = launched.page
    await clearRendererErrors(app)
  })

  test.afterEach(async() => {
    if (app) await app.close()
  })

  test('SCR-012/SCR-013/DIA-006: crossing multiple Mermaid regions never rolls the viewport back to an earlier diagram', async() => {
    const editor = page.locator('.editor-component')
    let previousSettled = 0

    for (const ratio of [0.16, 0.34, 0.52, 0.7, 0.88]) {
      const requested = await editor.evaluate((node, targetRatio) => {
        const surface = node as HTMLElement
        surface.scrollTop = Math.max(
          0,
          (surface.scrollHeight - surface.clientHeight) * targetRatio
        )
        surface.dispatchEvent(new Event('scroll'))
        return surface.scrollTop
      }, ratio)

      const settled = await waitForScrollSettled(page)
      expect(settled).toBeGreaterThan(previousSettled + 20)
      expect(settled).toBeGreaterThanOrEqual(Math.max(0, requested - 32))
      previousSettled = settled

      await expect
        .poll(() => page.locator('.mu-container > :not(.mu-virtual-render-placeholder)').count())
        .toBeGreaterThan(0)
    }

    await expectNoRendererErrors(app)
  })

  test('DIA-008/DIA-009/SOURCE-INVALID-003: temporarily invalid Mermaid source is isolated and becomes renderable again after repair', async() => {
    const valid = [
      '# Mermaid recovery',
      '',
      FENCE + 'mermaid',
      'graph TD',
      '  A[开始] --> B[完成]',
      FENCE,
      '',
      'after diagram'
    ].join('\n')
    const invalid = [
      '# Mermaid recovery',
      '',
      FENCE + 'mermaid',
      'graph TD',
      '  A[开始] -->',
      FENCE,
      '',
      'after diagram'
    ].join('\n')

    await enterSourceMode(page, app)
    await setSourceValue(page, invalid)
    await exitSourceMode(page, app)

    await expect(page.locator('.editor-component')).toContainText('after diagram')
    await expectNoRendererErrors(app)

    await enterSourceMode(page, app)
    await setSourceValue(page, valid)
    await exitSourceMode(page, app)
    await expect(page.locator('.mu-diagram-preview svg').first()).toBeVisible({ timeout: 15000 })
    await expect(page.locator('.editor-component')).toContainText('after diagram')
    await expectNoRendererErrors(app)
  })
})
