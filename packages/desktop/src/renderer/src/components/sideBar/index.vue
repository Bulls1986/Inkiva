<template>
  <div
    v-show="showSideBar"
    ref="sideBar"
    class="side-bar"
    :class="{ 'side-bar--overlay': isOverlayWindow }"
    :style="[!rightColumn ? { 'min-width': '45px' } : {}, { width: `${finalSideBarWidth}px` }]"
  >
    <div class="left-column">
      <ul>
        <li
          v-for="(c, index) of sideBarIcons"
          :key="index"
          :class="{ active: c.id === rightColumn }"
          @click="handleLeftIconClick(c.id)"
        >
          <component :is="c.icon" />
        </li>
      </ul>
      <ul class="bottom">
        <li
          v-for="(c, index) of sideBarBottomIcons"
          :key="index"
          @click="handleLeftBottomClick(c.id)"
        >
          <component :is="c.icon" />
        </li>
      </ul>
    </div>
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
import { useLayoutStore } from '@/store/layout'
import { useProjectStore } from '@/store/project'
import { useEditorStore } from '@/store/editor'

import { sideBarIcons, sideBarBottomIcons } from './help'
import Tree from './tree.vue'
import SideBarSearch from './search.vue'
import Toc from './toc.vue'
import { storeToRefs } from 'pinia'
import type { TabDescriptor } from './types'

const DEFAULT_SIDE_BAR_WIDTH = 270
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
  if (rightColumn.value === '') return 45
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

const handleLeftIconClick = (name: string): void => {
  if (rightColumn.value === name) {
    // Capture the expanded width BEFORE collapsing: once rightColumn is '',
    // finalSideBarWidth evaluates to the 45px icon strip and would overwrite
    // the user's real width with the clamped minimum (#2421).
    const widthToPersist = +sideBarWidth.value
    layoutStore.SET_LAYOUT({ rightColumn: '' })
    layoutStore.CHANGE_SIDE_BAR_WIDTH(widthToPersist)
  } else {
    const needDispatch = rightColumn.value === ''
    layoutStore.SET_LAYOUT({ rightColumn: name })
    sideBarViewWidth.value = +sideBarWidth.value
    if (needDispatch) {
      layoutStore.CHANGE_SIDE_BAR_WIDTH(sideBarWidth.value)
    }
  }
}

const handleLeftBottomClick = (name: string): void => {
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
  width: 270px;
  height: 100vh;
  min-width: 220px;
  position: relative;
  color: var(--sideBarColor);
  user-select: none;
  /*
   * The native application menu occupies the first title-bar-height pixels
   * of the window. Keep that strip on the editor background so the sidebar
   * color does not bleed through the menu area. The sidebar content already
   * reserves this space through its existing top offsets.
   */
  background: linear-gradient(
    to bottom,
    var(--editorBgColor) 0,
    var(--editorBgColor) var(--titleBarHeight),
    var(--sideBarBgColor) var(--titleBarHeight),
    var(--sideBarBgColor) 100%
  );
  border-right: 1px solid var(--itemBgColor);
}

/*
 * Typora stops reserving horizontal editor space for its pinned sidebar below
 * roughly 590px. Mirror that behavior: the sidebar becomes a fixed overlay so
 * a minimum-size editor window (550px in Inkiva) keeps the full editing width.
 * The title bar remains above this layer (z-index: 2) and stays interactive.
 */
.side-bar--overlay {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 1;
}

.side-bar .left-column svg {
  color: var(--iconColor);
}

.left-column {
  height: 100%;
  width: 45px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding-top: 28px;
  box-sizing: border-box;
}

.left-column > ul {
  opacity: 1;
}

.left-column ul {
  list-style: none;
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
}

.left-column ul > li {
  width: 45px;
  height: 45px;
  margin: 0;
  padding: 0;
  display: flex;
  justify-content: space-around;
  align-items: center;
  cursor: pointer;
}

.left-column ul > li > svg {
  width: 18px;
  height: 18px;
  color: var(--sideBarIconColor);
  opacity: 1;
  transition: transform 0.25s ease-in-out;
}

.left-column ul > li.active > svg {
  color: var(--themeColor);
}

.side-bar:hover .left-column ul li svg {
  opacity: 1;
}

.right-column {
  flex: 1;
  width: calc(100% - 50px);
  overflow: hidden;
}

.drag-bar {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  height: 100%;
  width: 3px;
  cursor: col-resize;
}

.drag-bar:hover {
  border-right: 2px solid var(--iconColor);
}
</style>
