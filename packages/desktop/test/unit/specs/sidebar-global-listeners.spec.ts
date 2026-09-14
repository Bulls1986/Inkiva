import { describe, expect, it, vi } from 'vitest'
import { attachSidebarGlobalListeners } from '@/components/sideBar/globalListeners'

describe('sidebar global listener lifecycle', () => {
  it('removes every document listener and makes cleanup idempotent', () => {
    const click = vi.fn()
    const contextmenu = vi.fn()
    const keydown = vi.fn()
    const cleanup = attachSidebarGlobalListeners(document, {
      click,
      contextmenu,
      keydown
    })

    document.dispatchEvent(new MouseEvent('click'))
    document.dispatchEvent(new MouseEvent('contextmenu'))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(click).toHaveBeenCalledOnce()
    expect(contextmenu).toHaveBeenCalledOnce()
    expect(keydown).toHaveBeenCalledOnce()

    cleanup()
    cleanup()
    document.dispatchEvent(new MouseEvent('click'))
    document.dispatchEvent(new MouseEvent('contextmenu'))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(click).toHaveBeenCalledOnce()
    expect(contextmenu).toHaveBeenCalledOnce()
    expect(keydown).toHaveBeenCalledOnce()
  })
})
