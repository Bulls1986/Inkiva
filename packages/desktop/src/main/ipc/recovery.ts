import { ipcMain } from 'electron'
import { recoveryCenterSession } from '../session/recoveryCenter'

export const registerRecoveryHandlers = (): void => {
  ipcMain.handle('mt::recovery-center::get-state', () => recoveryCenterSession.getState())
  ipcMain.handle('mt::recovery-center::open-copy', (_event, itemId: string) =>
    recoveryCenterSession.openAsNewDocument(itemId)
  )
  ipcMain.handle(
    'mt::recovery-center::replace-file',
    (_event, itemId: string, expectedDiskRevision: string | null) =>
      recoveryCenterSession.replaceFile(itemId, expectedDiskRevision)
  )
  ipcMain.handle('mt::recovery-center::discard', (_event, itemId: string) =>
    recoveryCenterSession.discard(itemId)
  )
  ipcMain.handle('mt::recovery-center::discard-workspace', () =>
    recoveryCenterSession.discardWorkspaceState()
  )
  ipcMain.handle('mt::recovery-center::retry', (_event, itemId: string) =>
    recoveryCenterSession.retryDamagedSource(itemId)
  )
}
