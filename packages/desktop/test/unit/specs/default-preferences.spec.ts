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
      language: 'zh-CN',
      shortcutStyle: 'typora',
      sideBarVisibility: true,
      tabBarVisibility: true
    })) {
      expect(staticPreferences[key as keyof typeof staticPreferences]).toBe(value)
      expect(defaultEntries[key]?.default).toBe(value)
      expect(preferences[key as keyof typeof preferences]).toBe(value)
    }
  })
})
