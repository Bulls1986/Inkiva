import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// #4774: empty-state actions must use the same contrast-controlled primary
// pairing as the rest of the application. Keep this as a rendered-token
// contract so removing legacy themes cannot silently remove accessibility
// coverage.
const __dirname = dirname(fileURLToPath(import.meta.url))
const RENDERER = resolve(__dirname, '../../../src/renderer/src')
const BASE_CSS = resolve(RENDERER, 'assets/styles/index.css')
const DESIGN_TOKENS_CSS = resolve(RENDERER, 'assets/styles/design-tokens.css')
const DARK_THEME_CSS = resolve(RENDERER, 'assets/themes/dark.theme.css')

type Rgb = [number, number, number]

const read = (path: string): string => readFileSync(path, 'utf8')

const parseVars = (css: string): Record<string, string> => {
  const vars: Record<string, string> = {}
  const re = /(--[\w-]+)\s*:\s*([^;]+);/g
  let match: RegExpExecArray | null
  while ((match = re.exec(css))) vars[match[1]] = match[2].trim()
  return vars
}

const ruleBody = (css: string, selector: string): string => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`))?.[1] ?? ''
}

const resolveVar = (
  name: string,
  vars: Record<string, string>,
  seen = new Set<string>()
): string => {
  if (seen.has(name)) throw new Error(`circular custom property reference: ${name}`)
  const value = vars[name]
  if (!value) throw new Error(`unresolved custom property: ${name}`)

  const nextSeen = new Set(seen).add(name)
  return value.replace(
    /var\(\s*(--[\w-]+)\s*(?:,\s*([^()]+))?\s*\)/g,
    (_, reference: string, fallback?: string) => {
      if (vars[reference]) return resolveVar(reference, vars, nextSeen)
      if (fallback) return fallback.trim()
      throw new Error(`unresolved custom property: ${reference}`)
    }
  )
}

const toRgb = (raw: string): Rgb => {
  const value = raw.trim()
  const match = value.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  if (!match) throw new Error(`expected an opaque hex colour, received: ${value}`)

  const hex = match[1].length === 3
    ? match[1].split('').map((digit) => digit + digit).join('')
    : match[1]
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16)
  ]
}

const relativeLuminance = ([r, g, b]: Rgb): number => {
  const linear = (channel: number): number => {
    const srgb = channel / 255
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

const contrast = (foreground: Rgb, background: Rgb): number => {
  const foregroundLuminance = relativeLuminance(foreground)
  const backgroundLuminance = relativeLuminance(background)
  const light = Math.max(foregroundLuminance, backgroundLuminance)
  const dark = Math.min(foregroundLuminance, backgroundLuminance)
  return (light + 0.05) / (dark + 0.05)
}

const extractPrimaryPairing = (componentPath: string): void => {
  const css = read(componentPath)
  expect(css).toMatch(/background-color:\s*var\(--buttonPrimaryBgColor\);/)
  expect(css).toMatch(/color:\s*var\(--buttonPrimaryFontColor\);/)
  expect(css).toMatch(/background-color:\s*var\(--buttonPrimaryBgColorHover\);/)
  expect(css).toMatch(/color:\s*var\(--buttonPrimaryFontColorHover\);/)
}

const baseVars = parseVars(read(BASE_CSS))
const tokenCss = read(DESIGN_TOKENS_CSS)
const tokenRootVars = parseVars(ruleBody(tokenCss, ':root'))
const appearanceTokenVars = {
  light: tokenRootVars,
  dark: {
    ...tokenRootVars,
    ...parseVars(ruleBody(tokenCss, ":root[data-inkiva-appearance='dark']"))
  },
  paper: {
    ...tokenRootVars,
    ...parseVars(ruleBody(tokenCss, ":root[data-inkiva-appearance='paper']"))
  }
} as const
const darkThemeVars = parseVars(read(DARK_THEME_CSS))

const COMPONENTS = [
  'components/sideBar/tree.vue',
  'components/recent/index.vue',
  'components/sideBar/search.vue'
] as const

describe('empty-state button contrast (#4774)', () => {
  it('uses the shared primary pairing in every empty-state action', () => {
    for (const relativePath of COMPONENTS) {
      extractPrimaryPairing(resolve(RENDERER, relativePath))
    }
  })

  it('keeps normal, hover, and active primary text at WCAG AA contrast', () => {
    const states = [
      '--buttonPrimaryBgColor',
      '--buttonPrimaryBgColorHover',
      '--buttonPrimaryBgColorActive'
    ] as const

    for (const [appearance, tokens] of Object.entries(appearanceTokenVars)) {
      const vars = {
        ...baseVars,
        ...(appearance === 'dark' ? darkThemeVars : {}),
        ...tokens
      }
      const foreground = toRgb(resolveVar('--buttonPrimaryFontColor', vars))

      for (const state of states) {
        const background = toRgb(resolveVar(state, vars))
        expect(
          contrast(foreground, background),
          `${appearance} ${state} must provide at least 4.5:1 contrast`
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})
