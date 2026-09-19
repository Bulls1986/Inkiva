<template>
  <div class="tree-view">
    <!-- Opened tabs -->
    <div
      v-if="openedFilesInSidebar"
      class="opened-files"
    >
      <div class="title">
        <button
          type="button"
          class="tree-section-toggle"
          :aria-expanded="showOpenedFiles"
          aria-controls="opened-files-list"
          @click.stop="toggleOpenedFiles()"
        >
          <el-icon
            class="icon-arrow"
            :class="{ fold: !showOpenedFiles }"
            :size="12"
          >
            <ArrowRight />
          </el-icon>
          <span class="text-overflow">{{
            t('sideBar.tree.openedFiles')
          }}</span>
        </button>
        <button
          type="button"
          class="tree-action-button"
          :title="t('sideBar.tree.saveAll')"
          :aria-label="t('sideBar.tree.saveAll')"
          @click.stop="saveAll(false)"
        >
          <svg
            class="icon"
            aria-hidden="true"
          >
            <use xlink:href="#icon-save-all" />
          </svg>
        </button>
        <button
          type="button"
          class="tree-action-button"
          :title="t('sideBar.tree.closeAll')"
          :aria-label="t('sideBar.tree.closeAll')"
          @click.stop="saveAll(true)"
        >
          <svg
            class="icon"
            aria-hidden="true"
          >
            <use xlink:href="#icon-close-all" />
          </svg>
        </button>
      </div>
      <div
        v-show="showOpenedFiles"
        id="opened-files-list"
        class="opened-files-list"
      >
        <transition-group name="list">
          <opened-file
            v-for="tab of tabs"
            :key="tab.id"
            :file="tab"
          />
        </transition-group>
      </div>
    </div>

    <!-- Project tree view -->
    <div
      v-if="projectTree"
      class="project-tree"
    >
      <div
        class="title"
        @contextmenu.prevent="handleRootContextMenu"
      >
        <button
          type="button"
          class="tree-section-toggle"
          :aria-expanded="showDirectories"
          aria-controls="project-tree-content"
          @click.stop="toggleDirectories()"
        >
          <el-icon
            class="icon-arrow"
            :class="{ fold: !showDirectories }"
            :size="12"
          >
            <ArrowRight />
          </el-icon>
          <span class="text-overflow">{{
            projectTree.name
          }}</span>
        </button>
      </div>
      <div
        v-show="showDirectories"
        id="project-tree-content"
        class="tree-wrapper"
      >
        <virtualized-tree
          v-if="isVirtualizedTree"
          :project-tree="projectTree"
          :collapsed-paths="collapsedPaths"
          :expanded-paths="expandedPaths"
          @folder-toggle="handleFolderToggle"
        />
        <template v-else>
          <folder
            v-for="folder of projectTree.folders"
            :key="folder.id"
            :folder="folder"
            :depth="depth"
            :collapsed-paths="collapsedPaths"
            :expanded-paths="expandedPaths"
            @folder-toggle="handleFolderToggle"
          />
          <input
            v-show="createCacheDirname === projectTree.pathname"
            ref="input"
            v-model="createName"
            placeholder="Enter .md file name"
            type="text"
            class="new-input"
            :style="{ 'margin-left': `${depth * 5 + 15}px` }"
            @keypress.enter="handleInputEnter"
          >
          <file
            v-for="file of projectTree.files"
            :key="file.id"
            :file="file"
            :depth="depth"
          />
          <div
            v-if="
              projectTree.files.length === 0 &&
                projectTree.folders.length === 0 &&
                createCacheDirname !== projectTree.pathname
            "
            class="empty-project"
          >
            <span>{{ t('sideBar.tree.emptyProject') }}</span>
            <div class="centered-group">
              <button
                class="button-primary"
                @click.stop="createFile"
              >
                {{ t('sideBar.tree.createFile') }}
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>
    <div
      v-else
      class="open-project"
    >
      <div class="centered-group">
        <el-button
          text
          bg
          type="primary"
          @click="openFolder"
        >
          {{ t('sideBar.tree.openFolder') }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useProjectStore } from '@/store/project'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import Folder from './treeFolder.vue'
import File from './treeFile.vue'
import VirtualizedTree from './treeVirtualized.vue'
import OpenedFile from './treeOpenedTab.vue'
import bus from '../../bus'
import { showContextMenu } from '../../contextMenu/sideBar'
import { useI18n } from 'vue-i18n'
import { ArrowRight } from '@element-plus/icons-vue'
import { hasMoreThanTreeRows } from '@/util/treeVirtualization'
import type { TreeNode, TabDescriptor } from './types'
import { attachSidebarGlobalListeners } from './globalListeners'

const { t } = useI18n()

const props = defineProps<{
  // The project store seeds `projectTree` as `null` until a folder is
  // opened; the template renders the "open project" empty-state behind
  // `v-if="projectTree"`. Type the prop nullable to match runtime + the
  // template guard.
  projectTree: TreeNode | null
  openedFiles?: TabDescriptor[]
  tabs?: TabDescriptor[]
}>()

const depth = 0
const collapsedPaths = ref<Set<string>>(new Set())
const expandedPaths = ref<Set<string>>(new Set())

const isVirtualizedTree = computed(() =>
  props.projectTree !== null &&
  hasMoreThanTreeRows(props.projectTree, 300, collapsedPaths.value, expandedPaths.value)
)
// Persist the section collapse state (#2421). The tree is rendered under a
// v-if and is destroyed when the sidebar is closed, so local refs reset to
// expanded on re-open. Back them with localStorage (like the sidebar width)
// so the state survives a re-mount and app restart.
const SHOW_DIRECTORIES_KEY = 'side-bar-show-directories'
const SHOW_OPENED_FILES_KEY = 'side-bar-show-opened-files'
const readSectionExpanded = (key: string): boolean => localStorage.getItem(key) !== 'false'
const showDirectories = ref(readSectionExpanded(SHOW_DIRECTORIES_KEY))
const showOpenedFiles = ref(readSectionExpanded(SHOW_OPENED_FILES_KEY))
const createName = ref('')
const input = ref<HTMLInputElement | null>(null)
let removeGlobalListeners: (() => void) | null = null

const projectStore = useProjectStore()
const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()

// Computed properties
const { createCache } = storeToRefs(projectStore)
const { clipboard } = storeToRefs(projectStore)
const { openedFilesInSidebar } = storeToRefs(preferencesStore)

// The createCache state is `{ dirname, type }` while an input is shown, and
// `{}` otherwise. Expose a typed accessor for the template so we don't have
// to thread `as any` through every comparison.
const createCacheDirname = computed<string | undefined>(() => {
  const cache = createCache.value as { dirname?: string }
  return cache.dirname
})

// Folder expansion is shared by the regular and virtualized renderers so a
// large branch can cross the virtualization threshold without losing state.
const handleFolderToggle = (pathname: string, collapsed: boolean): void => {
  const nextCollapsed = new Set(collapsedPaths.value)
  const nextExpanded = new Set(expandedPaths.value)
  if (collapsed) {
    nextCollapsed.add(pathname)
    nextExpanded.delete(pathname)
  } else {
    nextCollapsed.delete(pathname)
    nextExpanded.add(pathname)
  }
  collapsedPaths.value = nextCollapsed
  expandedPaths.value = nextExpanded
}

// Methods
const openFolder = (): void => {
  projectStore.ASK_FOR_OPEN_PROJECT()
}

const saveAll = (isClose: boolean): void => {
  editorStore.ASK_FOR_SAVE_ALL(isClose)
}

const createFile = (): void => {
  projectStore.CHANGE_ACTIVE_ITEM(props.projectTree)
  bus.emit('SIDEBAR::new', 'file')
}

const handleRootContextMenu = (event: MouseEvent): void => {
  projectStore.CHANGE_ACTIVE_ITEM(props.projectTree)
  showContextMenu(event, !!clipboard.value)
}

const toggleOpenedFiles = (): void => {
  showOpenedFiles.value = !showOpenedFiles.value
  localStorage.setItem(SHOW_OPENED_FILES_KEY, String(showOpenedFiles.value))
}

const toggleDirectories = (): void => {
  showDirectories.value = !showDirectories.value
  localStorage.setItem(SHOW_DIRECTORIES_KEY, String(showDirectories.value))
}

// From createFileOrDirectoryMixins
const handleInputFocus = (): void => {
  nextTick(() => {
    if (input.value) {
      input.value.focus()
      createName.value = ''
    }
  })
}

const handleInputEnter = (): void => {
  projectStore.CREATE_FILE_DIRECTORY(createName.value)
}

const handleDocumentClick = (event: Event): void => {
  const target = event.target as HTMLElement | null
  if (target && target.tagName !== 'INPUT') {
    projectStore.CHANGE_ACTIVE_ITEM({})
    projectStore.createCache = {}
    projectStore.renameCache = null
  }
}

const handleDocumentContextMenu = (event: Event): void => {
  const target = event.target as HTMLElement | null
  if (target && target.tagName !== 'INPUT') {
    projectStore.createCache = {}
    projectStore.renameCache = null
  }
}

const handleDocumentKeydown = (event: Event): void => {
  if ((event as KeyboardEvent).key === 'Escape') {
    projectStore.createCache = {}
    projectStore.renameCache = null
  }
}

onMounted(() => {
  bus.on('SIDEBAR::show-new-input', handleInputFocus)
  removeGlobalListeners = attachSidebarGlobalListeners(document, {
    click: handleDocumentClick,
    contextmenu: handleDocumentContextMenu,
    keydown: handleDocumentKeydown
  })
})

onBeforeUnmount(() => {
  bus.off('SIDEBAR::show-new-input', handleInputFocus)
  removeGlobalListeners?.()
  removeGlobalListeners = null
})
</script>

<style scoped>
.list-item {
  display: inline-block;
  margin-right: 10px;
}

.list-enter-active,
.list-leave-active {
  transition: opacity var(--motion-normal), transform var(--motion-normal);
}
.list-enter, .list-leave-to
  /* .list-leave-active for below version 2.1.8 */ {
  opacity: 0;
  transform: translateX(-50px);
}
.tree-view {
  font-size: 14px;
  color: var(--text-secondary);
  display: flex;
  flex-direction: column;
  height: 100%;
}
.tree-view > .title {
  height: 35px;
  line-height: 35px;
  padding: 0 15px;
  display: flex;
  flex-shrink: 0;
  flex-direction: row-reverse;
}

.icon-arrow {
  margin-right: 5px;
  transition: transform var(--motion-normal);
  transform: rotate(90deg);
  color: var(--icon-secondary);
  cursor: pointer;
}

.icon-arrow.fold {
  transform: rotate(0);
}

.opened-files > .title,
.project-tree > .title {
  height: 30px;
  line-height: 30px;
  font-size: 14px;
}

.opened-files .title {
  padding-right: 15px;
  display: flex;
  align-items: center;
  gap: 2px;
}

.tree-section-toggle {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  padding: 0;
  color: inherit;
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.tree-section-toggle:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.tree-section-toggle > span {
  flex: 1;
  min-width: 0;
}

.tree-action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  margin-left: 2px;
  padding: 0;
  opacity: 0;
  pointer-events: none;
  color: var(--icon-secondary);
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.tree-action-button:focus-visible {
  opacity: 1;
  pointer-events: auto;
  outline: none;
  box-shadow: var(--focus-ring);
}

.tree-action-button:hover {
  opacity: 1;
  pointer-events: auto;
  color: var(--icon-primary);
}

.opened-files .title:hover > .tree-action-button {
  opacity: 1;
  pointer-events: auto;
}

.tree-action-button > svg {
  width: 16px;
  height: 16px;
  fill: currentColor;
}
.opened-files {
  display: flex;
  flex-direction: column;
}
.default-cursor {
  cursor: pointer;
}
.opened-files .opened-files-list {
  max-height: 112px;
  overflow: auto;
  flex: 1;
}

.opened-files .opened-files-list::-webkit-scrollbar:vertical {
  width: 8px;
}

.project-tree {
  display: flex;
  flex-direction: column;
  overflow: auto;
  flex: 1;
}

.project-tree > .title {
  padding-right: 15px;
  display: flex;
  align-items: center;
}

.project-tree > .tree-wrapper {
  overflow: auto;
  flex: 1;
}

.project-tree > .tree-wrapper::-webkit-scrollbar:vertical {
  width: 8px;
}
.open-project {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  align-items: center;
  padding-bottom: 100px;
}

.open-project .centered-group {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.open-project .el-button {
  margin-top: 20px;
}
.open-project .el-button.is-text.is-has-bg,
.empty-project .el-button.is-text.is-has-bg {
  background-color: var(--buttonPrimaryBgColor);
  color: var(--buttonPrimaryFontColor);
  border-color: transparent;
  box-shadow: none;
  transition: background-color var(--motion-fast), color var(--motion-fast);
}
.open-project .el-button.is-text.is-has-bg:hover,
.open-project .el-button.is-text.is-has-bg:focus-visible,
.empty-project .el-button.is-text.is-has-bg:hover,
.empty-project .el-button.is-text.is-has-bg:focus-visible {
  background-color: var(--buttonPrimaryBgColorHover);
  color: var(--buttonPrimaryFontColorHover);
}
.new-input {
  height: 22px;
  margin: 5px 0;
  padding: 0 6px;
  color: var(--text-primary);
  border: 1px solid var(--border-default);
  background: var(--surface-editor);
  width: calc(100% - 20px);
  border-radius: var(--radius-sm);
  transition: border-color var(--motion-fast), background-color var(--motion-fast);
}

.new-input:focus {
  border-color: var(--border-focus);
}

.new-input:focus-visible {
  outline: 2px solid var(--color-accent-focus);
  outline-offset: 1px;
}
.tree-wrapper {
  position: relative;
}
.empty-project {
  font-size: 14px;
  display: flex;
  flex-direction: column;
  padding-top: 40px;
  align-items: center;
  color: var(--text-secondary);
  & button {
    margin-top: 10px;
  }
}

.empty-project > a {
  color: var(--color-accent);
  text-align: center;
  margin-top: 15px;
  text-decoration: none;
}
.bold {
  font-weight: 600;
}
</style>
