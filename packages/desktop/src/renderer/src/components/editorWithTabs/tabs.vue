<template>
  <div
    class="editor-tabs"
    data-testid="document-tabs"
  >
    <div
      ref="tabContainer"
      class="scrollable-tabs"
    >
      <ul
        ref="tabDropContainer"
        class="tabs-container"
        role="tablist"
        :aria-label="t('sideBar.tree.openedFiles')"
      >
        <li
          v-for="file of tabs"
          :key="file.id"
          :title="file.pathname"
          :class="{ active: currentFile?.id === file.id, unsaved: !file.isSaved, pinned: pinnedTabIds.includes(file.id) }"
          :data-id="file.id"
          :data-tab-lifecycle="tabLifecycles[file.id] ?? 'cold'"
          :data-pinned="pinnedTabIds.includes(file.id)"
          role="tab"
          :aria-selected="currentFile?.id === file.id"
          :tabindex="currentFile?.id === file.id ? 0 : -1"
          @click.stop="selectFile(file)"
          @keydown="handleTabKeydown($event, file)"
          @click.middle="closeTab(file.id)"
          @contextmenu.prevent="handleContextMenu($event, file)"
        >
          <span
            v-if="pinnedTabIds.includes(file.id)"
            class="pinned-indicator"
            :aria-label="t('contextMenu.tabs.pinned')"
          >
            <el-icon :size="12">
              <Paperclip />
            </el-icon>
          </span>
          <span class="tab-filename">{{ file.filename }}</span>
          <span class="unsaved-dot" />
          <button
            type="button"
            class="close-icon"
            :aria-label="t('contextMenu.tabs.close') + ' ' + file.filename"
            @click.stop="removeFileInTab(file)"
          >
            <el-icon :size="12">
              <Close />
            </el-icon>
          </button>
        </li>
      </ul>
    </div>
    <button
      type="button"
      class="new-file"
      :aria-label="t('menu.file.newTab')"
      @click.stop="newFile()"
    >
      <el-icon :size="16">
        <Plus />
      </el-icon>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useEditorStore } from '@/store/editor'
import { useLayoutStore } from '@/store/layout'
import { storeToRefs } from 'pinia'
import autoScroll from 'dom-autoscroller'
import dragula from 'dragula'
import { Plus, Close, Paperclip } from '@element-plus/icons-vue'
import { showContextMenu } from '../../contextMenu/tabs'
import { useI18n } from 'vue-i18n'
import bus from '../../bus'
import type { IFileState } from '@shared/types/files'

const editorStore = useEditorStore()
const layoutStore = useLayoutStore()
const { t } = useI18n()

const { currentFile, tabs, tabLifecycle: tabLifecycles, pinnedTabIds, closedTabs } = storeToRefs(editorStore)

interface AutoScroller {
  readonly down: boolean
  destroy: (forceCleanAnimation?: boolean) => void
}

const tabContainer = ref<HTMLElement | null>(null)
const tabDropContainer = ref<HTMLElement | null>(null)
let autoScroller: AutoScroller | null = null
let drake: dragula.Drake | null = null

// Computed properties

// Methods incorporated from tabsMixins
const selectFile = (file: IFileState) => {
  if (file.id !== currentFile.value?.id) {
    editorStore.UPDATE_CURRENT_FILE(file)
  }
}

const removeFileInTab = (file: IFileState) => {
  const { isSaved } = file
  if (isSaved) {
    editorStore.FORCE_CLOSE_TAB(file)
  } else {
    editorStore.CLOSE_UNSAVED_TAB(file)
  }
}

// Original methods
const newFile = () => {
  editorStore.NEW_UNTITLED_TAB({})
}

const handleTabKeydown = (event: KeyboardEvent, file: IFileState): void => {
  if (event.target !== event.currentTarget) return

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    selectFile(file)
    return
  }

  if (event.key === 'Delete') {
    event.preventDefault()
    removeFileInTab(file)
    return
  }

  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()

  const tabElements = Array.from(
    tabDropContainer.value?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []
  )
  const currentIndex = tabElements.indexOf(event.currentTarget as HTMLElement)
  if (currentIndex < 0 || tabElements.length < 2) return

  const direction = event.key === 'ArrowLeft' ? -1 : 1
  const nextIndex = (currentIndex + direction + tabElements.length) % tabElements.length
  tabElements[nextIndex]?.focus()
}

// Keep the active tab visible when the selection changes by something other
// than a direct click on a visible tab (keyboard cycle, switch-by-index, open
// from the sidebar): the strip has `overflow: hidden` and only scrolls on the
// wheel, so an off-screen tab would otherwise stay hidden (#3958).
const scrollActiveTabIntoView = () => {
  const container = tabContainer.value
  if (!container) return
  const activeTab = container.querySelector<HTMLElement>('li.active')
  if (!activeTab) return

  const containerRect = container.getBoundingClientRect()
  const tabRect = activeTab.getBoundingClientRect()
  if (tabRect.left < containerRect.left) {
    container.scrollLeft -= containerRect.left - tabRect.left
  } else if (tabRect.right > containerRect.right) {
    container.scrollLeft += tabRect.right - containerRect.right
  }
}

const handleTabScroll = (event: WheelEvent) => {
  // Use mouse wheel value first but prioritize X value more (e.g. touchpad input).
  let delta = event.deltaY
  if (event.deltaX !== 0) {
    delta = event.deltaX
  }

  const tabsEl = tabContainer.value
  if (!tabsEl) return
  const newLeft = Math.max(0, Math.min(tabsEl.scrollLeft + delta, tabsEl.scrollWidth))
  tabsEl.scrollLeft = newLeft
}

const closeTab = (tabId: unknown) => {
  const tab = tabs.value.find((f) => f.id === tabId)
  if (tab) {
    editorStore.CLOSE_TAB(tab)
  }
}

const closeOthers = (tabId: unknown) => {
  const tab = tabs.value.find((f) => f.id === tabId)
  if (tab) {
    editorStore.CLOSE_OTHER_TABS(tab)
  }
}

const closeRight = (tabId: unknown) => {
  const tab = tabs.value.find((f) => f.id === tabId)
  if (tab) {
    editorStore.CLOSE_RIGHT_TABS(tab)
  }
}

const togglePin = (tabId: unknown) => {
  const tab = tabs.value.find((f) => f.id === tabId)
  if (tab) {
    editorStore.TOGGLE_TAB_PIN(tab)
  }
}

const reopenClosed = () => {
  editorStore.REOPEN_CLOSED_TAB()
}

const closeSaved = () => {
  editorStore.CLOSE_SAVED_TABS()
}

const closeAll = () => {
  editorStore.CLOSE_ALL_TABS()
}

const changeMaxWidth = (width: unknown) => {
  layoutStore.CHANGE_SIDE_BAR_WIDTH(width as number)
}

const rename = (tabId: unknown) => {
  const tab = tabs.value.find((f) => f.id === tabId)
  if (tab && tab.pathname) {
    editorStore.RENAME_FILE(tab)
  }
}

const copyPath = (tabId: unknown) => {
  const tab = tabs.value.find((f) => f.id === tabId)
  if (tab && tab.pathname) {
    window.electron.clipboard.writeText(tab.pathname)
  }
}

const showInFolder = (tabId: unknown) => {
  const tab = tabs.value.find((f) => f.id === tabId)
  if (tab && tab.pathname) {
    window.electron.shell.showItemInFolder(tab.pathname)
  }
}

const handleContextMenu = (event: MouseEvent, tab: IFileState) => {
  if (tab.id) {
    showContextMenu(event, {
      id: tab.id,
      pathname: tab.pathname,
      pinned: pinnedTabIds.value.includes(tab.id),
      canReopenClosed: closedTabs.value.length > 0
    })
  }
}

watch(
  () => currentFile.value?.id,
  () => {
    nextTick(scrollActiveTabIntoView)
  }
)

onMounted(() => {
  bus.on('TABS::close-this', closeTab)
  bus.on('TABS::close-others', closeOthers)
  bus.on('TABS::close-right', closeRight)
  bus.on('TABS::toggle-pin', togglePin)
  bus.on('TABS::reopen-closed', reopenClosed)
  bus.on('TABS::close-saved', closeSaved)
  bus.on('TABS::close-all', closeAll)
  bus.on('TABS::rename', rename)
  bus.on('TABS::copy-path', copyPath)
  bus.on('TABS::show-in-folder', showInFolder)
  bus.on('EDITOR_TABS::change-max-width', changeMaxWidth)

  const tabsEl = tabContainer.value
  if (!tabsEl || !tabDropContainer.value) return

  // Allow to scroll through the tabs by mouse wheel or touchpad.
  tabsEl.addEventListener('wheel', handleTabScroll)

  // Allow tab drag and drop to reorder tabs.
  drake = dragula([tabDropContainer.value], {
    direction: 'horizontal',
    revertOnSpill: true,
    mirrorContainer: tabDropContainer.value,
    ignoreInputTextSelection: false
  }).on('drop', (el, _target, _source, sibling) => {
    // Current tab that was dropped and need to be reordered.
    const droppedId = el?.getAttribute('data-id')
    // This should be the next tab (tab | ... | el | sibling | tab | ...) but may be
    // the mirror image or null (tab | ... | el | sibling or null) if last tab.
    const nextTabId = sibling ? sibling.getAttribute('data-id') : null
    const isLastTab = !sibling || sibling.classList.contains('gu-mirror')
    if (!droppedId || (sibling && !nextTabId)) {
      console.error('Tab reorder error: invalid tab IDs')
      return
    }

    editorStore.EXCHANGE_TABS_BY_ID({
      fromId: droppedId,
      toId: isLastTab ? null : nextTabId
    })
  })

  // Scroll when dragging a tab to the beginning or end of the tab container.
  autoScroller = autoScroll([tabsEl], {
    margin: 20,
    maxSpeed: 6,
    scrollWhenOutside: false,
    autoScroll: () => {
      return autoScroller!.down && drake?.dragging
    }
  })
})

onBeforeUnmount(() => {
  const tabsEl = tabContainer.value
  if (tabsEl) {
    tabsEl.removeEventListener('wheel', handleTabScroll)
  }

  if (autoScroller) {
    // Force destroy
    autoScroller.destroy(true)
  }
  if (drake) {
    drake.destroy()
  }

  // Remove event listeners
  bus.off('TABS::close-this', closeTab)
  bus.off('TABS::close-others', closeOthers)
  bus.off('TABS::close-right', closeRight)
  bus.off('TABS::toggle-pin', togglePin)
  bus.off('TABS::reopen-closed', reopenClosed)
  bus.off('TABS::close-saved', closeSaved)
  bus.off('TABS::close-all', closeAll)
  bus.off('TABS::rename', rename)
  bus.off('TABS::copy-path', copyPath)
  bus.off('TABS::show-in-folder', showInFolder)
  bus.off('EDITOR_TABS::change-max-width', changeMaxWidth)
})
</script>

<style scoped>
.close-icon {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin: 0 2px 0 0;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
  color: var(--icon-secondary);
  transition: opacity var(--motion-fast) ease, color var(--motion-fast) ease, box-shadow var(--motion-fast) ease;
}

.close-icon:focus-visible {
  opacity: 1;
  pointer-events: auto;
  outline: none;
  box-shadow: var(--focus-ring);
}

.close-icon:hover {
  color: var(--icon-primary);
}

.editor-tabs {
  position: relative;
  display: flex;
  flex-direction: row;
  width: 100%;
  min-width: 0;
  height: var(--documentTabsHeight);
  user-select: none;
  box-shadow: none;
  overflow: hidden;
  background: var(--surface-chrome);
  &:hover > .new-file {
    opacity: 1 !important;
  }
}
.scrollable-tabs {
  flex: 1 1 auto;
  min-width: 0;
  height: var(--documentTabsHeight);
  overflow: hidden;
}
.tabs-container {
  min-width: min-content;
  list-style: none;
  margin: 0;
  padding: 0 0 0 16px;
  height: var(--documentTabsHeight);
  position: relative;
  display: flex;
  flex-direction: row;
  overflow-y: hidden;
  z-index: 2;
  &::-webkit-scrollbar:horizontal {
    display: none;
  }
  & > li {
    transition: background-color var(--motion-fast) ease, color var(--motion-fast) ease;
    position: relative;
    padding: 0 8px;
    /* Keep the active state in the title-bar surface; only its lower edge carries a short, soft accent tail. */
    &::after {
      content: '';
      position: absolute;
      right: 8px;
      bottom: 0;
      left: 8px;
      height: 7px;
      pointer-events: none;
      opacity: 0;
      background: linear-gradient(
        to top,
        var(--color-accent) 0 1px,
        var(--color-accent-focus) 1px 2px,
        transparent 100%
      );
      transition: opacity var(--motion-fast) ease;
    }
    color: var(--text-secondary);
    font-size: var(--font-size-secondary);
    line-height: var(--documentTabsHeight);
    height: var(--documentTabsHeight);
    max-width: 280px;
    display: flex;
    align-items: center;
    &[aria-grabbed='true'] {
      color: var(--editorColor30) !important;
    }
    & > .close-icon {
      opacity: 0;
      pointer-events: none;
    }
    &:focus-visible {
      outline: none;
      box-shadow: var(--focus-ring);
    }
    &:hover {
      background: var(--surface-hover);
    }
    &:hover > .close-icon {
      opacity: 1;
      pointer-events: auto;
    }
    &:hover > .unsaved-dot {
      display: none;
    }
    & > span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-right: 3px;
    }
    & > .pinned-indicator {
      display: inline-flex;
      align-items: center;
      flex: 0 0 auto;
      margin-right: 3px;
      color: var(--icon-secondary);
    }
    & > .tab-filename {
      min-width: 0;
    }
    & > .unsaved-dot {
      display: none;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--color-accent);
      flex-shrink: 0;
    }
  }
  & > li.unsaved:not(.active) {
    & > .close-icon {
      opacity: 0;
      pointer-events: none;
    }
    & > .unsaved-dot {
      display: block;
    }
    &:hover > .close-icon {
      opacity: 1;
      pointer-events: auto;
    }
    &:hover > .unsaved-dot {
      display: none;
    }
  }
  & > li.active {
    background: transparent;
    color: var(--text-primary);
    font-weight: 500;
    z-index: 3;
    & > .close-icon {
      opacity: 0.7;
    }
    & > .unsaved-dot {
      display: none;
    }
  }
}
.editor-tabs > .new-file {
  appearance: none;
  flex: 0 0 var(--documentTabsHeight);
  width: var(--documentTabsHeight);
  height: var(--documentTabsHeight);
  border: 0;
  border-right: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: space-around;
  cursor: pointer;
  color: var(--icon-secondary);
  font: inherit;
  /* The reference keeps a quiet but discoverable new-tab affordance visible. */
  opacity: 1;
  &.always-visible {
    opacity: 1;
  }
  &:focus-visible {
    outline: none;
    opacity: 1;
    box-shadow: var(--focus-ring);
  }
}

.editor-tabs > .new-file:hover {
  background: var(--surface-hover);
  color: var(--icon-primary);
  transition: background-color var(--motion-fast) ease, color var(--motion-fast) ease;
  & > svg {
    fill: var(--color-accent);
  }
}

/* dragula effects */
.gu-mirror {
  position: fixed !important;
  margin: 0 !important;
  z-index: 9999 !important;
  opacity: 0.8;
  cursor: grabbing;
}
.gu-hide {
  display: none !important;
}
.gu-unselectable {
  user-select: none !important;
}
.gu-transit {
  opacity: 0.2;
}
</style>
