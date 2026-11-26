import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  RECOVERY_BANNER_DISMISSED_STORAGE_KEY,
  loadDismissedRecoveryIds,
  mergeDismissedRecoveryIds,
  saveDismissedRecoveryIds,
  shouldShowRecoveryBanner,
  type RecoveryBannerStorage
} from '@/components/recoveryCenter/bannerDismissal'

const createStorage = (seed?: string): RecoveryBannerStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  if (seed !== undefined) data.set(RECOVERY_BANNER_DISMISSED_STORAGE_KEY, seed)
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    }
  }
}

const items = (...ids: string[]): { id: string }[] => ids.map((id) => ({ id }))

describe('recovery banner dismissal', () => {
  it('shows the banner while recovery items are undismissed', () => {
    expect(shouldShowRecoveryBanner(items('a', 'b'), [])).toBe(true)
  })

  it('does not show the banner when there is nothing to recover', () => {
    expect(shouldShowRecoveryBanner([], [])).toBe(false)
    expect(shouldShowRecoveryBanner([], ['a'])).toBe(false)
  })

  it('keeps the banner hidden after restart for the same recovery items', () => {
    const storage = createStorage()
    const dismissed = mergeDismissedRecoveryIds(loadDismissedRecoveryIds(storage), ['a', 'b'])
    saveDismissedRecoveryIds(dismissed, storage)

    // A restart reads the persisted dismissal with a fresh storage handle.
    const persisted = storage.data.get(RECOVERY_BANNER_DISMISSED_STORAGE_KEY)
    expect(persisted).toBeDefined()
    const reloaded = loadDismissedRecoveryIds(createStorage(persisted))
    expect(reloaded).toEqual(['a', 'b'])
    expect(shouldShowRecoveryBanner(items('a', 'b'), reloaded)).toBe(false)
  })

  it('shows the banner again once a new recovery item accumulates', () => {
    const storage = createStorage()
    saveDismissedRecoveryIds(mergeDismissedRecoveryIds([], ['a']), storage)

    expect(shouldShowRecoveryBanner(items('a'), loadDismissedRecoveryIds(storage))).toBe(false)
    expect(shouldShowRecoveryBanner(items('a', 'new'), loadDismissedRecoveryIds(storage))).toBe(true)
  })

  it('still shows the banner when dismissed ids cover only part of the recovery set', () => {
    expect(shouldShowRecoveryBanner(items('a', 'b'), ['a'])).toBe(true)
  })

  it('treats missing, malformed or foreign stored values as no dismissal', () => {
    expect(loadDismissedRecoveryIds(createStorage())).toEqual([])
    expect(loadDismissedRecoveryIds(createStorage('not-json'))).toEqual([])
    expect(loadDismissedRecoveryIds(createStorage('{"a":1}'))).toEqual([])
    expect(loadDismissedRecoveryIds(createStorage('[1,"a",null]'))).toEqual(['a'])
  })

  it('degrades to an unnotified dismissal when storage is unavailable', () => {
    const throwing: RecoveryBannerStorage = {
      getItem: () => {
        throw new Error('storage disabled')
      },
      setItem: () => {
        throw new Error('quota exceeded')
      }
    }

    expect(() => saveDismissedRecoveryIds(['a'], throwing)).not.toThrow()
    expect(loadDismissedRecoveryIds(throwing)).toEqual([])
  })

  it('drops duplicate ids when merging without losing earlier ids', () => {
    expect(mergeDismissedRecoveryIds(['a', 'b'], ['b', 'c', 'a'])).toEqual(['a', 'b', 'c'])
  })
})

describe('recovery center banner UI contract', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const componentPath = resolve(here, '../../../src/renderer/src/components/recoveryCenter/index.vue')
  const component = readFileSync(componentPath, 'utf8')

  it('persists the manual banner dismissal across launches', () => {
    expect(component).toContain('loadDismissedRecoveryIds')
    expect(component).toContain('saveDismissedRecoveryIds')
    expect(component).toContain('shouldShowRecoveryBanner')
    expect(component).toContain('@click="dismissBanner"')
  })
})
