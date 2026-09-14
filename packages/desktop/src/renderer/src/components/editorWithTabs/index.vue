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
          :markdown="markdown"
          :cursor="cursor"
          :text-direction="textDirection"
          :platform="platform"
        />
        <source-code
          v-if="sourceCode"
          :markdown="markdown"
          :muya-index-cursor="muyaIndexCursor"
          :text-direction="textDirection"
        />
      </div>
      <split-document-pane
        v-if="splitActive && secondaryFile"
        :file="secondaryFile"
        :text-direction="textDirection"
        @activate="activateSecondary"
      />
    </div>
    <tab-notifications />
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, watch } from 'vue'
import Editor from './editor.vue'
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

defineProps<{
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
.primary-editor-pane > :deep(.source-code) {
  min-width: 0;
  min-height: 0;
}

.is-split .primary-editor-pane {
  flex-basis: 50%;
}
</style>
