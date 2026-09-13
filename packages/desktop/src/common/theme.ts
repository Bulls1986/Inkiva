export type ApplicationAppearance = 'light' | 'dark' | 'paper'

export const isDarkThemeId = (theme: unknown): theme is string => {
  return theme === 'dark' || theme === 'inkiva-dark'
}

export const getApplicationAppearance = (theme: unknown): ApplicationAppearance => {
  if (theme === 'paper' || theme === 'inkiva-paper') return 'paper'
  return isDarkThemeId(theme) ? 'dark' : 'light'
}

// Each built-in theme's editor background colour, kept in sync with the
// `--editorBgColor` of the matching renderer theme (renderer/src/assets/themes/
// *.theme.css; the default light theme lives in styles/index.css and is handled
// by the white fallback below). The main process paints a freshly-created window
// with this colour before the renderer loads, so a dark theme no longer flashes
// white on launch (#3957).
const themeBackgroundColors: ReadonlyMap<string, string> = new Map([
  ['dark', '#1b1d21'],
  ['paper', '#fffdf8']
])

const DARK_FALLBACK_BACKGROUND = '#282828'
const LIGHT_FALLBACK_BACKGROUND = '#ffffff'

/**
 * Background colour to paint a freshly-created window before the renderer
 * loads, so the window matches the active theme instead of flashing white
 * (#3957). Falls back by dark/light classification for any theme without an
 * explicit colour (e.g. the default light theme or a future custom theme).
 */
export const getThemeBackgroundColor = (theme: string | undefined): string => {
  const exact = typeof theme === 'string' ? themeBackgroundColors.get(theme) : undefined
  if (exact) return exact
  return isDarkThemeId(theme) ? DARK_FALLBACK_BACKGROUND : LIGHT_FALLBACK_BACKGROUND
}
