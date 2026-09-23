import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { RendererUpdatePreflight } from 'main_renderer/update/RendererUpdatePreflight'
import type { BrowserWindow } from 'electron'

class FakeWebContents extends EventEmitter {
  send = vi.fn()
}

const makeWindow = (id = 7) => {
  const webContents = new FakeWebContents()
  return {
    webContents,
    window: { id, webContents } as unknown as BrowserWindow
  }
}

describe('RendererUpdatePreflight lifecycle', () => {
  it('releases the renderer listener after a normal response', async() => {
    const preflight = new RendererUpdatePreflight()
    const { window, webContents } = makeWindow()
    const pending = preflight.request(window)
    const requestId = webContents.send.mock.calls[0]?.[1] as string

    expect(webContents.listenerCount('destroyed')).toBe(1)
    expect(preflight.resolve(requestId, [])).toBe(true)
    await expect(pending).resolves.toEqual([])
    expect(webContents.listenerCount('destroyed')).toBe(0)
  })

  it('rejects immediately and releases pending resources when the renderer is destroyed', async() => {
    vi.useFakeTimers()
    try {
      const preflight = new RendererUpdatePreflight()
      const { window, webContents } = makeWindow()
      const pending = preflight.request(window)

      expect(webContents.listenerCount('destroyed')).toBe(1)
      expect(vi.getTimerCount()).toBe(1)

      webContents.emit('destroyed')

      await expect(pending).rejects.toThrow('destroyed')
      expect(webContents.listenerCount('destroyed')).toBe(0)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
