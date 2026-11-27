import { ipcMain } from 'electron'

import { COLLAPSE_STATE_CHANNELS } from '@shared/types/collapseState'
import type { CollapseHeadingRecord } from '../documentState/collapseStateStore'
import { getCollapseStateStore } from '../documentState/collapseStateService'

export const registerCollapseStateHandlers = (): void => {
  ipcMain.handle(COLLAPSE_STATE_CHANNELS.load, async(_event, pathname: string) =>
    getCollapseStateStore().load(pathname)
  )

  ipcMain.handle(
    COLLAPSE_STATE_CHANNELS.save,
    async(_event, pathname: string, headings: CollapseHeadingRecord[]) =>
      getCollapseStateStore().save(pathname, { headings })
  )

  ipcMain.handle(COLLAPSE_STATE_CHANNELS.clear, async(_event, pathname: string) =>
    getCollapseStateStore().clear(pathname)
  )
}
