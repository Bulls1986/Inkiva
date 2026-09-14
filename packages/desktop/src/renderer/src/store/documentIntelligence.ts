import { computed, ref, watch, type WatchStopHandle } from 'vue'
import { defineStore } from 'pinia'
import type {
  LocalHistoryEntry,
  LocalHistorySnapshot,
  MarkdownBacklink
} from '@shared/types/documentIntelligence'
import {
  DocumentIntelligenceCoordinator,
  type DocumentIntelligenceDocument,
  type DocumentIntelligenceError,
  type DocumentIntelligenceState
} from '@/services/documentIntelligence'
import { rendererPerformance } from '@/services/performance/runtime'
import { BackgroundTaskScheduler } from '@/util/backgroundScheduler'
import { useEditorStore } from './editor'

const toDocument = (
  tab: ReturnType<typeof useEditorStore>['tabs'][number]
): DocumentIntelligenceDocument => ({
  id: tab.id,
  pathname: tab.pathname,
  markdown: tab.markdown,
  isSaved: tab.isSaved,
  ...(tab.encoding?.encoding ? { encoding: tab.encoding.encoding } : {}),
  ...(tab.lineEnding === 'lf' || tab.lineEnding === 'crlf' ? { lineEnding: tab.lineEnding } : {})
})

export const useDocumentIntelligenceStore = defineStore('documentIntelligence', () => {
  const currentDocumentId = ref<string | null>(null)
  const currentPath = ref<string | null>(null)
  const backlinks = ref<MarkdownBacklink[]>([])
  const history = ref<LocalHistoryEntry[]>([])
  const loading = ref(false)
  const restoringSnapshotId = ref<string | null>(null)
  const error = ref<DocumentIntelligenceError | null>(null)
  const started = ref(false)

  let coordinator: DocumentIntelligenceCoordinator | null = null
  let scheduler: BackgroundTaskScheduler | null = null
  let stopWatchingEditor: WatchStopHandle | null = null
  let stopInteractionListeners: (() => void) | null = null
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
    backlinks.value = state.backlinks
    history.value = state.history
    loading.value = state.loading
    restoringSnapshotId.value = state.restoringSnapshotId
    error.value = state.error
  }

  function START(): void {
    if (started.value) return
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
    stopInteractionListeners?.()
    stopInteractionListeners = null
    stopWatchingEditor?.()
    stopWatchingEditor = null
    coordinator?.dispose()
    coordinator = null
    scheduler = null
    started.value = false
  }

  async function REFRESH(): Promise<void> {
    await coordinator?.refresh()
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
    RESTORE_SNAPSHOT
  }
})
