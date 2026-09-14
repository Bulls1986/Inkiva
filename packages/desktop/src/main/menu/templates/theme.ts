import { type MenuItemConstructorOptions } from 'electron'
import * as actions from '../actions/theme'
import { t } from '../../i18n'
import type Preference from '../../preferences'

const THEMES: ReadonlyArray<readonly [string, string]> = [
  ['Inkiva Light', 'light'],
  ['Inkiva Dark', 'dark'],
  ['Inkiva Paper', 'paper']
]

export default function(userPreference: Preference): MenuItemConstructorOptions {
  const preferences = userPreference.getAll() as { theme?: string; followSystemTheme?: boolean }
  const { theme, followSystemTheme } = preferences
  const isThemeSelectionEnabled = !followSystemTheme

  const themeRadio = ([labelKey, id]: readonly [string, string]): MenuItemConstructorOptions => ({
    label: labelKey,
    type: 'radio',
    id,
    enabled: isThemeSelectionEnabled,
    checked: theme === id,
    click() {
      actions.selectTheme(id)
    }
  })

  const submenu: MenuItemConstructorOptions[] = [
    // Follow System Theme
    {
      label: t('preferences.theme.followSystemTheme'),
      type: 'checkbox',
      id: 'follow-system-theme',
      checked: !!followSystemTheme,
      click(menuItem) {
        actions.setFollowSystemTheme(menuItem.checked)
      }
    }
  ]

  if (!isThemeSelectionEnabled) {
    submenu.push({
      label: t('menu.theme.followThemDisabled'),
      enabled: false
    })
  }

  submenu.push({ type: 'separator' }, ...THEMES.map(themeRadio))

  return {
    label: t('menu.theme.theme'),
    id: 'themeMenu',
    submenu
  }
}
