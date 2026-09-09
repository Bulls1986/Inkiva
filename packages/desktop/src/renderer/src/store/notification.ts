import { defineStore } from 'pinia'
import notice, { type NotifyOptions } from '../services/notification'
import { t } from '../i18n'

type NotificationAction = 'restart-to-update' | 'open-update-release'

interface NotificationPayload extends Partial<NotifyOptions> {
  action?: NotificationAction
}

export const useNotificationStore = defineStore('notification', () => {
  function listenForNotification(): void {
    const DEFAULT_OPTS = {
      title: t('notifications.defaultTitle'),
      type: 'primary' as const,
      time: 10000,
      message: t('notifications.defaultMessage')
    }

    window.electron.ipcRenderer.on('mt::show-notification', (_e, opts) => {
      const { action, ...notificationOpts } = (opts ?? {}) as NotificationPayload
      const options = Object.assign({ ...DEFAULT_OPTS }, notificationOpts)
      const notificationPromise = Promise.resolve(notice.notify(options))
      if (action === 'restart-to-update') {
        void notificationPromise
          .then(() => window.electron.ipcRenderer.send('mt::restart-to-update'))
          .catch(() => {})
      } else if (action === 'open-update-release') {
        void notificationPromise
          .then(() => window.electron.ipcRenderer.send('mt::open-update-release'))
          .catch(() => {})
      } else {
        void notificationPromise.catch(() => {})
      }
    })

    window.electron.ipcRenderer.on('mt::pandoc-not-exists', async(_e, opts) => {
      // Preserve the custom title/message from main (e.g. dialog.importWarning
      // / dialog.installPandoc); previously the opts arg was dropped and the
      // user saw the generic defaultTitle/defaultMessage.
      const options: NotifyOptions = Object.assign({ ...DEFAULT_OPTS }, opts as Partial<NotifyOptions>, {
        showConfirm: true
      })
      await notice.notify(options)
      window.electron.shell.openExternal('http://pandoc.org')
    })
  }

  return { listenForNotification }
})
