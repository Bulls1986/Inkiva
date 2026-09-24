import { describe, expect, it } from 'vitest'
import { createRestoreInteractionFence } from '@/util/restoreInteractionFence'

describe('US07 restore interaction fence', () => {
  it.each(['wheel', 'touchstart', 'mousedown', 'pointerdown', 'keydown'])(
    'invalidates queued restore work after active user %s input',
    (eventName) => {
      const container = document.createElement('div')
      const fence = createRestoreInteractionFence(container)
      const token = fence.capture()

      container.dispatchEvent(new Event(eventName, { bubbles: true }))

      expect(fence.isCurrent(token)).toBe(false)
      fence.destroy()
    }
  )

  it('keeps the token current when no user interaction occurs and stops tracking after destroy', () => {
    const container = document.createElement('div')
    const fence = createRestoreInteractionFence(container)
    const token = fence.capture()

    expect(fence.isCurrent(token)).toBe(true)
    fence.destroy()
    container.dispatchEvent(new Event('wheel', { bubbles: true }))
    expect(fence.isCurrent(token)).toBe(true)
  })
})
