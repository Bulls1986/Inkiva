<template>
  <div
    ref="viewport"
    class="tree-virtual-viewport"
    @scroll="handleScroll"
  >
    <div
      class="tree-virtual-spacer"
      :style="{ height: `${windowState.totalHeight}px` }"
    >
      <div
        class="tree-virtual-window"
        :style="{ transform: `translateY(${windowState.offsetTop}px)` }"
      >
        <template
          v-for="row in visibleRows"
          :key="row.key"
        >
          <div
            v-if="row.kind === 'folder'"
            class="side-bar-folder virtual-tree-row"
            :data-path="row.node.pathname"
          >
            <div
              class="folder-name"
              :style="{ paddingLeft: `${row.depth * 6 + 10}px` }"
              role="button"
              tabindex="0"
              :title="row.node.pathname"
              :aria-label="row.node.name"
              :aria-expanded="!isFolderCollapsed(row.node)"
              @click="toggleFolder(row.node)"
              @keydown="handleFolderKeydown($event, row.node)"
              @contextmenu.prevent="handleContextMenu($event, row.node)"
            >
              <el-icon
                class="icon-arrow"
                :class="{ fold: isFolderCollapsed(row.node) }"
                :size="12"
              >
                <ArrowRight />
              </el-icon>
              <input
                v-if="renameCache === row.node.pathname"
                ref="renameInput"
                v-model="renameName"
                type="text"
                class="rename"
                @click.stop
                @keypress.enter="rename"
              >
              <span
                v-else
                class="text-overflow"
              >{{ row.node.name }}</span>
            </div>
          </div>
          <div
            v-else-if="row.kind === 'file'"
            class="side-bar-file virtual-tree-row"
            :data-path="row.node.pathname"
            role="button"
            tabindex="0"
            :title="row.node.pathname"
            :aria-label="row.node.name"
            :aria-current="currentFile?.pathname === row.node.pathname ? 'page' : undefined"
            :aria-disabled="row.node.isMarkdown ? undefined : 'true'"
            :style="{
              paddingLeft: `${row.depth * 6 + 10}px`,
              opacity: row.node.isMarkdown ? 1 : 0.75
            }"
            @click="handleFileClick(row.node)"
            @keydown="handleFileKeydown($event, row.node)"
            @contextmenu.prevent="handleContextMenu($event, row.node)"
          >
            <file-icon :name="row.node.name" />
            <input
              v-if="renameCache === row.node.pathname"
              ref="renameInput"
              v-model="renameName"
              type="text"
              class="rename"
              @click.stop
              @keypress.enter="rename"
            >
            <span v-else>{{ row.node.name }}</span>
          </div>
          <div
            v-else
            class="new-input-row"
            :style="{ paddingLeft: `${row.depth * 6 + 10}px` }"
          >
            <input
              ref="createInput"
              v-model="createName"
              type="text"
              class="new-input"
              placeholder="Enter .md file name"
              @keypress.enter="create"
            >
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useProjectStore } from '@/store/project'
import { useEditorStore } from '@/store/editor'
import { calculateVirtualWindow } from '@/util/virtualization'
import {
  flattenTreeRows,
  type VirtualTreeRow
} from '@/util/treeVirtualization'
import { ArrowRight } from '@element-plus/icons-vue'
import FileIcon from './icon.vue'
import bus from '../../bus'
import { showContextMenu } from '../../contextMenu/sideBar'
import type { TreeFileNode, TreeFolderNode, TreeNode } from './types'

const props = defineProps<{
  projectTree: TreeNode
}>()

const ROW_HEIGHT = 30
const DEFAULT_VIEWPORT_HEIGHT = 600

interface CreateRow {
  kind: 'create'
  key: string
  depth: number
  pathname: string
}

type DisplayRow = VirtualTreeRow | CreateRow

const projectStore = useProjectStore()
const editorStore = useEditorStore()
const { renameCache, createCache, activeItem, clipboard } = storeToRefs(projectStore)
const { currentFile, tabs } = storeToRefs(editorStore)

const viewport = ref<HTMLDivElement | null>(null)
const scrollTop = ref(0)
const viewportHeight = ref(DEFAULT_VIEWPORT_HEIGHT)
const collapsedPaths = ref<Set<string>>(new Set())
const expandedPaths = ref<Set<string>>(new Set())
const renameName = ref('')
const createName = ref('')
const renameInput = ref<HTMLInputElement | null>(null)
const createInput = ref<HTMLInputElement | null>(null)

const isFolderCollapsed = (folder: TreeFolderNode): boolean =>
  collapsedPaths.value.has(folder.pathname) ||
  (folder.isCollapsed === true && !expandedPaths.value.has(folder.pathname))

const rows = computed<DisplayRow[]>(() => {
  const result: DisplayRow[] = []
  const createPath = (createCache.value as { dirname?: string }).dirname
  for (const row of flattenTreeRows(props.projectTree, collapsedPaths.value, expandedPaths.value)) {
    result.push(row)
    if (
      row.kind === 'folder' &&
      row.node.pathname === createPath &&
      !isFolderCollapsed(row.node)
    ) {
      result.push({
        kind: 'create',
        key: 'create:' + row.node.pathname,
        depth: row.depth + 1,
        pathname: row.node.pathname
      })
    }
  }
  return result
})

const windowState = computed(() =>
  calculateVirtualWindow(
    rows.value.length,
    ROW_HEIGHT,
    scrollTop.value,
    viewportHeight.value
  )
)
const visibleRows = computed(() =>
  rows.value.slice(windowState.value.startIndex, windowState.value.endIndex)
)

const updateViewportHeight = (): void => {
  const height = viewport.value?.clientHeight ?? 0
  if (height > 0) viewportHeight.value = height
}

const handleScroll = (event: Event): void => {
  scrollTop.value = (event.currentTarget as HTMLElement).scrollTop
}

const toggleFolder = (folder: TreeFolderNode): void => {
  const nextCollapsed = new Set(collapsedPaths.value)
  const nextExpanded = new Set(expandedPaths.value)
  if (isFolderCollapsed(folder)) {
    nextCollapsed.delete(folder.pathname)
    nextExpanded.add(folder.pathname)
  } else {
    nextCollapsed.add(folder.pathname)
    nextExpanded.delete(folder.pathname)
  }
  collapsedPaths.value = nextCollapsed
  expandedPaths.value = nextExpanded
}

const handleFolderKeydown = (event: KeyboardEvent, folder: TreeFolderNode): void => {
  if (event.target !== event.currentTarget) return
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  toggleFolder(folder)
}

const handleFileClick = (file: TreeFileNode): void => {
  if (!file.isMarkdown) return
  const openedTab = tabs.value.find((tab) => window.fileUtils.isSamePathSync(tab.pathname, file.pathname))
  if (openedTab) {
    if (currentFile.value?.pathname === openedTab.pathname) return
    editorStore.UPDATE_CURRENT_FILE(openedTab)
  } else {
    window.electron.ipcRenderer.send('mt::open-file', file.pathname, {})
  }
}

const handleFileKeydown = (event: KeyboardEvent, file: TreeFileNode): void => {
  if (event.target !== event.currentTarget) return
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  handleFileClick(file)
}

const handleContextMenu = (event: MouseEvent, node: TreeFolderNode | TreeFileNode): void => {
  projectStore.CHANGE_ACTIVE_ITEM(node)
  showContextMenu(event, !!clipboard.value)
}

const focusRenameInput = (): void => {
  nextTick(() => {
    const element = renameInput.value
    if (element) {
      element.focus()
      renameName.value = String(activeItem.value?.name ?? '')
    }
  })
}

const rename = (): void => {
  if (renameName.value) projectStore.RENAME_IN_SIDEBAR(renameName.value)
}

const focusCreateInput = (): void => {
  const dirname = (createCache.value as { dirname?: string }).dirname
  if (!dirname) return
  const folder = rows.value.find(
    (row): row is VirtualTreeRow & { kind: 'folder' } =>
      row.kind === 'folder' && row.node.pathname === dirname
  )
  if (folder && isFolderCollapsed(folder.node)) toggleFolder(folder.node)
  nextTick(() => createInput.value?.focus())
}

const create = (): void => {
  void projectStore.CREATE_FILE_DIRECTORY(createName.value)
}

onMounted(() => {
  updateViewportHeight()
  window.addEventListener('resize', updateViewportHeight)
  bus.on('SIDEBAR::show-rename-input', focusRenameInput)
  bus.on('SIDEBAR::show-new-input', focusCreateInput)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateViewportHeight)
  bus.off('SIDEBAR::show-rename-input', focusRenameInput)
  bus.off('SIDEBAR::show-new-input', focusCreateInput)
})

watch(
  () => props.projectTree,
  () => {
    scrollTop.value = 0
    viewport.value?.scrollTo({ top: 0 })
  }
)
</script>

<style scoped>
.tree-virtual-viewport {
  min-height: 0;
  height: 100%;
  overflow: auto;
  contain: strict;
}

.tree-virtual-spacer {
  position: relative;
  width: 100%;
}

.tree-virtual-window {
  position: absolute;
  inset-inline: 0;
  top: 0;
  will-change: transform;
}

.virtual-tree-row {
  box-sizing: border-box;
  height: 30px;
  margin-inline: 6px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  user-select: none;
}

.virtual-tree-row .folder-name {
  display: flex;
  align-items: center;
  height: 30px;
  padding-right: 15px;
  cursor: default;
}

.virtual-tree-row .icon-arrow {
  flex: 0 0 auto;
  margin-right: 5px;
  color: var(--icon-secondary);
  transition: transform var(--motion-normal);
  transform: rotate(90deg);
}

.virtual-tree-row .icon-arrow.fold {
  transform: rotate(0);
}

.virtual-tree-row:hover {
  background: var(--surface-hover);
}

.virtual-tree-row:focus-visible,
.virtual-tree-row .folder-name:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.virtual-tree-row > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.virtual-tree-row .file-icon {
  flex: 0 0 auto;
}

.new-input-row {
  height: 30px;
  box-sizing: border-box;
}

.new-input-row .new-input {
  box-sizing: border-box;
  width: calc(100% - 20px);
  height: 24px;
  margin: 3px 6px;
  padding: 0 6px;
  color: var(--text-primary);
  border: 1px solid var(--border-default);
  background: var(--surface-editor);
  border-radius: var(--radius-sm);
}
</style>
