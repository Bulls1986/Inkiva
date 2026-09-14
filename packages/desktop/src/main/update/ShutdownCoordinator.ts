import type { UnsavedFile } from '@shared/types/files'

export type ShutdownMode = 'normal' | 'update-install'

export interface EditorWindowRef {
  id: number
}

export interface ShutdownCoordinatorOptions {
  getEditorWindows: () => EditorWindowRef[]
  getActiveEditorId: () => number | null
  requestUnsavedFiles: (window: EditorWindowRef) => Promise<UnsavedFile[]>
  saveDirtyFiles: (window: EditorWindowRef, files: UnsavedFile[]) => Promise<boolean>
}

export class ShutdownCoordinator {
  private readonly _options: ShutdownCoordinatorOptions
  private _preparePromise: Promise<boolean> | undefined
  private _updateInstallApproved = false

  mode: ShutdownMode = 'normal'

  constructor(options: ShutdownCoordinatorOptions) {
    this._options = options
  }

  isUpdateInstallApproved(): boolean {
    return this._updateInstallApproved && this.mode === 'update-install'
  }

  async prepareUpdateInstall(): Promise<boolean> {
    if (this.isUpdateInstallApproved()) return true
    if (this._preparePromise) return this._preparePromise

    const promise = this._prepare()
    this._preparePromise = promise
    try {
      return await promise
    } finally {
      if (this._preparePromise === promise) this._preparePromise = undefined
    }
  }

  private async _prepare(): Promise<boolean> {
    this._updateInstallApproved = false
    this.mode = 'normal'

    const activeEditorId = this._options.getActiveEditorId()
    const windows = [...this._options.getEditorWindows()].sort((left, right) => {
      if (left.id === activeEditorId) return -1
      if (right.id === activeEditorId) return 1
      return 0
    })

    try {
      for (const window of windows) {
        const files = await this._options.requestUnsavedFiles(window)
        if (files.length && !(await this._options.saveDirtyFiles(window, files))) {
          return false
        }
      }
    } catch {
      return false
    }

    this._updateInstallApproved = true
    this.mode = 'update-install'
    return true
  }
}
