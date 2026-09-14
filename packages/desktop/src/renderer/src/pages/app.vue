<template>
  <div class="editor-container">
    <title-bar
      :project="projectTree"
      :pathname="pathname"
      :filename="filename"
      :active="windowActive"
      :word-count="wordCount"
      :platform="platform"
      :is-saved="isSaved"
    />

    <!--
      Tabs are application chrome, not editor content. Keeping this row beside
      the workspace makes it span the sidebar and the writing surface, which is
      the stable shell shown in the reference design.
    -->
    <div
      v-if="hasCurrentFile && init"
      v-show="showTabBar"
      class="document-tabs-row"
      data-testid="document-tabs-row"
    >
      <tabs />
    </div>

    <div class="editor-workspace">
      <side-bar v-if="init" />

      <div class="editor-middle">
        <div
          v-if="!init"
          class="editor-placeholder"
        />
        <recent v-if="!hasCurrentFile && init" />
        <editor-with-tabs
          v-if="hasCurrentFile && init"
          :markdown="markdown"
          :cursor="cursor"
          :muya-index-cursor="muyaIndexCursor"
          :source-code="sourceCode"
          :text-direction="textDirection"
          :platform="platform"
        />
      </div>
    </div>

    <command-palette />
    <about-dialog />
    <export-setting-dialog />
    <rename />
    <import-modal />
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
  ref,
  defineAsyncComponent
} from 'vue'
import { useMainStore } from '@/store'
import { storeToRefs } from 'pinia'
import { addStyles, addThemeStyle, addCustomStyle, type AddStylesOptions } from '@/util/theme'
import Recent from '@/components/recent/index.vue'
import EditorWithTabs from '@/components/editorWithTabs/index.vue'
import Tabs from '@/components/editorWithTabs/tabs.vue'
import TitleBar from '@/components/titleBar/index.vue'
import SideBar from '@/components/sideBar/index.vue'
import bus from '@/bus'
import { DEFAULT_STYLE } from '@/config'
import { useLayoutStore } from '@/store/layout'
import { useListenForMainStore } from '@/store/listenForMain'
import { usePreferencesStore } from '@/store/preferences'
import { useEditorStore } from '@/store/editor'
import { useCommandCenterStore } from '@/store/commandCenter'
import { useProjectStore } from '@/store/project'
import { useRecentDocumentsStore } from '@/store/recentDocuments'
import { useNotificationStore } from '@/store/notification'
import { rendererPerformance } from '@/services/performance/runtime'

const AboutDialog = defineAsyncComponent(() => import('@/components/about/index.vue'))
const CommandPalette = defineAsyncComponent(() => import('@/components/commandPalette/index.vue'))
const ExportSettingDialog = defineAsyncComponent(
  () => import('@/components/exportSettings/index.vue')
)
const Rename = defineAsyncComponent(() => import('@/components/rename/index.vue'))
const ImportModal = defineAsyncComponent(() => import('@/components/import/index.vue'))

const mainStore = useMainStore()
const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()
const layoutStore = useLayoutStore()
const projectStore = useProjectStore()
const recentDocumentsStore = useRecentDocumentsStore()
const listenForMainStore = useListenForMainStore()
const commandCenterStore = useCommandCenterStore()
const notificationStore = useNotificationStore()

const timer = ref<ReturnType<typeof setTimeout> | null>(null)

const { windowActive, platform, init } = storeToRefs(mainStore)
const { showTabBar } = storeToRefs(layoutStore)
const { sourceCode, theme, customCss, textDirection, zoom } = storeToRefs(preferencesStore)
const { projectTree } = storeToRefs(projectStore)
const { currentFile } = storeToRefs(editorStore)

const pathname = computed(() => currentFile.value?.pathname)
const filename = computed(() => currentFile.value?.filename)
const isSaved = computed(() => currentFile.value?.isSaved)
const markdown = computed<string>(() => currentFile.value?.markdown ?? '')
const cursor = computed(() => currentFile.value?.cursor)
const wordCount = computed(() => currentFile.value?.wordCount)
const muyaIndexCursor = computed<Record<string, unknown> | undefined>(
  () => currentFile.value?.muyaIndexCursor as Record<string, unknown> | undefined
)
const hasCurrentFile = computed<boolean>(() => currentFile.value?.markdown !== undefined)

watch(theme, (value, oldValue) => {
  if (value !== oldValue) addThemeStyle(value)
})
watch(customCss, (value, oldValue) => {
  if (value !== oldValue) addCustomStyle({ customCss: value })
})
watch(zoom, (zoomValue) => bus.emit('mt::window-zoom', zoomValue))

const handleDragOver = (e: DragEvent): void => {
  if (!e.dataTransfer || !e.dataTransfer.types.length) return

  if (e.dataTransfer.types.indexOf('Files') >= 0) {
    if (e.dataTransfer.items.length === 1 && e.dataTransfer.items[0]!.type.indexOf('image') > -1) {
      return
    }

    e.preventDefault()
    if (timer.value) clearTimeout(timer.value)
    timer.value = setTimeout(() => {
      bus.emit('importDialog', false)
      timer.value = null
    }, 300)
    bus.emit('importDialog', true)
    e.dataTransfer.dropEffect = 'copy'
  } else if (e.dataTransfer.types.indexOf('text/uri-list') < 0) {
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'none'
  }
}

onMounted(async () => {
  rendererPerformance.mark('editor_shell_mounted', { phase: 'startup' })
  void recentDocumentsStore.HYDRATE()

  if (window.inkiva?.initialState) {
    preferencesStore.SET_USER_PREFERENCE(window.inkiva.initialState)
  }

  mainStore.LISTEN_WIN_STATUS()

  // These two listeners are part of the renderer's startup handshake. Register
  // them before loading the command catalogue because that async work can be
  // slow on a cold machine; otherwise the main process may send bootstrap or
  // close messages into a gap with no listener attached.
  editorStore.LISTEN_FOR_CLOSE()
  editorStore.LISTEN_FOR_BOOTSTRAP_WINDOW()
  editorStore.LISTEN_FOR_STATE_REPLACE()

  await commandCenterStore.LISTEN_COMMAND_CENTER_BUS()
  layoutStore.LISTEN_FOR_LAYOUT()
  listenForMainStore.LISTEN_FOR_EDIT()
  preferencesStore.LISTEN_FOR_VIEW()
  listenForMainStore.LISTEN_FOR_SHOW_DIALOG()
  listenForMainStore.LISTEN_FOR_PARAGRAPH_INLINE_STYLE()
  projectStore.LISTEN_FOR_UPDATE_PROJECT()
  projectStore.LISTEN_FOR_LOAD_PROJECT()
  projectStore.LISTEN_FOR_SIDEBAR_CONTEXT_MENU()
  preferencesStore.ASK_FOR_USER_PREFERENCE()
  preferencesStore.LISTEN_TOGGLE_VIEW()
  editorStore.LISTEN_SCREEN_SHOT()
  editorStore.LISTEN_FOR_UPDATE_PREFLIGHT()
  editorStore.LISTEN_FOR_SAVE_AS()
  editorStore.LISTEN_FOR_MOVE_TO()
  editorStore.LISTEN_FOR_SAVE()
  editorStore.LISTEN_FOR_SET_PATHNAME()
  editorStore.LISTEN_FOR_SAVE_CLOSE()
  editorStore.LISTEN_FOR_RENAME()
  editorStore.LISTEN_FOR_SET_LINE_ENDING()
  editorStore.LISTEN_FOR_SET_ENCODING()
  editorStore.LISTEN_FOR_SET_FINAL_NEWLINE()
  editorStore.LISTEN_FOR_NEW_TAB()
  editorStore.LISTEN_FOR_CLOSE_TAB()
  editorStore.LISTEN_FOR_TAB_CYCLE()
  editorStore.LISTEN_FOR_SWITCH_TABS()
  editorStore.LISTEN_FOR_PRINT_SERVICE_CLEARUP()
  editorStore.LISTEN_FOR_EXPORT_SUCCESS()
  editorStore.LISTEN_FOR_FILE_CHANGE()
  editorStore.LISTEN_WINDOW_ZOOM()
  editorStore.LISTEN_FOR_RELOAD_IMAGES()
  editorStore.LISTEN_FOR_CONTEXT_MENU()

  notificationStore.listenForNotification()
  window.addEventListener('dragover', handleDragOver, false)

  nextTick(() => {
    const initial = window.inkiva?.initialState
    const style: AddStylesOptions = {
      theme: initial?.theme ?? DEFAULT_STYLE.theme,
      codeFontFamily: initial?.codeFontFamily ?? DEFAULT_STYLE.codeFontFamily,
      codeFontSize: initial?.codeFontSize ?? DEFAULT_STYLE.codeFontSize,
      hideScrollbar: initial?.hideScrollbar ?? DEFAULT_STYLE.hideScrollbar
    }
    addStyles(style)
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('dragover', handleDragOver, false)
  if (timer.value) {
    clearTimeout(timer.value)
    timer.value = null
  }
})
</script>

<style scoped>
.editor-placeholder,
.editor-container {
  display: flex;
  flex-direction: column;
  position: absolute;
  width: 100vw;
  height: 100vh;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}
.editor-container .hide {
  z-index: -1;
  opacity: 0;
  position: absolute;
  left: -10000px;
}
.editor-placeholder {
  flex: 1;
  background: var(--editorBgColor);
}
.document-tabs-row {
  display: flex;
  flex: 0 0 var(--documentTabsHeight);
  width: 100%;
  height: var(--documentTabsHeight);
  min-width: 0;
  box-sizing: border-box;
  overflow: hidden;
  background: var(--surface-chrome);
  border-bottom: 1px solid var(--border-subtle);
}

.document-tabs-row > :deep(.editor-tabs) {
  flex: 1 1 auto;
  width: 100%;
}

.editor-workspace {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  position: relative;
}
.editor-middle {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  position: relative;
  & > .editor {
    flex: 1;
  }
}
</style>
