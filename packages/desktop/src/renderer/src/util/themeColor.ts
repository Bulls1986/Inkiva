import darkTheme from '../assets/themes/dark.theme.css?inline'
import darkPrismTheme from '../assets/themes/prismjs/dark.theme.css?inline'

/**
 * Inkiva Dark application theme and its matching Prism syntax palette.
 * Light and Paper use the base stylesheet plus the appearance tokens.
 */
export const dark = (): string => {
  return darkTheme + '\n' + darkPrismTheme
}
