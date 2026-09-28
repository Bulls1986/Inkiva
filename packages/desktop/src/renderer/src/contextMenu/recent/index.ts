import { t } from '../../i18n'
import { popupContextMenu, type ContextMenuItem } from '../popupMenu'
import type { RecentDocument } from '@/store/recentDocuments'

interface RecentContextActions {
  open: () => void
  reveal: () => void
  togglePin: () => void
  remove: () => void
}

export const showRecentContextMenu = (
  event: { clientX: number; clientY: number },
  item: RecentDocument,
  actions: RecentContextActions
): void => {
  const items: ContextMenuItem[] = [
    {
      id: 'recentOpen',
      label: t('recent.open'),
      click: actions.open
    },
    {
      id: 'recentShowInFolder',
      label: t('contextMenu.tabs.showInFolder'),
      click: actions.reveal
    },
    { type: 'separator' },
    {
      id: item.pinned ? 'recentUnpin' : 'recentPin',
      label: t(item.pinned ? 'recent.unpin' : 'recent.pin'),
      click: actions.togglePin
    },
    {
      id: 'recentRemove',
      label: t('recent.remove'),
      click: actions.remove
    }
  ]

  popupContextMenu(items, { x: event.clientX, y: event.clientY })
}
