import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import notification from '@/services/notification'

describe('notification service', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    notification.clear()
    vi.runOnlyPendingTimers()
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  it('keeps a notification visible for its full reading duration before auto-dismissal', () => {
    notification.notify({
      time: 5000,
      title: 'Update available',
      message: 'Downloading the update in the background…',
      type: 'info'
    })

    expect(document.querySelector('.mt-notification')).not.toBeNull()
    vi.advanceTimersByTime(4999)
    expect(document.querySelector('.mt-notification')).not.toBeNull()

    vi.advanceTimersByTime(1)
    expect(document.querySelector('.mt-notification')).not.toBeNull()
    vi.advanceTimersByTime(100)
    expect(document.querySelector('.mt-notification')).toBeNull()
  })

  it('allows the user to dismiss a notification immediately', () => {
    const completion = notification.notify({
      time: 30000,
      title: 'Update ready',
      message: 'Restart to install the update.',
      showConfirm: true
    })
    void completion.catch(() => {})

    const close = document.querySelector('.mt-notification .close')
    expect(close).not.toBeNull()
    close!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    vi.advanceTimersByTime(100)

    expect(document.querySelector('.mt-notification')).toBeNull()
  })
})
