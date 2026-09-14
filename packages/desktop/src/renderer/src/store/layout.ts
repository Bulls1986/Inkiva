import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import bus from '../bus'
import { usePreferencesStore } from './preferences'
import { debouncedSendBufferedState } from './bufferedState'

interface LayoutPartial {
  rightColumn?: string
  showSideBar?: boolean
  showTabBar?: boolean
  sideBarWidth?: number | string
  splitEditor?: boolean
  splitTabId?: string | null
}

export const DEFAULT_RIGHT_COLUMN = 'toc'
export const DEFAULT_SIDE_BAR_WIDTH = 288
export const MIN_SIDE_BAR_WIDTH = 220

interface SetLayoutOptions {
  scheduleBufferUpdate?: boolean
}

const normalizeSideBarWidth = (width: unknown): number => {
  if (width === null || width === undefined || width === '') {
    return DEFAULT_SIDE_BAR_WIDTH
  }

  const numericWidth = Number(width)
  return Number.isFinite(numericWidth)
    ? Math.max(numericWidth, MIN_SIDE_BAR_WIDTH)
    : DEFAULT_SIDE_BAR_WIDTH
}

interface BufferedLayout {
  rightColumn: string | undefined
  showSideBar: boolean
  showTabBar: boolean
  sideBarWidth: number
  splitEditor: boolean
  splitTabId: string | null
}

const createBufferedLayoutState = (state: unknown): BufferedLayout | null => {
  if (!state || typeof state !== 'object') return null
  const s = state as LayoutPartial

  return {
    rightColumn: s.rightColumn,
    showSideBar: !!s.showSideBar,
    showTabBar: !!s.showTabBar,
    sideBarWidth: normalizeSideBarWidth(s.sideBarWidth),
    splitEditor: !!s.splitEditor,
    splitTabId: typeof s.splitTabId === 'string' ? s.splitTabId : null
  }
}

const initialWidth = localStorage.getItem('side-bar-width')
const initialSideBarWidth = normalizeSideBarWidth(initialWidth)

export const useLayoutStore = defineStore('layout', () => {
  const rightColumn = ref<string>(DEFAULT_RIGHT_COLUMN)
  const showSideBar = ref(false)
  const showTabBar = ref(false)
  const sideBarWidth = ref<number>(initialSideBarWidth)
  const splitEditor = ref(false)
  const splitTabId = ref<string | null>(null)

  const effectiveSideBarWidth = computed<number>(() => {
    if (!showSideBar.value) return 0
    if (!rightColumn.value) return 45
    return Number(sideBarWidth.value)
  })

  function SET_LAYOUT(
    layout: LayoutPartial,
    { scheduleBufferUpdate = true }: SetLayoutOptions = {}
  ): void {
    if (layout.showSideBar !== undefined) {
      const { windowId } = window.inkiva?.env ?? {}
      window.electron.ipcRenderer.send(
        'mt::update-sidebar-menu',
        Number(windowId),
        !!layout.showSideBar
      )
      const preferencesStore = usePreferencesStore()
      preferencesStore.SET_SINGLE_PREFERENCE({
        type: 'sideBarVisibility',
        value: !!layout.showSideBar
      })
    }
    if (layout.rightColumn !== undefined) rightColumn.value = layout.rightColumn
    if (layout.showSideBar !== undefined) showSideBar.value = !!layout.showSideBar
    if (layout.showTabBar !== undefined) showTabBar.value = !!layout.showTabBar
    if (layout.sideBarWidth !== undefined) sideBarWidth.value = layout.sideBarWidth as number
    if (layout.splitEditor !== undefined) splitEditor.value = !!layout.splitEditor
    if (layout.splitTabId !== undefined) splitTabId.value = layout.splitTabId ?? null
    if (layout.splitEditor === false) splitTabId.value = null
    if (scheduleBufferUpdate) {
      debouncedSendBufferedState()
    }
  }

  function CREATE_BUFFERED_STATE(): BufferedLayout | null {
    return createBufferedLayoutState({
      rightColumn: rightColumn.value,
      showSideBar: showSideBar.value,
      showTabBar: showTabBar.value,
      sideBarWidth: sideBarWidth.value,
      splitEditor: splitEditor.value,
      splitTabId: splitTabId.value
    })
  }

  function RESTORE_BUFFERED_STATE(state: unknown): void {
    const layout = createBufferedLayoutState(state)
    if (!layout) return

    SET_SIDE_BAR_WIDTH(layout.sideBarWidth, { scheduleBufferUpdate: false })
    SET_LAYOUT(
      {
        rightColumn: layout.rightColumn,
        showSideBar: layout.showSideBar,
        showTabBar: layout.showTabBar,
        splitEditor: layout.splitEditor,
        splitTabId: layout.splitTabId
      },
      { scheduleBufferUpdate: false }
    )
    DISPATCH_LAYOUT_MENU_ITEMS()
  }

  function TOGGLE_LAYOUT_ENTRY(entryName: 'showSideBar' | 'showTabBar' | 'splitEditor'): void {
    if (entryName === 'showSideBar') {
      showSideBar.value = !showSideBar.value
      const preferencesStore = usePreferencesStore()
      preferencesStore.SET_SINGLE_PREFERENCE({
        type: 'sideBarVisibility',
        value: !!showSideBar.value
      })
    } else if (entryName === 'showTabBar') {
      showTabBar.value = !showTabBar.value
    } else if (entryName === 'splitEditor') {
      splitEditor.value = !splitEditor.value
      if (!splitEditor.value) splitTabId.value = null
    }
    debouncedSendBufferedState()
  }

  function SET_SIDE_BAR_WIDTH(
    width: number | string,
    { scheduleBufferUpdate = true }: SetLayoutOptions = {}
  ): void {
    const normalizedWidth = normalizeSideBarWidth(width)
    localStorage.setItem('side-bar-width', String(normalizedWidth))
    sideBarWidth.value = normalizedWidth
    if (scheduleBufferUpdate) {
      debouncedSendBufferedState()
    }
  }

  function LISTEN_FOR_LAYOUT(): void {
    window.electron.ipcRenderer.on('mt::set-view-layout', (_e, layout) => {
      const l = layout as unknown as LayoutPartial
      if (l.rightColumn) {
        SET_LAYOUT({
          ...l,
          rightColumn: l.rightColumn === rightColumn.value ? '' : l.rightColumn,
          showSideBar: true
        })
      } else {
        SET_LAYOUT(l)
      }
      DISPATCH_LAYOUT_MENU_ITEMS()
    })

    window.electron.ipcRenderer.on('mt::toggle-view-layout-entry', (_e, entryName) => {
      TOGGLE_LAYOUT_ENTRY(entryName as 'showSideBar' | 'showTabBar' | 'splitEditor')
      DISPATCH_LAYOUT_MENU_ITEMS()
    })

    bus.on('view:toggle-layout-entry', (entryName: unknown) => {
      const name = entryName as 'showSideBar' | 'showTabBar' | 'splitEditor'
      TOGGLE_LAYOUT_ENTRY(name)
      const { windowId } = window.inkiva?.env ?? {}
      window.electron.ipcRenderer.send('mt::view-layout-changed', Number(windowId), {
        [name]:
          name === 'showSideBar'
            ? showSideBar.value
            : name === 'showTabBar'
              ? showTabBar.value
              : splitEditor.value
      })
    })
  }

  function DISPATCH_LAYOUT_MENU_ITEMS(): void {
    const { windowId } = window.inkiva?.env ?? {}
    window.electron.ipcRenderer.send('mt::view-layout-changed', Number(windowId), {
      showTabBar: showTabBar.value,
      showSideBar: showSideBar.value,
      splitEditor: splitEditor.value
    })
  }

  function SET_SPLIT_TAB(tabId: string | null): void {
    splitTabId.value = tabId
    if (tabId !== null) splitEditor.value = true
    debouncedSendBufferedState()
  }

  function SET_SPLIT_EDITOR(enabled: boolean, tabId?: string | null): void {
    splitEditor.value = enabled
    splitTabId.value = enabled ? (tabId ?? splitTabId.value) : null
    debouncedSendBufferedState()
  }

  function CHANGE_SIDE_BAR_WIDTH(width: number | string): void {
    SET_SIDE_BAR_WIDTH(width)
  }

  return {
    rightColumn,
    showSideBar,
    showTabBar,
    sideBarWidth,
    splitEditor,
    splitTabId,
    effectiveSideBarWidth,
    SET_LAYOUT,
    CREATE_BUFFERED_STATE,
    RESTORE_BUFFERED_STATE,
    TOGGLE_LAYOUT_ENTRY,
    SET_SIDE_BAR_WIDTH,
    LISTEN_FOR_LAYOUT,
    DISPATCH_LAYOUT_MENU_ITEMS,
    CHANGE_SIDE_BAR_WIDTH,
    SET_SPLIT_TAB,
    SET_SPLIT_EDITOR
  }
})
