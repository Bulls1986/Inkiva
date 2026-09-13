import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const renderer = resolve(here, '../../../src/renderer/src')
const localeDir = resolve(here, '../../../static/locales')

const read = (relativePath: string): string =>
  readFileSync(resolve(renderer, relativePath), 'utf8')

describe('Inkiva UI-08 empty and loading state contract', () => {
  it('provides a restrained welcome surface with real file actions', () => {
    const recent = read('components/recent/index.vue')

    expect(recent).toContain('data-testid="welcome-surface"')
    expect(recent).toContain('welcome-title')
    expect(recent).toContain('data-testid="welcome-new-file"')
    expect(recent).toContain('data-testid="welcome-open-file"')
    expect(recent).toContain('data-testid="welcome-quick-open"')
    expect(recent).toContain("'mt::cmd-open-file'")
    expect(recent).toContain("'cmd::execute'")
    expect(recent).toContain("'file.quick-open'")

    for (const token of [
      '--surface-editor',
      '--surface-chrome',
      '--text-primary',
      '--text-secondary',
      '--text-tertiary',
      '--border-default',
      '--radius-md',
      '--focus-ring'
    ]) {
      expect(recent).toContain(`var(${token}`)
    }

    expect(recent).not.toContain('var(--editorBgColor)')
    expect(recent).not.toContain('var(--editorColor)')
    expect(recent).not.toContain('linear-gradient')
  })

  it('uses a small token-based loading rhythm and respects reduced motion', () => {
    const loading = read('components/loading/index.vue')

    expect(loading).toContain('role="status"')
    expect(loading).toContain('aria-live="polite"')
    expect(loading).toMatch(/size:\s*4/)
    expect(loading).toMatch(/delay:\s*500/)
    expect(loading).toContain('opacity:')
    expect(loading).toContain('translateY(-2px)')
    expect(loading).toContain('var(--motion-loading')
    expect(loading).toContain('prefers-reduced-motion: reduce')
    expect(loading).not.toContain('var(--themeColor)')
    expect(loading).not.toContain('var(--highlightColor)')
    expect(loading).not.toContain('var(--selectionColor)')
    expect(loading).not.toContain('@keyframes kiri')
    expect(loading).not.toContain('@keyframes kanan')

    const tokens = read('assets/styles/design-tokens.css')
    expect(tokens).toContain('--motion-loading: 900ms;')
    expect(tokens).toContain('--motion-loading: 0ms;')
  })

  it('keeps the pre-mount shell on the same three-dot loading language', () => {
    const indexHtml = readFileSync(resolve(renderer, '../index.html'), 'utf8')
    const preload = readFileSync(resolve(here, '../../../src/preload/index.ts'), 'utf8')
    const initialAppearance = readFileSync(
      resolve(here, '../../../src/renderer/public/initial-appearance.js'),
      'utf8'
    )

    expect(indexHtml).toContain('inkiva-bootstrap__dot')
    expect(indexHtml).toContain('inkiva-bootstrap-dot')
    expect(indexHtml).toContain('prefers-reduced-motion: reduce')
    expect(indexHtml).not.toContain('inkiva-bootstrap-spin')
    expect(indexHtml).not.toContain('transform: rotate(360deg)')
    expect(indexHtml).toContain('<script src="/initial-appearance.js"></script>')
    expect(initialAppearance).toContain("get('theme')")
    expect(initialAppearance).toContain("appearance === 'dark' || appearance === 'paper'")
    expect(initialAppearance).toContain('data-inkiva-appearance')
    expect(preload).toContain('queueMicrotask(retry)')
    expect(preload).toContain('globalThis.setTimeout(retry, 0)')
  })

  it('ships welcome copy for every supported locale', () => {
    for (const file of readdirSync(localeDir).filter((entry) => entry.endsWith('.json'))) {
      const locale = JSON.parse(readFileSync(resolve(localeDir, file), 'utf8')) as {
        recent?: Record<string, string>
      }

      expect(locale.recent?.welcomeTitle, file).toBeTruthy()
      expect(locale.recent?.welcomeDescription, file).toBeTruthy()
      expect(locale.recent?.openFile, file).toBeTruthy()
      expect(locale.recent?.quickOpen, file).toContain('{shortcut}')
    }
  })
})
