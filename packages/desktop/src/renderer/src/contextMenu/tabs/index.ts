import {
  SEPARATOR,
  getCloseThis,
  getCloseOthers,
  getCloseRight,
  getTogglePin,
  getReopenClosed,
  getCloseSaved,
  getCloseAll,
  getRENAME,
  getCopyPath,
  getShowInFolder
} from './menuItems'
import { popupContextMenu } from '../popupMenu'

type MenuItemShape = {
  type?: string
  click?: (...args: unknown[]) => void
  enabled?: boolean
  [key: string]: unknown
}

const wrapClick = (item: MenuItemShape, tabId: string): MenuItemShape => {
  if (!item || item.type === 'separator') return item
  const click = item.click
  return {
    ...item,
    click: click ? () => click({ _tabId: tabId }, null) : undefined
  }
}

interface ContextMenuClickEvent {
  clientX: number
  clientY: number
}

interface TabLike {
  id: string
  pathname?: string | null
  pinned?: boolean
  canReopenClosed?: boolean
}

export const showContextMenu = (event: ContextMenuClickEvent, tab: TabLike): void => {
  const { pathname } = tab
  const closeThis = getCloseThis()
  const closeOthers = getCloseOthers()
  const closeRight = getCloseRight()
  const togglePin = getTogglePin(!!tab.pinned)
  const reopenClosed = getReopenClosed(!!tab.canReopenClosed)
  const closeSaved = getCloseSaved()
  const closeAll = getCloseAll()
  const rename = getRENAME()
  const copyPath = getCopyPath()
  const showInFolder = getShowInFolder()

  ;([rename, copyPath, showInFolder] as MenuItemShape[]).forEach((item) => {
    item.enabled = !!pathname
  })

  const items = [
    closeThis,
    closeOthers,
    closeRight,
    togglePin,
    closeSaved,
    closeAll,
    reopenClosed,
    SEPARATOR,
    rename,
    copyPath,
    showInFolder
  ].map((item) => wrapClick(item as MenuItemShape, tab.id))

  popupContextMenu(items, { x: event.clientX, y: event.clientY })
}
