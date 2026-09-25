import { createHash } from 'node:crypto'
import path from 'node:path'
import { readFile, stat, unlink } from 'node:fs/promises'
import writeFileAtomic from 'write-file-atomic'

import type EditorBufferStore from '../editorBufferStore'
import {
  mergeBufferStoreContents,
  type BufferStoreState,
  type BufferStoreTab
} from '../editorBufferStore/restore'
import {
  buildRestorePlan,
  type RecoverySource,
  type RestorePlan,
  type SkippedRecoverySource
} from './restorePlan'
import {
  createRecoveryHistoryPersistence,
  type RecoveryHistoryPersistenceFactory
} from '../documentIntelligence/recoveryHistoryPersistence'
import type {
  RecoveryCenterItem,
  RecoveryCenterState,
  RecoveryOpenResult,
  RecoveryReplaceResult
} from '@shared/types/recovery'

const hashContent = (content: string): string =>
  createHash('sha256').update(content, 'utf8').digest('hex')

const safeRead = async(filePath: string): Promise<string | null> => {
  if (!filePath) return null
  try {
    return await readFile(filePath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

const tabId = (tab: BufferStoreTab, index: number): string =>
  typeof tab.id === 'string' && tab.id ? tab.id : `recovery-tab-${index}`

export class RecoveryCenterSession {
  private _safeMode = false
  private _state: BufferStoreState | null = null
  private _pendingTabs: BufferStoreTab[] = []
  private _skippedSources: SkippedRecoverySource[] = []
  private _primarySource: RecoverySource | null = null
  private _bufferStore: EditorBufferStore | null = null
  private _userDataPath = ''
  private _planLoaded = false

  constructor(
    private readonly _createHistoryPersistence: RecoveryHistoryPersistenceFactory =
    createRecoveryHistoryPersistence
  ) {}

  configure(options: {
    safeMode: boolean
    bufferStore: EditorBufferStore
    userDataPath: string
  }): void {
    this._safeMode = options.safeMode
    this._bufferStore = options.bufferStore
    this._userDataPath = options.userDataPath
  }

  private async _ensurePlanLoaded(): Promise<void> {
    if (this._planLoaded || !this._bufferStore) return
    this.setRestorePlan(await this._bufferStore.buildRestorePlan(), {
      safeMode: this._safeMode,
      bufferStore: this._bufferStore,
      userDataPath: this._userDataPath
    })
  }

  setRestorePlan(
    plan: RestorePlan,
    options: { safeMode: boolean; bufferStore: EditorBufferStore; userDataPath: string }
  ): void {
    this._safeMode = options.safeMode
    this._state = plan.state
    this._pendingTabs = [...plan.pendingTabs]
    this._skippedSources = [...plan.skippedSources]
    this._primarySource = plan.primarySource
    this._bufferStore = options.bufferStore
    this._userDataPath = options.userDataPath
    this._planLoaded = true
  }

  private async _savedAt(filePath: string): Promise<number | null> {
    try {
      return (await stat(filePath)).mtimeMs
    } catch {
      return null
    }
  }

  private async _revisionItem(tab: BufferStoreTab, index: number): Promise<RecoveryCenterItem> {
    const id = tabId(tab, index)
    const pathname = typeof tab.pathname === 'string' ? tab.pathname : ''
    const recoveryMarkdown = typeof tab.markdown === 'string' ? tab.markdown : null
    const sourcePath = this._primarySource?.filePath ?? ''
    let diskMarkdown: string | null = null
    let diskError: string | null = null

    if (pathname) {
      try {
        diskMarkdown = await safeRead(pathname)
      } catch (error) {
        diskError = error instanceof Error ? error.message : String(error)
      }
    }

    const title =
      typeof tab.filename === 'string' && tab.filename
        ? tab.filename
        : pathname
          ? path.basename(pathname)
          : '未命名文档'

    return {
      id,
      kind: 'revision',
      title,
      pathname,
      sourcePath,
      recoveryMarkdown,
      diskMarkdown,
      diskRevision: diskMarkdown === null ? null : hashContent(diskMarkdown),
      savedAt: sourcePath ? await this._savedAt(sourcePath) : null,
      differsFromDisk: recoveryMarkdown !== diskMarkdown,
      error: recoveryMarkdown === null ? '恢复稿内容无效，无法安全打开。' : diskError
    }
  }

  async getState(): Promise<RecoveryCenterState> {
    await this._ensurePlanLoaded()
    const revisions = await Promise.all(
      this._pendingTabs.map((tab, index) => this._revisionItem(tab, index))
    )
    const damaged: RecoveryCenterItem[] = await Promise.all(
      this._skippedSources.map(async(source) => ({
        id: `source:${source.id}`,
        kind: 'damaged-source' as const,
        title: path.basename(source.filePath) || source.id,
        pathname: '',
        sourcePath: source.filePath,
        recoveryMarkdown: null,
        diskMarkdown: null,
        diskRevision: null,
        savedAt: await this._savedAt(source.filePath),
        differsFromDisk: false,
        error: source.message
      }))
    )
    return { safeMode: this._safeMode, items: [...revisions, ...damaged] }
  }

  async openAsNewDocument(itemId: string): Promise<RecoveryOpenResult | null> {
    await this._ensurePlanLoaded()
    const item = await this._getRevisionItem(itemId)
    if (!item || item.recoveryMarkdown === null) return null
    return { markdown: item.recoveryMarkdown, sourcePath: item.pathname }
  }

  async replaceFile(
    itemId: string,
    expectedDiskRevision: string | null
  ): Promise<RecoveryReplaceResult> {
    await this._ensurePlanLoaded()
    const item = await this._getRevisionItem(itemId)
    if (!item || !item.pathname || item.recoveryMarkdown === null) {
      return {
        ok: false,
        reason: 'unavailable',
        message: '该恢复稿不能直接替换文件，请另存为新文档。'
      }
    }

    const currentDisk = await safeRead(item.pathname)
    if (currentDisk === null) {
      return {
        ok: false,
        reason: 'unavailable',
        message: '原文件已不存在，请将恢复稿另存为新文档。'
      }
    }
    const currentRevision = hashContent(currentDisk)
    if (currentRevision !== expectedDiskRevision) {
      return {
        ok: false,
        reason: 'external-change',
        diskMarkdown: currentDisk,
        diskRevision: currentRevision,
        message: '文件已在外部更改'
      }
    }

    const history = this._createHistoryPersistence(this._userDataPath)
    await history.createSnapshot({
      filePath: item.pathname,
      content: currentDisk,
      reason: 'before-external-change'
    })
    await writeFileAtomic(item.pathname, item.recoveryMarkdown, { encoding: 'utf8' })
    await this._resolveRevision(itemId)
    return { ok: true }
  }

  async discard(itemId: string): Promise<boolean> {
    await this._ensurePlanLoaded()
    if (itemId.startsWith('source:')) {
      const sourceId = itemId.slice('source:'.length)
      const source = this._skippedSources.find(({ id }) => id === sourceId)
      if (!source) return false
      try {
        await unlink(source.filePath)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      this._skippedSources = this._skippedSources.filter(({ id }) => id !== sourceId)
      return true
    }

    if (!this._pendingTabs.some((tab, index) => tabId(tab, index) === itemId)) return false
    await this._resolveRevision(itemId)
    return true
  }

  async discardWorkspaceState(): Promise<boolean> {
    await this._ensurePlanLoaded()
    const sourcePaths = new Set<string>()
    if (this._primarySource?.filePath) sourcePaths.add(this._primarySource.filePath)
    for (const source of this._skippedSources) sourcePaths.add(source.filePath)

    for (const filePath of sourcePaths) {
      try {
        await unlink(filePath)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }

    this._state = null
    this._pendingTabs = []
    this._skippedSources = []
    this._primarySource = null
    return true
  }

  async retryDamagedSource(itemId: string): Promise<RecoveryCenterState> {
    await this._ensurePlanLoaded()
    if (!itemId.startsWith('source:')) return this.getState()
    const sourceId = itemId.slice('source:'.length)
    const source = this._skippedSources.find(({ id }) => id === sourceId)
    if (!source) return this.getState()

    const retryPlan = await buildRestorePlan([source], async(candidate) => {
      const content = await readFile(candidate.filePath, 'utf8')
      return JSON.parse(content) as unknown
    })
    if (retryPlan.kind !== 'restore' || !retryPlan.state) return this.getState()

    const previousPrimary = this._primarySource
    this._state = this._state
      ? mergeBufferStoreContents([this._state, retryPlan.state])
      : retryPlan.state
    this._primarySource = this._primarySource ?? retryPlan.primarySource
    this._pendingTabs = this._state.tabs.filter((tab) => tab.isSaved === false)
    this._skippedSources = this._skippedSources.filter(({ id }) => id !== sourceId)
    await this._persistState()
    if (
      previousPrimary &&
      retryPlan.primarySource &&
      retryPlan.primarySource.filePath !== previousPrimary.filePath
    ) {
      try {
        await unlink(retryPlan.primarySource.filePath)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
    return this.getState()
  }

  private async _getRevisionItem(itemId: string): Promise<RecoveryCenterItem | null> {
    const index = this._pendingTabs.findIndex((tab, tabIndex) => tabId(tab, tabIndex) === itemId)
    return index < 0 ? null : this._revisionItem(this._pendingTabs[index]!, index)
  }

  private async _resolveRevision(itemId: string): Promise<void> {
    const pendingIndex = this._pendingTabs.findIndex(
      (tab, index) => tabId(tab, index) === itemId
    )
    if (pendingIndex < 0) return
    const resolved = this._pendingTabs[pendingIndex]!
    this._pendingTabs.splice(pendingIndex, 1)
    if (this._state) {
      this._state = {
        ...this._state,
        tabs: this._state.tabs.filter((tab) => tab !== resolved)
      }
    }
    await this._persistState()
  }

  private async _persistState(): Promise<void> {
    if (!this._bufferStore || !this._primarySource || !this._state) return
    await this._bufferStore.writeBufferStoreFile(this._primarySource.filePath, this._state)
  }
}

export const recoveryCenterSession = new RecoveryCenterSession()
