<template>
  <div
    class="editor-with-tabs"
    :class="{ 'is-split': splitActive }"
    data-testid="editor-with-tabs"
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
const { currentFile, tabs, tabLifecycle } = storeToRefs(editorStore)
const { splitEditor, splitTabId } = storeToRefs(layoutStore)

const isExtremeDocument = computed(() => shouldUseDegradedLargeDocumentMode(props.markdown))
const degradedEditorRef = ref<HTMLElement | null>(null)
let degradedPerformanceGeneration = 0

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
  if (isExtremeDocument.value) beginDegradedEditorPerformance()
})

onBeforeUnmount(() => {
  degradedPerformanceGeneration += 1
  bus.off('file-loaded', handleFileLoaded)
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
