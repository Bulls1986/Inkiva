export const PATH_SEPARATOR: string = window.path.sep

export const THEME_STYLE_ID = 'ag-theme'
export const APPLICATION_STYLE_ID = 'inkiva-application-style'
export const COMMON_STYLE_ID = 'ag-common-style'
export const EDITOR_WIDTH_STYLE_ID = 'editor-width'
export const CUSTOM_STYLE_ID = 'custom-styles'
export const APPLICATION_APPEARANCE_ATTRIBUTE = 'data-inkiva-appearance'

export const DEFAULT_EDITOR_FONT_FAMILY =
  '"Open Sans", "Clear Sans", "Helvetica Neue", Helvetica, Arial, sans-serif, Segoe UI Emoji, Apple Color Emoji, "Noto Color Emoji"'
export const DEFAULT_CODE_FONT_FAMILY =
  '"DejaVu Sans Mono", "Source Code Pro", "Droid Sans Mono", monospace'
export const DEFAULT_STYLE = Object.freeze({
  codeFontFamily: DEFAULT_CODE_FONT_FAMILY,
  codeFontSize: '14px',
  hideScrollbar: false,
  theme: 'light'
})
