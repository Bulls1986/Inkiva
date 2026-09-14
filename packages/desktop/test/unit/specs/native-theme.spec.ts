import { describe, it, expect } from 'vitest'
import { getNativeThemeSource, isDarkApplicationTheme } from 'main_renderer/app/nativeTheme'
import { isDarkThemeId } from 'common/theme'

describe('Native theme source', () => {
  it('follows the system when configured to do so', () => {
    expect(getNativeThemeSource({ followSystemTheme: true, theme: 'dark' })).to.equal('system')
    expect(getNativeThemeSource({ followSystemTheme: true, theme: 'light' })).to.equal('system')
  })

  it('uses dark native menus for Inkiva Dark only', () => {
    expect(isDarkThemeId('dark')).to.equal(true)
    expect(isDarkApplicationTheme('dark')).to.equal(true)
    expect(getNativeThemeSource({ followSystemTheme: false, theme: 'dark' })).to.equal('dark')
  })

  it('uses light native menus for light MarkText themes', () => {
    for (const theme of ['light', 'paper', 'unknown-theme']) {
      expect(isDarkApplicationTheme(theme)).to.equal(false)
      expect(getNativeThemeSource({ followSystemTheme: false, theme })).to.equal('light')
    }
  })
})
