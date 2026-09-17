import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import staticPreferences from '../../../static/preference.json'
import preferenceSchema from '../../../src/main/preferences/schema.json'
import { usePreferencesStore } from '@/store/preferences'

const defaultEntries = preferenceSchema as Record<string, { default?: unknown }>

describe('private build first-run defaults', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('keeps the static preference file, schema and renderer store aligned', () => {
    const preferences = usePreferencesStore()

    for (const [key, value] of Object.entries({
      autoSave: true,
      language: 'zh-CN',
      shortcutStyle: 'typora',
      fontSize: 18,
      lineHeight: 1.7,
      paragraphSpacing: 0.75,
      editorFontFamily: 'Georgia',
      editorLineWidth: '80%',
      sideBarVisibility: true,
      tabBarVisibility: true
    })) {
      expect(staticPreferences[key as keyof typeof staticPreferences]).toBe(value)
      expect(defaultEntries[key]?.default).toBe(value)
      expect(preferences[key as keyof typeof preferences]).toBe(value)
    }
  })

  it('migrates the previous pixel default to the percentage default', () => {
    const preferences = usePreferencesStore()

    preferences.SET_USER_PREFERENCE({ editorLineWidth: '780px' })

    expect(preferences.editorLineWidth).toBe('80%')
  })
})
