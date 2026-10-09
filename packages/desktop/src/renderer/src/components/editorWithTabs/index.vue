<template>
  <div
    class="editor-with-tabs"
    :class="{ 'is-split': splitActive }"
    data-testid="editor-with-tabs"
    @compositionstart.capture="handleCompositionStart"
    @compositionend.capture="handleCompositionEnd"
  >
    <div
      class="container"
      data-testid="editor-split-container"
    >
      <div
        class="primary-editor-pane"
        data-testid="primary-editor-pane"
        :data-tab-lifecycle="currentFile ? tabLifecycle[currentFile.id] ?? 'active' : 'none'"
      >
        <editor
          v-if="!isExtremeDocument"
          :markdown="props.markdown"
          :cursor="props.cursor"
          :text-direction="props.textDirection"
          :platform="props.platform"
        />
        <div
          v-else
          ref="degradedEditorRef"
          class="editor-component degraded-editor-component"
          data-editor-mode="bounded-source"
        >
          <div
            class="degraded-editor-notice"
            role="status"
          >
            Large document mode keeps the full text editable while rendering only visible lines.
          </div>
          <source-code
            :markdown="props.markdown"
            :muya-index-cursor="props.muyaIndexCursor"
            :text-direction="props.textDirection"
            :degraded="true"
          />
        </div>
        <source-code
          v-if="sourceCode && !isExtremeDocument"
          :markdown="props.markdown"
          :muya-index-cursor="props.muyaIndexCursor"
          :text-direction="props.textDirection"
        />
      </div>
      <split-document-pane
        v-if="splitActive && secondaryFile"
        :file="secondaryFile"
        :text-direction="textDirection"
        @activate="activateSecondary"
      />
    </div>
    <editor-search />
    <tab-notifications />
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { shouldUseDegradedLargeDocumentMode } from '@/util/largeDocumentMode'
import { rendererPerformance } from '@/services/performance/runtime'
import bus from '../../bus'
import { scheduleDegradedEditorPerformanceMilestones } from './degradedEditorPerformance'
import Editor from './editor.vue'
import EditorSearch from '../search/index.vue'
import TabNotifications from './notifications.vue'
import SplitDocumentPane from './splitDocumentPane.vue'
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/store/editor'
import { useLayoutStore } from '@/store/layout'
import { usePreferencesStore } from '@/store/preferences'
import { getDefaultSplitTabId, normalizeSplitTabId, promoteSplitTab } from '@/util/splitEditor'
import type { IFileState } from '@shared/types/files'

// Source mode is optional and disabled by default. Keep CodeMirror and its
// language/runtime dependencies out of the WYSIWYG first-paint path.
const SourceCode = defineAsyncComponent(() => import('./sourceCode.vue'))

const props = defineProps<{
  markdown: string
  cursor: unknown
  muyaIndexCursor?: unknown
  sourceCode: boolean
  textDirection: string
  platform: string
}>()

const editorStore = useEditorStore()
const layoutStore = useLayoutStore()
const preferencesStore = usePreferencesStore()
const { currentFile, tabs, tabLifecycle } = storeToRefs(editorStore)
const { splitEditor, splitTabId } = storeToRefs(layoutStore)

const isExtremeDocument = computed(() => shouldUseDegradedLargeDocumentMode(props.markdown))
const degradedEditorRef = ref<HTMLElement | null>(null)
let degradedPerformanceGeneration = 0

interface PendingSourceModeIntent {
  documentId: string
  target: boolean
}

let composingDocumentId: string | null = null
let pendingSourceModeIntent: PendingSourceModeIntent | null = null

const reconcileSourceModeMenu = (): void => {
  preferencesStore.DISPATCH_EDITOR_VIEW_STATE({ sourceCode: props.sourceCode })
}

const cancelPendingSourceModeIntent = (): void => {
  pendingSourceModeIntent = null
  composingDocumentId = null
  reconcileSourceModeMenu()
}

const sourceSnapshotCanEnterWysiwyg = (documentId: string): boolean => {
  let resolved = false
  let safe = false
  bus.emit('source-mode-exit-readiness', {
    documentId,
    resolve: (value) => {
      resolved = true
      safe = value
    }
  })
  return resolved && safe
}

const applySourceModeIntent = (intent: PendingSourceModeIntent): void => {
  const file = currentFile.value
  if (!file || file.id !== intent.documentId) return

  if (isExtremeDocument.value) {
    reconcileSourceModeMenu()
    return
  }

  if (intent.target === props.sourceCode) {
    reconcileSourceModeMenu()
    return
  }

  if (!intent.target && !sourceSnapshotCanEnterWysiwyg(intent.documentId)) {
    file.sourceCodeMode = true
    preferencesStore.SET_MODE({ type: 'sourceCode', checked: true })
    preferencesStore.DISPATCH_EDITOR_VIEW_STATE({ sourceCode: true })
    return
  }

  file.sourceCodeMode = intent.target
  preferencesStore.SET_MODE({ type: 'sourceCode', checked: intent.target })
  preferencesStore.DISPATCH_EDITOR_VIEW_STATE({ sourceCode: intent.target })
}

const handleSourceModeToggleRequest = (): void => {
  const documentId = currentFile.value?.id
  if (!documentId) return

  const baseTarget =
    pendingSourceModeIntent?.documentId === documentId
      ? pendingSourceModeIntent.target
      : props.sourceCode
  const intent: PendingSourceModeIntent = {
    documentId,
    target: !baseTarget
  }

  if (composingDocumentId === documentId) {
    pendingSourceModeIntent = intent
    return
  }

  applySourceModeIntent(intent)
}

const handleCompositionStart = (): void => {
  composingDocumentId = currentFile.value?.id ?? null
}

const handleCompositionEnd = (): void => {
  const documentId = currentFile.value?.id
  if (!documentId || composingDocumentId !== documentId) return

  composingDocumentId = null
  const intent = pendingSourceModeIntent
  pendingSourceModeIntent = null
  if (intent?.documentId === documentId) {
    applySourceModeIntent(intent)
  }
}

watch(
  () => currentFile.value?.id,
  (documentId, previousDocumentId) => {
    if (documentId === previousDocumentId) return
    if (
      pendingSourceModeIntent?.documentId === previousDocumentId ||
      composingDocumentId === previousDocumentId
    ) {
      pendingSourceModeIntent = null
      composingDocumentId = null
    }
  },
  { flush: 'sync' }
)

const degradedOperationId = (documentId?: string): string =>
  documentId ? `document-${documentId}` : 'document-initial'

const markDegradedFirstScreen = (documentId?: string): void => {
  const element = degradedEditorRef.value
  if (element) element.dataset.editorFirstScreenAt = String(performance.now())
  rendererPerformance.mark('document_first_screen', {
    phase: 'document-open',
    operationId: degradedOperationId(documentId),
    documentId
  })
}

const markDegradedInteractive = (documentId?: string): void => {
  const element = degradedEditorRef.value
  if (element) element.dataset.editorInteractiveAt = String(performance.now())
  rendererPerformance.mark('first_editor_interactive', {
    phase: 'editor',
    operationId: degradedOperationId(documentId),
    documentId
  })
}

const markDegradedEditable = (documentId?: string): void => {
  const element = degradedEditorRef.value
  if (element) element.dataset.editorEditableAt = String(performance.now())
  rendererPerformance.mark('document_editable', {
    phase: 'startup',
    operationId: degradedOperationId(documentId),
    documentId
  })
}

const beginDegradedEditorPerformance = (): void => {
  const generation = ++degradedPerformanceGeneration
  const element = degradedEditorRef.value
  if (!element) return
  const documentId = currentFile.value?.id ?? undefined
  element.dataset.editorOperationId = degradedOperationId(documentId)
  element.dataset.editorOpenStartAt = String(performance.now())
  delete element.dataset.editorFirstScreenAt
  delete element.dataset.editorInteractiveAt
  delete element.dataset.editorEditableAt
  rendererPerformance.mark('document_open_start', {
    phase: 'document-open',
    operationId: degradedOperationId(documentId),
    documentId
  })
  scheduleDegradedEditorPerformanceMilestones({
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    isCurrent: () => generation === degradedPerformanceGeneration && isExtremeDocument.value,
    hasEditorSurface: () => !!degradedEditorRef.value?.querySelector('.CodeMirror'),
    markFirstScreen: () => markDegradedFirstScreen(documentId),
    markInteractive: () => markDegradedInteractive(documentId),
    markEditable: () => markDegradedEditable(documentId),
    notifyMainProcess: () => window.electron.ipcRenderer.send('mt::document-editable')
  })
}

watch(
  [isExtremeDocument, () => currentFile.value?.id],
  ([isDegraded]) => {
    if (isDegraded) beginDegradedEditorPerformance()
    else degradedPerformanceGeneration += 1
  },
  { immediate: true, flush: 'post' }
)

const handleFileLoaded = (): void => {
  if (isExtremeDocument.value) beginDegradedEditorPerformance()
}

onMounted(() => {
  bus.on('file-loaded', handleFileLoaded)
  bus.on('view:request-source-code-toggle', handleSourceModeToggleRequest)
  window.addEventListener('blur', cancelPendingSourceModeIntent)
  if (isExtremeDocument.value) beginDegradedEditorPerformance()
})

onBeforeUnmount(() => {
  degradedPerformanceGeneration += 1
  bus.off('file-loaded', handleFileLoaded)
  bus.off('view:request-source-code-toggle', handleSourceModeToggleRequest)
  window.removeEventListener('blur', cancelPendingSourceModeIntent)
  pendingSourceModeIntent = null
  composingDocumentId = null
})

const splitActive = computed(() => splitEditor.value && !!currentFile.value)
const secondaryFile = computed<IFileState | null>(() => {
  if (!splitActive.value) return null
  const id = normalizeSplitTabId(splitTabId.value, currentFile.value?.id, tabs.value)
  return tabs.value.find((tab) => tab.id === id) ?? null
})

watch(
  [splitActive, () => currentFile.value?.id, tabs, splitTabId],
  () => {
    if (!splitActive.value) return
    const nextId = getDefaultSplitTabId(currentFile.value?.id, tabs.value)
    const normalizedId = normalizeSplitTabId(splitTabId.value, currentFile.value?.id, tabs.value)
    if (normalizedId && normalizedId !== splitTabId.value) {
      layoutStore.SET_SPLIT_TAB(normalizedId)
    } else if (!splitTabId.value && nextId) {
      layoutStore.SET_SPLIT_TAB(nextId)
    }
  },
  { immediate: true }
)

const activateSecondary = (): void => {
  const state = promoteSplitTab(currentFile.value?.id, secondaryFile.value?.id, tabs.value)
  if (!state) return
  const nextFile = tabs.value.find((tab) => tab.id === state.primaryId)
  if (!nextFile) return
  editorStore.UPDATE_CURRENT_FILE(nextFile)
  layoutStore.SET_SPLIT_TAB(state.secondaryId)
}
</script>

<style scoped>
.editor-with-tabs {
  position: relative;
  height: 100%;
  flex: 1;
  min-width: 0;
  /* The in-flow sidebar is already accounted for by the flex parent. When
     the sidebar becomes an overlay it leaves that flow, so an explicit
     `100vw - sidebarWidth` cap would incorrectly shrink the editor. */
  display: flex;
  flex-direction: column;

  overflow: hidden;
  background: var(--editorBgColor);
  & > .container {
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
}

.primary-editor-pane {
  display: flex;
  flex: 1 1 50%;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.primary-editor-pane > :deep(.editor-wrapper),
.primary-editor-pane > :deep(.source-code),
.primary-editor-pane > .degraded-editor-component {
  min-width: 0;
  min-height: 0;
}

.degraded-editor-component {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.degraded-editor-component > :deep(.source-code) {
  flex: 1;
  min-height: 0;
}

.degraded-editor-notice {
  flex: 0 0 auto;
  padding: var(--space-2) var(--space-4);
  color: var(--text-tertiary);
  background: var(--surface-chrome);
  border-bottom: 1px solid var(--border-subtle);
  font-size: var(--font-size-shortcut);
}

.is-split .primary-editor-pane {
  flex-basis: 50%;
}
</style>
