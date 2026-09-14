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
  let stopWatchingEditor: WatchStopHandle | null = null

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
    coordinator = new DocumentIntelligenceCoordinator({
      api: window.documentIntelligence,
      onStateChange: applyState
    })
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
    stopWatchingEditor?.()
    stopWatchingEditor = null
    coordinator?.dispose()
    coordinator = null
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
