import { ipcMain, type BrowserWindow } from 'electron'

export const showAboutDialog = (win: BrowserWindow | null | undefined): void => {
  if (win && win.webContents) {
    win.webContents.send('mt::about-dialog')
  }
}

export const checkForUpdates = (): void => {
  ipcMain.emit('app-check-for-updates')
}
