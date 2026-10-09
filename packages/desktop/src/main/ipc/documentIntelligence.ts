import path from 'node:path'
import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'

import { DOCUMENT_INTELLIGENCE_CHANNELS } from '@shared/types/documentIntelligence'
import { DocumentIntelligenceService } from '../documentIntelligence/documentIntelligenceService'
import {
  createDocumentIntelligenceHandlers,
  type DocumentIntelligenceHandlers
} from '../documentIntelligence/ipcHandlers'

let service: DocumentIntelligenceService | null = null
const handlersBySender = new Map<number, DocumentIntelligenceHandlers>()

const getHandlers = (event: IpcMainInvokeEvent): DocumentIntelligenceHandlers => {
  if (!service) {
    service = new DocumentIntelligenceService({
      historyRootPath: path.join(app.getPath('userData'), 'local-history')
    })
  }
  const senderId = event.sender.id
  let handlers = handlersBySender.get(senderId)
  if (!handlers) {
    handlers = createDocumentIntelligenceHandlers(service, senderId)
    handlersBySender.set(senderId, handlers)
    event.sender.once('destroyed', () => {
      service?.closeScope(senderId)
      handlersBySender.delete(senderId)
    })
  }
  return handlers
}

export const registerDocumentIntelligenceHandlers = (): void => {
  ipcMain.handle(DOCUMENT_INTELLIGENCE_CHANNELS.indexWorkspace, (event, rootPath) =>
    getHandlers(event).indexWorkspace(rootPath)
  )
  ipcMain.handle(DOCUMENT_INTELLIGENCE_CHANNELS.refreshWorkspaceFile, (event, pathname) =>
    getHandlers(event).refreshWorkspaceFile(pathname)
  )
  ipcMain.handle(DOCUMENT_INTELLIGENCE_CHANNELS.indexDocument, (event, pathname, markdown) =>
    getHandlers(event).indexDocument(pathname, markdown)
  )
  ipcMain.handle(DOCUMENT_INTELLIGENCE_CHANNELS.removeDocument, (event, pathname) =>
    getHandlers(event).removeDocument(pathname)
  )
  ipcMain.handle(DOCUMENT_INTELLIGENCE_CHANNELS.getBacklinks, (event, targetPath) =>
    getHandlers(event).getBacklinks(targetPath)
  )
  ipcMain.handle(
    DOCUMENT_INTELLIGENCE_CHANNELS.getLinkCandidates,
    (event, sourcePath, pathnames) => getHandlers(event).getLinkCandidates(sourcePath, pathnames)
  )
  ipcMain.handle(
    DOCUMENT_INTELLIGENCE_CHANNELS.searchWorkspaceLinkCandidates,
    (event, sourcePath, query) => getHandlers(event).searchWorkspaceLinkCandidates(sourcePath, query)
  )
  ipcMain.handle(DOCUMENT_INTELLIGENCE_CHANNELS.prepareRenameRepair, (event, request) =>
    getHandlers(event).prepareRenameRepair(request)
  )
  ipcMain.handle(DOCUMENT_INTELLIGENCE_CHANNELS.applyRenameRepair, (event, request) =>
    getHandlers(event).applyRenameRepair(request)
  )
  ipcMain.handle(DOCUMENT_INTELLIGENCE_CHANNELS.createSnapshot, (event, request) =>
    getHandlers(event).createSnapshot(request)
  )
  ipcMain.handle(DOCUMENT_INTELLIGENCE_CHANNELS.listSnapshots, (event, filePath) =>
    getHandlers(event).listSnapshots(filePath)
  )
  ipcMain.handle(DOCUMENT_INTELLIGENCE_CHANNELS.getSnapshot, (event, filePath, id) =>
    getHandlers(event).getSnapshot(filePath, id)
  )
  ipcMain.handle(DOCUMENT_INTELLIGENCE_CHANNELS.deleteSnapshot, (event, filePath, id) =>
    getHandlers(event).deleteSnapshot(filePath, id)
  )
  ipcMain.handle(DOCUMENT_INTELLIGENCE_CHANNELS.restoreSnapshot, (event, request) =>
    getHandlers(event).restoreSnapshot(request)
  )
  ipcMain.handle(DOCUMENT_INTELLIGENCE_CHANNELS.moveHistoryPath, (event, request) =>
    getHandlers(event).moveHistoryPath(request)
  )
  ipcMain.handle(DOCUMENT_INTELLIGENCE_CHANNELS.pruneHistory, (event) =>
    getHandlers(event).pruneHistory()
  )
}
