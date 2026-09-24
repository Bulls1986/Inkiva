import { beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('rolls back an optimistic value when acknowledged persistence fails', async() => {
    const invoke = vi.fn().mockResolvedValue({ ok: false, error: 'disk is read-only' })
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: { ipcRenderer: { invoke } }
    })
    const preferences = usePreferencesStore()
    preferences.SET_USER_PREFERENCE({ autoSaveDelay: 5000 })

    const result = await preferences.SET_SINGLE_PREFERENCE({ type: 'autoSaveDelay', value: 6200 })

    expect(invoke).toHaveBeenCalledWith('mt::preferences::set', { autoSaveDelay: 6200 })
    expect(result).toEqual({ ok: false, error: 'disk is read-only' })
    expect(preferences.autoSaveDelay).toBe(5000)
  })
})
