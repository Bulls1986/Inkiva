import { afterEach, describe, expect, it, vi } from 'vitest'

import bus from '@/bus'

describe('renderer bus contract', () => {
  afterEach(() => {
    bus.all.clear()
  })

  it('preserves mitt single-payload emit/on/off semantics', () => {
    const handler = vi.fn()

    bus.on('mt::window-zoom', handler)
    bus.emit('mt::window-zoom', 1.25)
    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(1.25)

    bus.off('mt::window-zoom', handler)
    bus.emit('mt::window-zoom', 1.5)
    expect(handler).toHaveBeenCalledOnce()
  })

  it('keeps payload-less events payload-less at runtime', () => {
    const handler = vi.fn()

    bus.on('flush-active-editor', handler)
    bus.emit('flush-active-editor')

    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(undefined)
  })

  it('has compile-time closed event names and payloads', () => {
    // These assertions deliberately rely on TypeScript diagnostics. If the
    // bus regresses to Record<string, unknown>, the @ts-expect-error markers
    // become unused and `pnpm typecheck` fails closed.
    // @ts-expect-error unknown renderer event names are forbidden
    bus.emit('arch05::not-a-real-event', undefined)

    // @ts-expect-error zoom is a number, not an arbitrary string
    bus.emit('mt::window-zoom', '125%')

    // @ts-expect-error tab ids are strings
    bus.emit('TABS::close-this', 42)

    // @ts-expect-error export dialog accepts only supported export kinds
    bus.emit('showExportDialog', 'docx')
  })
})
