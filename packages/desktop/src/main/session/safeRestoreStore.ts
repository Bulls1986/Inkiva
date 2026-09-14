import fs from 'node:fs'
import path from 'node:path'
import writeFileAtomic from 'write-file-atomic'
import type { SafeRestoreState, SafeRestoreStore } from './safeRestoreGuard'

export const SAFE_RESTORE_STATE_FILE_NAME = 'safe-restore-state.json'

export const getSafeRestoreStatePath = (userDataPath: string): string =>
  path.join(userDataPath, SAFE_RESTORE_STATE_FILE_NAME)

/**
 * Small synchronous store for the startup guard. The file is deliberately
 * independent from electron-store so a corrupt or unavailable preferences
 * store cannot prevent the guard from making a best-effort decision.
 */
export class FileSafeRestoreStore implements SafeRestoreStore {
  private readonly _filePath: string | null

  constructor(userDataPath: string) {
    try {
      this._filePath = getSafeRestoreStatePath(userDataPath)
    } catch {
      this._filePath = null
    }
  }

  get(): unknown {
    if (!this._filePath) return undefined

    try {
      return JSON.parse(fs.readFileSync(this._filePath, 'utf8'))
    } catch {
      return undefined
    }
  }

  set(value: SafeRestoreState): void {
    if (!this._filePath) return

    try {
      fs.mkdirSync(path.dirname(this._filePath), { recursive: true })
      writeFileAtomic.sync(this._filePath, JSON.stringify(value), 'utf8')
    } catch {
      // Guard persistence is intentionally best-effort; the in-memory guard
      // remains authoritative for the current process when this fails.
    }
  }
}

export const createSafeRestoreStore = (userDataPath: string): SafeRestoreStore =>
  new FileSafeRestoreStore(userDataPath)

export default FileSafeRestoreStore
