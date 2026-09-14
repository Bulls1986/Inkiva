export type ApplicationAppearance = 'light' | 'dark' | 'paper'

const THEME_PREFERENCE_KEYS = ['theme', 'lightModeTheme', 'darkModeTheme'] as const

/**
 * Convert persisted theme values into one of Inkiva's supported application
 * appearances. Retired values are intentionally not rendered as themes; they
 * fall back to Light so the Preferences page always has a selected option.
 */
export const normalizeApplicationTheme = (theme: unknown): ApplicationAppearance => {
  if (theme === 'dark') return 'dark'
  if (theme === 'paper') return 'paper'
  return 'light'
}

/**
 * Normalize all application-theme fields while preserving the shape and
 * unrelated values of a settings object.
 */
export const normalizeApplicationThemeSettings = <T extends object>(settings: T): T => {
  const normalized = { ...settings } as Record<string, unknown>
  for (const key of THEME_PREFERENCE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(normalized, key)) {
      normalized[key] = normalizeApplicationTheme(normalized[key])
    }
  }
  return normalized as T
}

export const isDarkThemeId = (theme: unknown): theme is string => {
  return normalizeApplicationTheme(theme) === 'dark'
}

export const getApplicationAppearance = (theme: unknown): ApplicationAppearance => {
  return normalizeApplicationTheme(theme)
}

/**
 * Resolve the appearance encoded in a renderer URL. The preload uses this
 * before Vue mounts so the inline loading shell can use the correct surface.
 */
export const getInitialAppearanceFromSearch = (search: string): ApplicationAppearance => {
  return normalizeApplicationTheme(new URLSearchParams(search).get('theme'))
}

// Canonical appearance backgrounds used by the main process before the renderer
// loads. Keeping this bridge small prevents a document theme from recolouring
// the application chrome or reintroducing retired appearance IDs.
const themeBackgroundColors: ReadonlyMap<string, string> = new Map([
  ['dark', '#1b1d21'],
  ['paper', '#f8f8f6']
])

const LIGHT_FALLBACK_BACKGROUND = '#ffffff'

/**
 * Background colour to paint a freshly-created window before the renderer
 * loads, so the window matches the active appearance instead of flashing white
 * (#3957). Unknown values intentionally use the Light fallback.
 */
export const getThemeBackgroundColor = (theme: string | undefined): string => {
  const exact = themeBackgroundColors.get(normalizeApplicationTheme(theme))
  if (exact) return exact
  return LIGHT_FALLBACK_BACKGROUND
}
