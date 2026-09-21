import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePreferencesStore } from '@/store/preferences'

describe('preferences hydration contract', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('preserves an explicit Open Sans editor font choice', () => {
    const preferences = usePreferencesStore()

    preferences.SET_USER_PREFERENCE({ editorFontFamily: 'Open Sans' })

    expect(preferences.editorFontFamily).toBe('Open Sans')
  })

  it.each([
    ['codeFontFamily', 'DejaVu Sans Mono'],
    ['fontSize', 21],
    ['lineHeight', 1.8],
    ['paragraphSpacing', 1.1],
    ['tabSize', 2],
    ['textDirection', 'rtl'],
    ['bulletListMarker', '*'],
    ['orderListDelimiter', ')'],
    ['frontmatterType', '+'],
    ['sequenceTheme', 'simple'],
    ['imageInsertAction', 'path'],
    ['theme', 'paper'],
    ['spellcheckerEnabled', true],
    ['autoSave', false],
    ['zoom', 1.125]
  ] as const)('round-trips %s without rewriting the user value', (key, value) => {
    const preferences = usePreferencesStore()

    preferences.SET_USER_PREFERENCE({ [key]: value })

    expect(preferences[key]).toBe(value)
  })
})
