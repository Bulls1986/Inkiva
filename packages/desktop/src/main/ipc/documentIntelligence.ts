import path from 'node:path'
import { app, ipcMain } from 'electron'

import { DOCUMENT_INTELLIGENCE_CHANNELS } from '@shared/types/documentIntelligence'
import { DocumentIntelligenceService } from '../documentIntelligence/documentIntelligenceService'
import {
  createDocumentIntelligenceHandlers,
  type DocumentIntelligenceHandlers
} from '../documentIntelligence/ipcHandlers'

let handlers: DocumentIntelligenceHandlers | null = null

const getHandlers = (): DocumentIntelligenceHandlers => {
  if (!handlers) {
    const service = new DocumentIntelligenceService({
      historyRootPath: path.join(app.getPath('userData'), 'local-history')
    })
    handlers = createDocumentIntelligenceHandlers(service)
  }
  return handlers
}

export const registerDocumentIntelligenceHandlers = (): void => {
  ipcMain.handle(DOCUMENT_INTELLIGENCE_CHANNELS.indexDocument, (_event, pathname, markdown) =>
    getHandlers().indexDocument(pathname, markdown)
  )
  ipcMain.handle(DOCUMENT_INTELLIGENCE_CHANNELS.removeDocument, (_event, pathname) =>
    getHandlers().removeDocument(pathname)
  )
  ipcMain.handle(DOCUMENT_INTELLIGENCE_CHANNELS.getBacklinks, (_event, targetPath) =>
    getHandlers().getBacklinks(targetPath)
  )
  ipcMain.handle(
    DOCUMENT_INTELLIGENCE_CHANNELS.getLinkCandidates,
    (_event, sourcePath, pathnames) => getHandlers().getLinkCandidates(sourcePath, pathnames)
  )
  ipcMain.handle(DOCUMENT_INTELLIGENCE_CHANNELS.prepareRenameRepair, (_event, request) =>
    getHandlers().prepareRenameRepair(request)
  )
  ipcMain.handle(DOCUMENT_INTELLIGENCE_CHANNELS.applyRenameRepair, (_event, request) =>
    getHandlers().applyRenameRepair(request)
  )
  ipcMain.handle(DOCUMENT_INTELLIGENCE_CHANNELS.createSnapshot, (_event, request) =>
    getHandlers().createSnapshot(request)
  )
  ipcMain.handle(DOCUMENT_INTELLIGENCE_CHANNELS.listSnapshots, (_event, filePath) =>
    getHandlers().listSnapshots(filePath)
  )
  ipcMain.handle(DOCUMENT_INTELLIGENCE_CHANNELS.getSnapshot, (_event, filePath, id) =>
    getHandlers().getSnapshot(filePath, id)
  )
  ipcMain.handle(DOCUMENT_INTELLIGENCE_CHANNELS.deleteSnapshot, (_event, filePath, id) =>
    getHandlers().deleteSnapshot(filePath, id)
  )
  ipcMain.handle(DOCUMENT_INTELLIGENCE_CHANNELS.restoreSnapshot, (_event, request) =>
    getHandlers().restoreSnapshot(request)
  )
  ipcMain.handle(DOCUMENT_INTELLIGENCE_CHANNELS.pruneHistory, () => getHandlers().pruneHistory())
}
