import { computed, ref, watch, type WatchStopHandle } from 'vue'
import { defineStore } from 'pinia'
import type {
  LocalHistoryEntry,
  LocalHistorySnapshot,
  MarkdownBacklink,
  WorkspaceLinkIndexResult
} from '@shared/types/documentIntelligence'
import {
  DocumentIntelligenceCoordinator,
  type DocumentIntelligenceDocument,
  type DocumentIntelligenceError,
  type DocumentIntelligenceState
} from '@/services/documentIntelligence'
import { rendererPerformance } from '@/services/performance/runtime'
import { BackgroundTaskScheduler } from '@/util/backgroundScheduler'
import bus from '@/bus'
import { useEditorStore } from './editor'
import { useProjectStore } from './project'

const toDocument = (
  tab: ReturnType<typeof useEditorStore>['tabs'][number]
): DocumentIntelligenceDocument => ({
  id: tab.id,
  pathname: tab.pathname,
  markdown: tab.markdown,
  isSaved: tab.isSaved,
  ...(tab.encoding?.encoding ? { encoding: tab.encoding.encoding } : {}),
  ...(typeof tab.encoding?.isBom === 'boolean' ? { isBom: tab.encoding.isBom } : {}),
  ...(tab.lineEnding === 'lf' || tab.lineEnding === 'crlf' ? { lineEnding: tab.lineEnding } : {})
})

export const useDocumentIntelligenceStore = defineStore('documentIntelligence', () => {
  const currentDocumentId = ref<string | null>(null)
  const currentPath = ref<string | null>(null)
  const workspaceIndex = ref<WorkspaceLinkIndexResult | null>(null)
  const backlinks = ref<MarkdownBacklink[]>([])
  const history = ref<LocalHistoryEntry[]>([])
  const loading = ref(false)
  const restoringSnapshotId = ref<string | null>(null)
  const error = ref<DocumentIntelligenceError | null>(null)
  const started = ref(false)

  let coordinator: DocumentIntelligenceCoordinator | null = null
  let scheduler: BackgroundTaskScheduler | null = null
  let stopWatchingEditor: WatchStopHandle | null = null
  let stopWatchingProject: WatchStopHandle | null = null
  let stopInteractionListeners: (() => void) | null = null
  let stopWorkspaceEvents: (() => void) | null = null
  let workspaceEventTimer: ReturnType<typeof setTimeout> | null = null
  const pendingWorkspaceFiles = new Set<string>()
  let workspaceDirectoryChanged = false
  let interactionReleaseFrame: number | null = null

  const editorStore = useEditorStore()
  const canRestore = computed(() => {
    const current = editorStore.currentFile
    return !!current?.pathname && current.isSaved && restoringSnapshotId.value === null
  })
  const requiresSaveBeforeRestore = computed(() => {
    const current = editorStore.currentFile
    return !!current?.pathname && !current.isSaved
  })

  const applyState = (state: DocumentIntelligenceState): void => {
    currentDocumentId.value = state.currentDocumentId
    currentPath.value = state.currentPath
    workspaceIndex.value = state.workspaceIndex
    backlinks.value = state.backlinks
    history.value = state.history
    loading.value = state.loading
    restoringSnapshotId.value = state.restoringSnapshotId
    error.value = state.error
  }

  function START(): void {
    if (started.value) return
    const projectStore = useProjectStore()
    scheduler = new BackgroundTaskScheduler({
      onSlice: (task, durationMs) => {
        rendererPerformance.recordSample('background.taskSlice', 'ms', durationMs, {
          phase: 'editor',
          metadata: {
            priority: task.priority,
            task: task.id
          }
        })
      }
    })
    coordinator = new DocumentIntelligenceCoordinator({
      api: window.documentIntelligence,
      scheduler,
      onStateChange: applyState
    })

    const markInteractionPending = (): void => {
      coordinator?.setInteractivePending(true)
      if (interactionReleaseFrame !== null) {
        window.cancelAnimationFrame(interactionReleaseFrame)
      }
      interactionReleaseFrame = window.requestAnimationFrame(() => {
        interactionReleaseFrame = null
        coordinator?.setInteractivePending(false)
      })
    }
    const interactionEvents = ['beforeinput', 'input', 'keydown', 'compositionstart']
    for (const eventName of interactionEvents) {
      window.addEventListener(eventName, markInteractionPending, true)
    }
    stopInteractionListeners = () => {
      if (interactionReleaseFrame !== null) {
        window.cancelAnimationFrame(interactionReleaseFrame)
        interactionReleaseFrame = null
      }
      for (const eventName of interactionEvents) {
        window.removeEventListener(eventName, markInteractionPending, true)
      }
    }

    started.value = true

    const handleProjectTreeChange = ({ type, change }: {
      type: string
      change?: unknown
    }): void => {
      if (!projectStore.projectTree?.pathname) return
      if (type === 'addDir' || type === 'unlinkDir') {
        workspaceDirectoryChanged = true
      } else if (type === 'add' || type === 'change' || type === 'unlink') {
        const pathname = (change as { pathname?: unknown } | null)?.pathname
        if (typeof pathname !== 'string') return
        pendingWorkspaceFiles.add(pathname)
        if (pendingWorkspaceFiles.size > 256) workspaceDirectoryChanged = true
      } else {
        return
      }
      if (workspaceEventTimer) clearTimeout(workspaceEventTimer)
      workspaceEventTimer = setTimeout(() => {
        workspaceEventTimer = null
        const root = projectStore.projectTree?.pathname ?? null
        if (!root) return
        const rescan = workspaceDirectoryChanged
        workspaceDirectoryChanged = false
        const files = [...pendingWorkspaceFiles]
        pendingWorkspaceFiles.clear()
        if (rescan) {
          void coordinator?.indexWorkspace(root)
        } else {
          for (const pathname of files) void coordinator?.refreshWorkspaceFile(pathname)
        }
      }, 350)
    }
    bus.on('project-tree-changed', handleProjectTreeChange)
    stopWorkspaceEvents = () => bus.off('project-tree-changed', handleProjectTreeChange)

    stopWatchingProject = watch(
      () => projectStore.projectTree?.pathname ?? null,
      (rootPath) => {
        if (workspaceEventTimer) clearTimeout(workspaceEventTimer)
        workspaceEventTimer = null
        pendingWorkspaceFiles.clear()
        workspaceDirectoryChanged = false
        void coordinator?.indexWorkspace(rootPath)
      },
      { immediate: true, flush: 'post' }
    )

    stopWatchingEditor = watch(
      () => ({
        currentId: editorStore.currentFile?.id ?? null,
        documents: editorStore.tabs.map(toDocument)
      }),
      ({ currentId, documents }) => coordinator?.updateDocuments(documents, currentId),
      { immediate: true, flush: 'post' }
    )
  }

  function STOP(): void {
    if (workspaceEventTimer) clearTimeout(workspaceEventTimer)
    workspaceEventTimer = null
    pendingWorkspaceFiles.clear()
    workspaceDirectoryChanged = false
    stopWorkspaceEvents?.()
    stopWorkspaceEvents = null
    stopInteractionListeners?.()
    stopInteractionListeners = null
    stopWatchingEditor?.()
    stopWatchingEditor = null
    stopWatchingProject?.()
    stopWatchingProject = null
    coordinator?.dispose()
    coordinator = null
    scheduler = null
    started.value = false
  }

  async function REFRESH(): Promise<void> {
    await coordinator?.refresh()
  }

  async function GET_SNAPSHOT(id: string): Promise<LocalHistorySnapshot | null> {
    return (await coordinator?.getSnapshot(id)) ?? null
  }

  async function OPEN_SNAPSHOT_COPY(id: string): Promise<boolean> {
    const snapshot = await GET_SNAPSHOT(id)
    if (!snapshot) return false
    bus.emit('mt::new-untitled-tab', { selected: true, markdown: snapshot.content })
    return true
  }

  async function RESTORE_SNAPSHOT(id: string): Promise<boolean> {
    const current = editorStore.currentFile
    if (!current?.pathname || !current.isSaved || !coordinator) {
      await coordinator?.restoreSnapshot(id)
      return false
    }

    const expected = {
      id: current.id,
      pathname: current.pathname,
      markdown: current.markdown
    }
    const snapshot: LocalHistorySnapshot | null = await coordinator.restoreSnapshot(id)
    if (!snapshot) return false

    const latest = editorStore.currentFile
    if (
      !latest?.isSaved ||
      latest.id !== expected.id ||
      latest.pathname !== expected.pathname ||
      latest.markdown !== expected.markdown
    ) {
      return false
    }

    editorStore.loadChange({
      pathname: latest.pathname,
      data: {
        markdown: snapshot.content,
        filename: latest.filename,
        encoding: latest.encoding,
        lineEnding: snapshot.lineEnding ?? latest.lineEnding,
        adjustLineEndingOnSave: latest.adjustLineEndingOnSave,
        trimTrailingNewline: latest.trimTrailingNewline
      }
    })
    return true
  }

  return {
    currentDocumentId,
    currentPath,
    workspaceIndex,
    backlinks,
    history,
    loading,
    restoringSnapshotId,
    error,
    started,
    canRestore,
    requiresSaveBeforeRestore,
    START,
    STOP,
    REFRESH,
    GET_SNAPSHOT,
    OPEN_SNAPSHOT_COPY,
    RESTORE_SNAPSHOT
  }
})
