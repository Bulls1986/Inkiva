export type ApplicationAppearance = 'light' | 'dark' | 'paper'

export const isDarkThemeId = (theme: unknown): theme is string => {
  return theme === 'dark'
}

export const getApplicationAppearance = (theme: unknown): ApplicationAppearance => {
  if (theme === 'paper') return 'paper'
  return isDarkThemeId(theme) ? 'dark' : 'light'
}

// Canonical appearance backgrounds used by the main process before the renderer
// loads. Keeping this bridge small prevents a document theme from recolouring
// the application chrome or reintroducing retired appearance IDs.
const themeBackgroundColors: ReadonlyMap<string, string> = new Map([
  ['dark', '#1b1d21'],
  ['paper', '#fffdf8']
])

const DARK_FALLBACK_BACKGROUND = '#282828'
const LIGHT_FALLBACK_BACKGROUND = '#ffffff'

/**
 * Background colour to paint a freshly-created window before the renderer
 * loads, so the window matches the active appearance instead of flashing white
 * (#3957). Unknown values intentionally use the Light fallback.
 */
export const getThemeBackgroundColor = (theme: string | undefined): string => {
  const exact = typeof theme === 'string' ? themeBackgroundColors.get(theme) : undefined
  if (exact) return exact
  return isDarkThemeId(theme) ? DARK_FALLBACK_BACKGROUND : LIGHT_FALLBACK_BACKGROUND
}
