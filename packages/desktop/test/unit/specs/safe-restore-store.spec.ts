import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  SAFE_RESTORE_STATE_FILE_NAME,
  FileSafeRestoreStore,
  getSafeRestoreStatePath
} from 'main_renderer/session/safeRestoreStore'
import {
  SAFE_RESTORE_SCHEMA_VERSION,
  type SafeRestoreState
} from 'main_renderer/session/safeRestoreGuard'

const temporaryDirectories: string[] = []

const createTemporaryDirectory = (): string => {
  const directory = mkdtempSync(path.join(tmpdir(), 'inkiva-safe-restore-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('FileSafeRestoreStore', () => {
  it('persists state beneath the supplied user-data path', () => {
    const userDataPath = createTemporaryDirectory()
    const state: SafeRestoreState = {
      schemaVersion: SAFE_RESTORE_SCHEMA_VERSION,
      sessions: { 'startup-restore': { consecutiveFailures: 2 } }
    }
    const store = new FileSafeRestoreStore(userDataPath)

    store.set(state)

    const statePath = getSafeRestoreStatePath(userDataPath)
    expect(statePath).toBe(path.join(userDataPath, SAFE_RESTORE_STATE_FILE_NAME))
    expect(JSON.parse(readFileSync(statePath, 'utf8'))).toEqual(state)
    expect(new FileSafeRestoreStore(userDataPath).get()).toEqual(state)
  })

  it('treats missing or corrupt files as an empty persistence boundary', () => {
    const userDataPath = createTemporaryDirectory()
    const store = new FileSafeRestoreStore(userDataPath)

    expect(store.get()).toBeUndefined()

    writeFileSync(getSafeRestoreStatePath(userDataPath), '{not-json', 'utf8')
    expect(store.get()).toBeUndefined()
  })

  it('does not throw when the user-data path cannot be written', () => {
    const parentPath = createTemporaryDirectory()
    const userDataPath = path.join(parentPath, 'not-a-directory')
    writeFileSync(userDataPath, 'file', 'utf8')
    const store = new FileSafeRestoreStore(userDataPath)

    expect(() => store.get()).not.toThrow()
    expect(() =>
      store.set({ schemaVersion: SAFE_RESTORE_SCHEMA_VERSION, sessions: {} })
    ).not.toThrow()
  })
})
