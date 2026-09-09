import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/notification', () => ({
  default: { notify: vi.fn(() => Promise.resolve()), name: 'notify' }
}))

import { createPinia, setActivePinia } from 'pinia'
import notice from '@/services/notification'
import { useNotificationStore } from '@/store/notification'

type NotificationListener = (_event: unknown, payload: Record<string, unknown>) => void

const getWindowBridge = (): {
  on: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
} => {
  const bridge = {
    on: vi.fn(),
    send: vi.fn()
  }
  ;(window as unknown as { electron: { ipcRenderer: typeof bridge } }).electron = {
    ipcRenderer: bridge
  }
  return bridge
}

describe('notification store update actions', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('sends the restart request only when the update notification is confirmed', async() => {
    const bridge = getWindowBridge()
    const store = useNotificationStore()
    store.listenForNotification()
    const listener = bridge.on.mock.calls.find(
      ([channel]) => channel === 'mt::show-notification'
    )?.[1] as NotificationListener | undefined

    expect(listener).toBeDefined()
    listener!(
      {},
      {
        title: 'Update ready',
        message: 'Inkiva 1.1.0 is available.',
        action: 'restart-to-update',
        showConfirm: true
      }
    )
    await Promise.resolve()

    expect(notice.notify).toHaveBeenCalledWith(
      expect.not.objectContaining({ action: expect.anything() })
    )
    expect(bridge.send).toHaveBeenCalledWith('mt::restart-to-update')
  })

  it('routes a confirmed macOS notification to the release page action', async() => {
    const bridge = getWindowBridge()
    const store = useNotificationStore()
    store.listenForNotification()
    const listener = bridge.on.mock.calls.find(
      ([channel]) => channel === 'mt::show-notification'
    )?.[1] as NotificationListener | undefined

    listener!(
      {},
      {
        title: 'Update available',
        message: 'Download and install the update.',
        action: 'open-update-release',
        showConfirm: true
      }
    )
    await Promise.resolve()

    expect(bridge.send).toHaveBeenCalledWith('mt::open-update-release')
  })
})
