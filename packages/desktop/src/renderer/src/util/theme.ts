import {
  THEME_STYLE_ID,
  APPLICATION_STYLE_ID,
  APPLICATION_APPEARANCE_ATTRIBUTE,
  COMMON_STYLE_ID,
  CUSTOM_STYLE_ID,
  EDITOR_WIDTH_STYLE_ID,
  DEFAULT_CODE_FONT_FAMILY
} from '../config'
import designTokens from '../assets/styles/design-tokens.css?inline'
import { dark } from './themeColor'
import { getApplicationAppearance } from 'common/theme'
import { isLinux } from './index'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ORIGINAL_THEME = '#409EFF'

const patchTheme = (css: string): string => {
  return `@media not print {\n${css}\n}`
}

const getEmojiPickerPatch = (): string => {
  return isLinux
    ? '.mu-emoji-picker section .emoji-wrapper .item span { font-family: sans-serif, "Noto Color Emoji"; }'
    : ''
}

const STYLE_ORDER = [
  THEME_STYLE_ID,
  APPLICATION_STYLE_ID,
  COMMON_STYLE_ID,
  EDITOR_WIDTH_STYLE_ID,
  CUSTOM_STYLE_ID
] as const

const reorderStyleSheets = (): void => {
  for (const id of STYLE_ORDER) {
    const style = document.head.querySelector(`#${id}`)
    if (style) document.head.appendChild(style)
  }
}

export const addApplicationStyle = (): void => {
  let styleEle = document.querySelector(`#${APPLICATION_STYLE_ID}`) as HTMLStyleElement | null
  if (!styleEle) {
    styleEle = document.createElement('style')
    styleEle.id = APPLICATION_STYLE_ID
    document.head.appendChild(styleEle)
  }
  styleEle.innerHTML = designTokens
  reorderStyleSheets()
}

export const addThemeStyle = (theme: string): void => {
  const appearance = getApplicationAppearance(theme)
  let themeStyleEle = document.querySelector(`#${THEME_STYLE_ID}`) as HTMLStyleElement | null
  if (!themeStyleEle) {
    themeStyleEle = document.createElement('style')
    themeStyleEle.id = THEME_STYLE_ID
    document.head.appendChild(themeStyleEle)
  }

  themeStyleEle.innerHTML = ''

  if (appearance === 'dark') {
    themeStyleEle.innerHTML = patchTheme(dark())
  } else if (appearance === 'paper') {
    themeStyleEle.innerHTML = patchTheme(
      `:root {
  --editorBgColor: #fffdf8;
  --editorColor: #2e2b27;
  --editorColor80: #2e2b27;
  --editorColor60: #6e665b;
  --editorColor50: #918678;
  --editorColor40: #a99d8e;
  --editorColor30: #b8aea0;
  --editorColor10: #eee8dc;
  --editorColor04: #f7f4ec;
  --iconColor: #82786b;
  --sideBarBgColor: #f7f4ec;
  --sideBarColor: #4d463e;
  --sideBarTitleColor: #2e2b27;
  --sideBarTextColor: #82786b;
  --sideBarItemHoverBgColor: #f0ece3;
  --itemBgColor: #fffdf8;
  --floatBgColor: #fffdf8;
  --floatFontColor: #2e2b27;
  --floatHoverColor: #f0ece3;
  --floatBorderColor: #e9e2d6;
  --codeBgColor: #f0ece3;
  --codeBlockBgColor: #f7f4ec;
  --inputBgColor: #f7f4ec;
  --themeColor: #0b63e5;
  --blockquoteBorderColor: rgba(11, 99, 229, 0.5);
  --linkColor: #0b63e5;
  --headingColor: #2e2b27;
  --h1Color: #2e2b27;
  --h2Color: #2e2b27;
  --h3Color: #2e2b27;
  --h4Color: #2e2b27;
  --h5Color: #6e665b;
  --h6Color: #6e665b;
}`
    )
  } else {
    themeStyleEle.innerHTML = patchTheme(
      ':root {\n  --link-color: var(--linkColor);\n  --blockquote-border-color: var(--blockquoteBorderColor);\n}'
    )
  }

  // workaround: use dark icons
  document.body.classList.remove('dark')
  if (appearance === 'dark') {
    document.body.classList.add('dark')
  }
  document.documentElement.setAttribute(APPLICATION_APPEARANCE_ATTRIBUTE, appearance)
  addApplicationStyle()

  // change CodeMirror theme
  const cm = document.querySelector('.CodeMirror')
  if (cm) {
    cm.classList.remove('cm-s-default')
    cm.classList.add(appearance === 'dark' ? 'cm-s-railscasts' : 'cm-s-default')
  }

  reorderStyleSheets()
}

export const setEditorWidth = (value: string): void => {
  let result = ''
  if (value && /^[0-9]+(?:ch|px|%)$/.test(value)) {
    // Add 100px for the container's horizontal padding. Set both the legacy
    // camelCase var (source mode) and the kebab-case var the active
    // @muyajs/core engine reads for `.mu-container` max-width (issue #4828).
    const width = `calc(100px + ${value})`
    result = `:root { --editorAreaWidth: ${width}; --editor-area-width: ${width}; }`
  }
  let styleEle = document.querySelector(`#${EDITOR_WIDTH_STYLE_ID}`) as HTMLStyleElement | null
  if (!styleEle) {
    styleEle = document.createElement('style')
    styleEle.setAttribute('id', EDITOR_WIDTH_STYLE_ID)
    document.head.appendChild(styleEle)
  }

  styleEle.innerHTML = result
  reorderStyleSheets()
}

export interface CommonStyleOptions {
  codeFontFamily: string
  codeFontSize: number | string
  hideScrollbar?: boolean
  [key: string]: unknown
}

export const addCommonStyle = (options: CommonStyleOptions): void => {
  const { codeFontFamily, codeFontSize, hideScrollbar } = options
  let sheet = document.querySelector(`#${COMMON_STYLE_ID}`) as HTMLStyleElement | null
  if (!sheet) {
    sheet = document.createElement('style')
    sheet.id = COMMON_STYLE_ID
    document.head.appendChild(sheet)
  }

  let scrollbarStyle = ''
  if (hideScrollbar) {
    scrollbarStyle = '::-webkit-scrollbar {display: none;}'
  }

  sheet.innerHTML = `${scrollbarStyle}
.CodeMirror {
font-family: ${codeFontFamily}, ${DEFAULT_CODE_FONT_FAMILY};
font-size: ${codeFontSize}px;
}

${getEmojiPickerPatch()}
`
  reorderStyleSheets()
}

export interface CustomStyleOptions {
  customCss?: string
  [key: string]: unknown
}

export const addCustomStyle = (options: CustomStyleOptions): void => {
  const { customCss } = options
  let customStyleEle = document.querySelector(`#${CUSTOM_STYLE_ID}`) as HTMLStyleElement | null
  if (!customStyleEle && !customCss) return
  if (!customStyleEle) {
    customStyleEle = document.createElement('style')
    customStyleEle.id = CUSTOM_STYLE_ID
    document.head.appendChild(customStyleEle)
  }
  customStyleEle.innerHTML = customCss ?? ''
  reorderStyleSheets()
}

export interface AddStylesOptions extends CommonStyleOptions {
  theme: string
}

// Append common sheet and theme at the end of head - order is important.
export const addStyles = (options: AddStylesOptions): void => {
  const { theme } = options
  addThemeStyle(theme)
  addCommonStyle(options)
}
