import { describe, expect, it, vi } from 'vitest'
import {
  SAFE_RESTORE_FAILURE_THRESHOLD,
  SAFE_RESTORE_SCHEMA_VERSION,
  SafeRestoreGuard,
  type SafeRestoreState,
  type SafeRestoreStore
} from 'main_renderer/session/safeRestoreGuard'

class MemorySafeRestoreStore implements SafeRestoreStore {
  value: unknown
  setCalls = 0

  constructor(value: unknown = undefined) {
    this.value = value
  }

  get(): unknown {
    return this.value
  }

  set(value: SafeRestoreState): void {
    this.setCalls += 1
    this.value = value
  }
}

const recordFailedLaunch = (store: SafeRestoreStore, sessionId: string): number =>
  new SafeRestoreGuard(store).beginAttempt(sessionId)

describe('SafeRestoreGuard', () => {
  it('starts clean, records the first attempt, and stays below the threshold', () => {
    const store = new MemorySafeRestoreStore()
    const guard = new SafeRestoreGuard(store)

    expect(guard.shouldUseSafeRestore('session-a')).toBe(false)
    expect(guard.beginAttempt('session-a')).toBe(1)
    expect(guard.shouldUseSafeRestore('session-a')).toBe(false)
    expect(store.value).toEqual({
      schemaVersion: SAFE_RESTORE_SCHEMA_VERSION,
      sessions: { 'session-a': { consecutiveFailures: 1 } }
    })
    expect(store.setCalls).toBe(1)
  })

  it('triggers safe restore after the configured consecutive failure threshold', () => {
    const store = new MemorySafeRestoreStore()
    const decisions: boolean[] = []

    for (let attempt = 1; attempt <= SAFE_RESTORE_FAILURE_THRESHOLD; attempt += 1) {
      const guard = new SafeRestoreGuard(store)
      expect(guard.beginAttempt('session-a')).toBe(attempt)
      decisions.push(guard.shouldUseSafeRestore('session-a'))
    }

    expect(decisions).toEqual([false, false, true])
    expect(new SafeRestoreGuard(store).shouldUseSafeRestore('session-a')).toBe(true)
  })

  it('clears the count after READY and allows a fresh attempt sequence', () => {
    const store = new MemorySafeRestoreStore()
    for (let attempt = 0; attempt < SAFE_RESTORE_FAILURE_THRESHOLD; attempt += 1) {
      recordFailedLaunch(store, 'session-a')
    }

    const readyGuard = new SafeRestoreGuard(store)
    expect(readyGuard.shouldUseSafeRestore('session-a')).toBe(true)
    readyGuard.markReady('session-a')
    expect(readyGuard.shouldUseSafeRestore('session-a')).toBe(false)
    expect(store.value).toEqual({
      schemaVersion: SAFE_RESTORE_SCHEMA_VERSION,
      sessions: {}
    })

    const writesAfterReady = store.setCalls
    readyGuard.markReady('session-a')
    expect(store.setCalls).toBe(writesAfterReady)

    const nextLaunch = new SafeRestoreGuard(store)
    expect(nextLaunch.beginAttempt('session-a')).toBe(1)
    expect(nextLaunch.shouldUseSafeRestore('session-a')).toBe(false)
  })

  it('keeps failure counts independent for different session identities', () => {
    const store = new MemorySafeRestoreStore()
    recordFailedLaunch(store, 'session-a')
    recordFailedLaunch(store, 'session-a')
    recordFailedLaunch(store, 'session-b')

    expect(new SafeRestoreGuard(store).shouldUseSafeRestore('session-a')).toBe(false)
    expect(new SafeRestoreGuard(store).shouldUseSafeRestore('session-b')).toBe(false)

    recordFailedLaunch(store, 'session-a')
    expect(new SafeRestoreGuard(store).shouldUseSafeRestore('session-a')).toBe(true)
    expect(new SafeRestoreGuard(store).shouldUseSafeRestore('session-b')).toBe(false)
  })

  it('falls back to a clean state for corrupt or unsupported storage data', () => {
    const store = new MemorySafeRestoreStore({
      schemaVersion: 999,
      sessions: { 'session-a': { consecutiveFailures: SAFE_RESTORE_FAILURE_THRESHOLD } }
    })
    const guard = new SafeRestoreGuard(store)

    expect(() => guard.shouldUseSafeRestore('session-a')).not.toThrow()
    expect(guard.shouldUseSafeRestore('session-a')).toBe(false)
    expect(guard.beginAttempt('session-a')).toBe(1)
    expect(store.value).toEqual({
      schemaVersion: SAFE_RESTORE_SCHEMA_VERSION,
      sessions: { 'session-a': { consecutiveFailures: 1 } }
    })
  })

  it('discards malformed session entries without losing valid identities', () => {
    const store = new MemorySafeRestoreStore({
      schemaVersion: SAFE_RESTORE_SCHEMA_VERSION,
      sessions: {
        'session-a': { consecutiveFailures: SAFE_RESTORE_FAILURE_THRESHOLD - 1 },
        'session-b': { consecutiveFailures: 'not-a-number' },
        'session-c': null
      }
    })
    const guard = new SafeRestoreGuard(store)

    expect(guard.shouldUseSafeRestore('session-a')).toBe(false)
    expect(guard.beginAttempt('session-a')).toBe(SAFE_RESTORE_FAILURE_THRESHOLD)
    expect(guard.shouldUseSafeRestore('session-a')).toBe(true)
    expect(guard.shouldUseSafeRestore('session-b')).toBe(false)
    expect(store.value).toEqual({
      schemaVersion: SAFE_RESTORE_SCHEMA_VERSION,
      sessions: {
        'session-a': { consecutiveFailures: SAFE_RESTORE_FAILURE_THRESHOLD }
      }
    })
  })

  it('does not throw when the store cannot be read or written', () => {
    const readError = new Error('unreadable')
    const readOnlyBrokenStore: SafeRestoreStore = {
      get: vi.fn(() => {
        throw readError
      }),
      set: vi.fn()
    }
    const readGuard = new SafeRestoreGuard(readOnlyBrokenStore)

    expect(() => readGuard.beginAttempt('session-a')).not.toThrow()
    expect(readGuard.shouldUseSafeRestore('session-a')).toBe(false)

    const writeBrokenStore: SafeRestoreStore = {
      get: vi.fn(() => undefined),
      set: vi.fn(() => {
        throw new Error('unwritable')
      })
    }
    const writeGuard = new SafeRestoreGuard(writeBrokenStore, { failureThreshold: 1 })

    expect(() => writeGuard.beginAttempt('session-a')).not.toThrow()
    expect(writeGuard.shouldUseSafeRestore('session-a')).toBe(true)
  })

  it('makes repeated decisions and lifecycle calls idempotent', () => {
    const store = new MemorySafeRestoreStore()
    const guard = new SafeRestoreGuard(store)

    expect(guard.beginAttempt('session-a')).toBe(1)
    expect(guard.beginAttempt('session-a')).toBe(1)
    expect(guard.shouldUseSafeRestore('session-a')).toBe(false)
    expect(guard.shouldUseSafeRestore('session-a')).toBe(false)
    expect(store.setCalls).toBe(1)

    guard.markReady('session-a')
    guard.markReady('session-a')
    expect(store.setCalls).toBe(2)
    expect(store.value).toEqual({
      schemaVersion: SAFE_RESTORE_SCHEMA_VERSION,
      sessions: {}
    })
  })
})
