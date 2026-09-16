<template>
  <div
    v-show="showSideBar"
    ref="sideBar"
    class="side-bar"
    :class="{ 'side-bar--overlay': isOverlayWindow }"
    :style="[!rightColumn ? { 'min-width': '0' } : {}, { width: `${finalSideBarWidth}px` }]"
  >
    <div class="sidebar-panel">
      <nav
        class="sidebar-navigation"
        aria-label="Sidebar navigation"
      >
        <div class="sidebar-primary-navigation">
          <button
            v-for="(c, index) of primarySideBarIcons"
            :key="index"
            type="button"
            class="sidebar-control sidebar-icon-button sidebar-nav-button"
            :class="{ active: c.id === rightColumn }"
            :aria-label="c.name()"
            :aria-pressed="c.id === rightColumn"
            data-testid="sidebar-panel-button"
            @click="handlePanelClick(c.id)"
          >
            <component
              :is="c.icon"
              aria-hidden="true"
            />
            <span>{{ c.name() }}</span>
          </button>
        </div>
        <button
          type="button"
          class="sidebar-control sidebar-more-button"
          :class="{ active: rightColumn === documentIntelligencePanel.id }"
          :aria-label="documentIntelligencePanel.name()"
          :aria-pressed="rightColumn === documentIntelligencePanel.id"
          :title="documentIntelligencePanel.name()"
          data-testid="sidebar-document-info-button"
          @click="handlePanelClick(documentIntelligencePanel.id)"
        >
          <MoreFilled aria-hidden="true" />
        </button>
      </nav>
      <div
        v-show="rightColumn"
        class="right-column"
      >
        <tree
          v-if="rightColumn === 'files'"
          :project-tree="projectTree"
          :opened-files="openedFiles"
          :tabs="tabs"
        />
        <side-bar-search v-else-if="rightColumn === 'search'" />
        <toc v-else-if="rightColumn === 'toc'" />
        <document-intelligence v-else-if="rightColumn === 'document-intelligence'" />
      </div>
      <div class="sidebar-footer">
        <button
          v-for="(c, index) of sideBarBottomIcons"
          :key="index"
          type="button"
          class="sidebar-control sidebar-settings-button"
          :aria-label="c.name()"
          data-testid="sidebar-settings-button"
          @click="handleBottomClick(c.id)"
        >
          <component
            :is="c.icon"
            aria-hidden="true"
          />
          <span>{{ c.name() }}</span>
        </button>
      </div>
    </div>
    <div
      v-show="rightColumn"
      ref="dragBar"
      class="drag-bar"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { MoreFilled } from '@element-plus/icons-vue'
import { useLayoutStore } from '@/store/layout'
import { useProjectStore } from '@/store/project'
import { useEditorStore } from '@/store/editor'

import { sideBarIcons, sideBarBottomIcons } from './help'
import Tree from './tree.vue'
import SideBarSearch from './search.vue'
import Toc from './toc.vue'
import DocumentIntelligence from './documentIntelligence.vue'
import { storeToRefs } from 'pinia'
import type { TabDescriptor } from './types'

const DEFAULT_SIDE_BAR_WIDTH = 288
const MIN_SIDE_BAR_WIDTH = 220
const NARROW_WINDOW_BREAKPOINT = 1000
const NARROW_SIDE_BAR_WIDTH = 240
const OVERLAY_WINDOW_BREAKPOINT = 590

const layoutStore = useLayoutStore()
const projectStore = useProjectStore()
const editorStore = useEditorStore()

const sideBar = ref<HTMLDivElement | null>(null)
const dragBar = ref<HTMLDivElement | null>(null)

const openedFiles = ref<TabDescriptor[]>([])
const sideBarViewWidth = ref(DEFAULT_SIDE_BAR_WIDTH)
const windowWidth = ref(window.innerWidth)

const { rightColumn, showSideBar, sideBarWidth } = storeToRefs(layoutStore)

const { projectTree } = storeToRefs(projectStore)
const { tabs } = storeToRefs(editorStore)

const primarySideBarIcons = sideBarIcons.filter((entry) => entry.id !== 'document-intelligence')
const documentIntelligencePanel = sideBarIcons.find((entry) => entry.id === 'document-intelligence')!

const isNarrowWindow = computed<boolean>(() => windowWidth.value <= NARROW_WINDOW_BREAKPOINT)
const isOverlayWindow = computed<boolean>(() => windowWidth.value <= OVERLAY_WINDOW_BREAKPOINT)

const clampSideBarWidthForViewport = (width: number): number => {
  const minClampedWidth = Math.max(width, MIN_SIDE_BAR_WIDTH)
  return isNarrowWindow.value
    ? Math.min(minClampedWidth, NARROW_SIDE_BAR_WIDTH)
    : minClampedWidth
}

const finalSideBarWidth = computed<number>(() => {
  if (!showSideBar.value) return 0
  if (rightColumn.value === '') return 0
  return clampSideBarWidthForViewport(sideBarViewWidth.value)
})

const handleWindowResize = (): void => {
  windowWidth.value = window.innerWidth
}

let removeDragBarListener: (() => void) | null = null

onMounted(() => {
  window.addEventListener('resize', handleWindowResize, false)
  handleWindowResize()

  nextTick(() => {
    const dragBarEl = dragBar.value
    if (!dragBarEl) return
    let startX = 0
    let currentSideBarWidth = +sideBarWidth.value
    let startWidth = currentSideBarWidth

    sideBarViewWidth.value = currentSideBarWidth

    const mouseUpHandler = (): void => {
      document.removeEventListener('mousemove', mouseMoveHandler, false)
      document.removeEventListener('mouseup', mouseUpHandler, false)
      layoutStore.CHANGE_SIDE_BAR_WIDTH(currentSideBarWidth)
    }

    const mouseMoveHandler = (event: MouseEvent): void => {
      const offset = event.clientX - startX
      currentSideBarWidth = clampSideBarWidthForViewport(startWidth + offset)
      sideBarViewWidth.value = currentSideBarWidth
    }

    const mouseDownHandler = (event: MouseEvent): void => {
      startX = event.clientX
      startWidth = finalSideBarWidth.value
      currentSideBarWidth = startWidth
      document.addEventListener('mousemove', mouseMoveHandler, false)
      document.addEventListener('mouseup', mouseUpHandler, false)
    }

    dragBarEl.addEventListener('mousedown', mouseDownHandler, false)
    removeDragBarListener = () => {
      dragBarEl.removeEventListener('mousedown', mouseDownHandler, false)
      document.removeEventListener('mousemove', mouseMoveHandler, false)
      document.removeEventListener('mouseup', mouseUpHandler, false)
    }
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleWindowResize, false)
  removeDragBarListener?.()
})

const handlePanelClick = (name: string): void => {
  // Panel navigation is persistent while the sidebar is open. Closing the
  // sidebar is an explicit View action, so a second click never strands the
  // user in an unlabeled icon strip.
  if (rightColumn.value === name && showSideBar.value) return

  const needDispatch = rightColumn.value === '' || !showSideBar.value
  layoutStore.SET_LAYOUT({ rightColumn: name, showSideBar: true })
  sideBarViewWidth.value = +sideBarWidth.value
  if (needDispatch) layoutStore.CHANGE_SIDE_BAR_WIDTH(sideBarWidth.value)
}

const handleBottomClick = (name: string): void => {
  if (name === 'settings') {
    projectStore.OPEN_SETTING_WINDOW()
  }
}
</script>

<style scoped>
.side-bar {
  display: flex;
  flex-shrink: 0;
  flex-grow: 0;
  width: 288px;
  height: 100%;
  min-width: 220px;
  box-sizing: border-box;
  position: relative;
  color: var(--text-secondary);
  user-select: none;
  background: var(--surface-chrome);
  border-right: 1px solid var(--border-subtle);
}

/*
 * Typora stops reserving horizontal editor space for its pinned sidebar below
 * roughly 590px. Mirror that behavior: the sidebar becomes a fixed overlay so
 * a minimum-size editor window (550px in Inkiva) keeps the full editing width.
 * The title bar remains above this layer (z-index: 2) and stays interactive.
 */
.side-bar--overlay {
  position: fixed;
  top: calc(var(--titleBarHeight) + var(--documentTabsHeight));
  left: 0;
  bottom: 0;
  z-index: 1;
}

.sidebar-panel {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
}

.sidebar-navigation {
  display: flex;
  flex: 0 0 var(--sidebar-navigation-height);
  align-items: stretch;
  min-width: 0;
  padding: 0 var(--space-3);
  box-sizing: border-box;
  border-bottom: 1px solid var(--border-subtle);
}

.sidebar-primary-navigation {
  display: flex;
  flex: 1;
  min-width: 0;
}

.sidebar-control {
  -webkit-app-region: no-drag;
  appearance: none;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-height: var(--hit-target-md);
  padding: 0;
  color: var(--text-secondary);
  background: transparent;
  border: 0;
  cursor: pointer;
  font: inherit;
  transition: color var(--motion-fast), background-color var(--motion-fast), box-shadow var(--motion-fast);
}

.sidebar-control:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.sidebar-nav-button {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  gap: 7px;
  padding: 0 8px;
  white-space: nowrap;
}

.sidebar-nav-button > span,
.sidebar-settings-button > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-nav-button > svg {
  width: var(--icon-size-lg);
  height: var(--icon-size-lg);
  color: currentColor;
  flex: 0 0 auto;
  transition: color var(--motion-fast), transform var(--motion-fast);
}

.sidebar-nav-button::after {
  content: '';
  position: absolute;
  right: var(--space-3);
  bottom: -1px;
  left: var(--space-3);
  height: 2px;
  background: transparent;
  transition: background-color var(--motion-fast);
}

.sidebar-nav-button.active {
  color: var(--color-accent);
}

.sidebar-nav-button.active::after {
  background: var(--color-accent);
}

.sidebar-nav-button:hover,
.sidebar-nav-button:focus-visible,
.sidebar-more-button:hover,
.sidebar-more-button:focus-visible,
.sidebar-settings-button:hover,
.sidebar-settings-button:focus-visible {
  color: var(--text-primary);
  background: var(--surface-hover);
}

.sidebar-more-button {
  flex: 0 0 var(--hit-target-md);
  width: var(--hit-target-md);
  color: var(--icon-secondary);
  border-radius: var(--radius-sm);
}

.sidebar-more-button.active {
  color: var(--color-accent);
}

.sidebar-more-button > svg {
  width: var(--icon-size-lg);
  height: var(--icon-size-lg);
}

.sidebar-footer {
  display: flex;
  flex: 0 0 auto;
  padding: var(--space-3) var(--space-3) var(--space-4);
}

.sidebar-settings-button {
  justify-content: flex-start;
  width: 100%;
  gap: 10px;
  padding: 0 var(--space-2);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
}

.sidebar-settings-button > svg {
  width: var(--icon-size-lg);
  height: var(--icon-size-lg);
  flex: 0 0 auto;
}

.right-column {
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.drag-bar {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  height: 100%;
  width: 5px;
  cursor: col-resize;
  border-right: 1px solid transparent;
  transition: border-right-color var(--motion-fast);
}

.drag-bar:hover {
  border-right-color: var(--color-accent);
}
</style>
