import fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const visualSpec = resolve(here, '../../../e2e/visual-regression.spec.ts')

describe('UI-14 visual regression contract', () => {
  it('defines the approved core states and responsive viewports', () => {
    const source = fs.readFileSync(visualSpec, 'utf8')
    const states = [
      'light-main-window', 'dark-main-window', 'paper-main-window',
      'sidebar-files', 'sidebar-search', 'sidebar-toc', 'preferences',
      'command-palette', 'dialog', 'toast', 'empty-state',
      'markdown-kitchen-sink', 'diagram-kitchen-sink'
    ]

    for (const state of states) expect(source).toContain(state)
    for (const width of [550, 768, 1280]) {
      expect(source).toContain(`width: ${width}`)
    }
  })

  it('forces reduced motion and deterministic screenshot output', () => {
    const source = fs.readFileSync(visualSpec, 'utf8')
    expect(source).toMatch(
      /emulateMedia\(\{\s*reducedMotion:\s*['"]reduce['"]/
    )
    expect(source).toMatch(/toHaveScreenshot\(/)
    expect(source).toContain("animations: 'disabled'")
    expect(source).toContain("caret: 'hide'")
  })
})
