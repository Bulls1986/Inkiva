import { ipcMain } from 'electron'

import { COLLAPSE_STATE_CHANNELS } from '@shared/types/collapseState'
import type { CollapseHeadingRecord } from '../documentState/collapseStateStore'
import { getCollapseStateStore } from '../documentState/collapseStateService'

// Test-only seam: an E2E can hold the read open to exercise a late response.
// Off unless the variable is set, and never persisted.
const loadDelayMs = Number(process.env.INKIVA_COLLAPSE_LOAD_DELAY_MS ?? 0)

export const registerCollapseStateHandlers = (): void => {
  ipcMain.handle(COLLAPSE_STATE_CHANNELS.load, async(_event, pathname: string) => {
    if (loadDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, loadDelayMs))
    }
    return getCollapseStateStore().load(pathname)
  })

  ipcMain.handle(
    COLLAPSE_STATE_CHANNELS.save,
    async(_event, pathname: string, headings: CollapseHeadingRecord[]) =>
      getCollapseStateStore().save(pathname, { headings })
  )

  ipcMain.handle(COLLAPSE_STATE_CHANNELS.clear, async(_event, pathname: string) =>
    getCollapseStateStore().clear(pathname)
  )
}
