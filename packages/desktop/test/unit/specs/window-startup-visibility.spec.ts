import type { BrowserWindow } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { editorWinOptions, preferencesWinOptions } from 'main_renderer/config'
import { WINDOW_INITIAL_SHELL_READY_CHANNEL } from '@shared/types/ipc'
import { showWindowWhenRendererReady } from 'main_renderer/windows/base'

const createWindowDouble = (): {
  window: BrowserWindow
  show: ReturnType<typeof vi.fn>
  fireDomReady: () => void
  fireRendererReady: () => void
} => {
  const show = vi.fn()
  const isDestroyed = vi.fn(() => false)
  const isVisible = vi.fn(() => false)
  const on = vi.fn()
  const once = vi.fn()
  const removeListener = vi.fn()

  const webContents = { on, once, removeListener }
  const window = {
    isDestroyed,
    isVisible,
    show,
    webContents
  } as unknown as BrowserWindow

  showWindowWhenRendererReady(window)

  const domReadyListener = once.mock.calls.find(([event]) => event === 'dom-ready')?.[1] as
    | (() => void)
    | undefined
  if (!domReadyListener) throw new Error('dom-ready listener was not registered')
  const ipcMessageListener = on.mock.calls.find(([event]) => event === 'ipc-message')?.[1] as
    | ((event: { sender: unknown }, channel: string) => void)
    | undefined
  if (!ipcMessageListener) throw new Error('ipc-message listener was not registered')

  return {
    window,
    show,
    fireDomReady: domReadyListener,
    fireRendererReady: () =>
      ipcMessageListener({ sender: webContents }, WINDOW_INITIAL_SHELL_READY_CHANNEL)
  }
}

describe('window startup visibility', () => {
  it('keeps a newly created window hidden until the renderer DOM is ready', () => {
    const { show, fireDomReady } = createWindowDouble()

    expect(show).not.toHaveBeenCalled()

    fireDomReady()

    expect(show).toHaveBeenCalledOnce()
  })

  it('shows the inline shell when the renderer signals that HTML parsing is complete', () => {
    const { show, fireRendererReady } = createWindowDouble()

    expect(show).not.toHaveBeenCalled()

    fireRendererReady()

    expect(show).toHaveBeenCalledOnce()
  })

  it('does not show an already visible or destroyed window', () => {
    const visibleWindow = createWindowDouble()
    vi.spyOn(visibleWindow.window, 'isVisible').mockReturnValue(true)
    visibleWindow.fireDomReady()
    expect(visibleWindow.show).not.toHaveBeenCalled()

    const destroyedWindow = createWindowDouble()
    vi.spyOn(destroyedWindow.window, 'isDestroyed').mockReturnValue(true)
    destroyedWindow.fireDomReady()
    expect(destroyedWindow.show).not.toHaveBeenCalled()
  })

  it('starts both editor and preference windows hidden', () => {
    expect(editorWinOptions.show).toBe(false)
    expect(preferencesWinOptions.show).toBe(false)
  })
})
