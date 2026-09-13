import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(__dirname, '../../../../..')
const visualSpec = path.join(repoRoot, 'packages/desktop/test/e2e/visual-regression.spec.ts')

describe('UI-14 visual regression contract', () => {
  it('defines the approved core states and responsive viewports', () => {
    const source = fs.readFileSync(visualSpec, 'utf8')
    for (const state of ['light-main-window','dark-main-window','paper-main-window','sidebar-files','sidebar-search','sidebar-toc','preferences','command-palette','dialog','toast','empty-state','markdown-kitchen-sink','diagram-kitchen-sink']) expect(source).toContain(state)
    for (const width of [550, 768, 1280]) expect(source).toContain(`width: ${width}`)
  })
  it('forces reduced motion and deterministic screenshot output', () => {
    const source = fs.readFileSync(visualSpec, 'utf8')
    expect(source).toMatch(/emulateMedia\\(\\{\\s*reducedMotion:\\s*['"]reduce['"]/)
    expect(source).toMatch(/toHaveScreenshot\\(/)
    expect(source).toContain("animations: 'disabled'")
    expect(source).toContain("caret: 'hide'")
  })
})
