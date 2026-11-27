import path from 'node:path'
import { app, ipcMain } from 'electron'
import writeFileAtomic from 'write-file-atomic'
import { promises as fs } from 'node:fs'

import { COLLAPSE_STATE_CHANNELS } from '@shared/types/collapseState'
import {
  CollapseStateStore,
  fileIdentity,
  type CollapseHeadingRecord
} from '../documentState/collapseStateStore'

/**
 * One store per application: the collapse record belongs to the document, not to
 * a window, and serialized writes keep several windows from interleaving.
 */
let store: CollapseStateStore | null = null

const getStore = (): CollapseStateStore => {
  if (!store) {
    store = new CollapseStateStore({
      filePath: path.join(app.getPath('userData'), 'collapse-state.json'),
      readFile: (filePath) => fs.readFile(filePath, 'utf8'),
      writeFile: async(filePath, text) => {
        // Atomic replace so a crash mid-write cannot corrupt the whole store.
        await writeFileAtomic(filePath, text)
      },
      identity: fileIdentity
    })
  }
  return store
}

export const registerCollapseStateHandlers = (): void => {
  ipcMain.handle(COLLAPSE_STATE_CHANNELS.load, async(_event, pathname: string) =>
    getStore().load(pathname)
  )

  ipcMain.handle(
    COLLAPSE_STATE_CHANNELS.save,
    async(_event, pathname: string, headings: CollapseHeadingRecord[]) =>
      getStore().save(pathname, { headings })
  )

  ipcMain.handle(COLLAPSE_STATE_CHANNELS.clear, async(_event, pathname: string) =>
    getStore().clear(pathname)
  )
}
