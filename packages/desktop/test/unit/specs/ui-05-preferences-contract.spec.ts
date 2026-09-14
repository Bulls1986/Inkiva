import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const renderer = resolve(here, '../../../src/renderer/src')

const read = (relativePath: string): string =>
  readFileSync(resolve(renderer, relativePath), 'utf8')

describe('Inkiva UI-05 preferences contract', () => {
  it('keeps the 220px preferences layout and uses a quiet semantic sidebar state', () => {
    const page = read('pages/preference.vue')
    const sidebar = read('prefComponents/sideBar/index.vue')

    expect(page).toContain('--prefSideBarWidth: 220px;')
    expect(sidebar).toContain('width: var(--prefSideBarWidth);')
    expect(sidebar).toContain('background: var(--color-accent-soft);')
    expect(sidebar).toContain('color: var(--text-primary);')
    expect(sidebar).toContain('color: var(--color-accent);')
    expect(sidebar).toContain('border-radius: var(--radius-md);')
    expect(sidebar).not.toContain('&::before')
    expect(sidebar).not.toContain('var(--highlightThemeColor)')
    expect(sidebar).not.toContain('transition: all')
  })

  it('expresses preferences as section title, description, and control rhythm without cards', () => {
    const page = read('pages/preference.vue')
    const compound = read('prefComponents/common/compound/index.vue')
    const controls = [
      'prefComponents/common/bool/index.vue',
      'prefComponents/common/select/index.vue',
      'prefComponents/common/range/index.vue',
      'prefComponents/common/textBox/index.vue',
      'prefComponents/common/fontTextBox/index.vue'
    ].map(read).join('\n')

    expect(page).toContain('color: var(--text-primary);')
    expect(page).toContain('background: var(--surface-editor);')
    expect(compound).toContain('margin-bottom: var(--space-8);')
    expect(compound).toContain('gap: var(--space-3);')
    expect(compound).toContain('color: var(--text-primary);')
    expect(compound).not.toContain('box-shadow:')
    expect(compound).not.toContain('border:')
    expect(controls).toContain('color: var(--text-secondary);')
    expect(controls).toContain('transition:')
    expect(controls).toContain('var(--motion-normal)')
    expect(controls).not.toContain('transition: all')
  })

  it('uses shared motion tokens for preferences chrome and controls', () => {
    const files = [
      'pages/preference.vue',
      'prefComponents/sideBar/index.vue',
      'prefComponents/common/titlebar.vue',
      'prefComponents/common/compound/index.vue',
      'prefComponents/common/bool/index.vue',
      'prefComponents/common/select/index.vue',
      'prefComponents/common/range/index.vue',
      'prefComponents/common/textBox/index.vue',
      'prefComponents/common/fontTextBox/index.vue'
    ].map(read)

    for (const source of files) {
      expect(source).not.toContain('transition: all')
    }

    const source = files.join('\n')
    expect(source).toContain('var(--motion-fast)')
    expect(source).toContain('var(--motion-normal)')
    expect(source).toContain('var(--motion-slow)')
  })
})
