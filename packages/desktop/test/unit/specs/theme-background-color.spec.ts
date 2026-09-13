import { describe, it, expect } from 'vitest'
import { getThemeBackgroundColor } from 'common/theme'

// #3957: a dark theme used to flash white on launch. The application now has
// three canonical appearances, so the launch background only needs to follow
// those IDs.
describe('theme launch background colour (#3957)', () => {
  it('never returns white for a dark theme (no white flash on launch)', () => {
    expect(getThemeBackgroundColor('dark').toLowerCase()).not.toBe('#ffffff')
  })

  it('maps Inkiva Dark and Paper to their editor backgrounds', () => {
    expect(getThemeBackgroundColor('dark')).toBe('#1b1d21')
    expect(getThemeBackgroundColor('paper')).toBe('#fffdf8')
  })

  it('uses white for Inkiva Light and unknown themes', () => {
    for (const theme of ['light', undefined, 'no-such-theme']) {
      expect(getThemeBackgroundColor(theme as string | undefined)).toBe('#ffffff')
    }
  })
})
