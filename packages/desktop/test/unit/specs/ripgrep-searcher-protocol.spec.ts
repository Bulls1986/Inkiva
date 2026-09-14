import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import RipgrepDirectorySearcher from '@/node/ripgrepSearcher'

type RipgrepListener = (payload: unknown) => void
type RipgrepBridge = {
  start: Mock
  cancel: Mock
  ack: Mock
  onMatch: (handler: RipgrepListener) => () => void
  onProgress: (handler: RipgrepListener) => () => void
  onDone: (handler: RipgrepListener) => () => void
  onError: (handler: RipgrepListener) => () => void
  onCancelled: (handler: RipgrepListener) => () => void
}

const getBridge = (): RipgrepBridge => window.ripgrep as unknown as RipgrepBridge

describe('renderer ripgrep ACK protocol', () => {
  let listeners: Map<string, RipgrepListener>
  let previousRipgrep: typeof window.ripgrep
  let previousInkiva: typeof window.inkiva

  beforeEach(() => {
    previousRipgrep = window.ripgrep
    previousInkiva = window.inkiva
    listeners = new Map()
    const register = (channel: string, handler: RipgrepListener): (() => void) => {
      listeners.set(channel, handler)
      return () => listeners.delete(channel)
    }

    const bridge: RipgrepBridge = {
      start: vi.fn(() => Promise.resolve({ searchId: 'unused-by-renderer' })),
      cancel: vi.fn(),
      ack: vi.fn(),
      onMatch: (handler) => register('match', handler),
      onProgress: (handler) => register('progress', handler),
      onDone: (handler) => register('done', handler),
      onError: (handler) => register('error', handler),
      onCancelled: (handler) => register('cancelled', handler)
    }
    window.ripgrep = bridge as unknown as typeof window.ripgrep
    window.inkiva = undefined
  })

  afterEach(() => {
    window.ripgrep = previousRipgrep
    window.inkiva = previousInkiva
    vi.restoreAllMocks()
  })

  it('ACKs only the active search batch after the consumer callback returns', async() => {
    const didMatch = vi.fn()
    const search = new RipgrepDirectorySearcher().search(['/tmp'], 'needle', { didMatch })
    const bridge = getBridge()
    const request = bridge.start.mock.calls[0]?.[0] as { searchId: string }

    listeners.get('match')?.({ searchId: 'stale-search', batchId: 1, payload: 'stale' })
    listeners.get('match')?.({ searchId: request.searchId, batchId: 1, payload: 'batch-1' })

    expect(didMatch).toHaveBeenCalledTimes(1)
    expect(didMatch).toHaveBeenCalledWith('batch-1')
    expect(bridge.ack).toHaveBeenCalledWith(request.searchId, 1)

    listeners.get('done')?.({ searchId: request.searchId })
    await search
  })

  it('ACKs even when the renderer match consumer throws', async() => {
    const error = new Error('consumer failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const search = new RipgrepDirectorySearcher().search(['/tmp'], 'needle', {
      didMatch: () => {
        throw error
      }
    })
    const bridge = getBridge()
    const request = bridge.start.mock.calls[0]?.[0] as { searchId: string }

    listeners.get('match')?.({ searchId: request.searchId, batchId: 7, payload: 'batch-7' })

    expect(consoleError).toHaveBeenCalledWith(error)
    expect(bridge.ack).toHaveBeenCalledWith(request.searchId, 7)

    listeners.get('cancelled')?.({ searchId: request.searchId })
    await search
  })

  it('keeps legacy envelopes consumable without letting them affect explicit ACKs', async() => {
    const didMatch = vi.fn()
    const search = new RipgrepDirectorySearcher().search(['/tmp'], 'needle', { didMatch })
    const bridge = getBridge()
    const request = bridge.start.mock.calls[0]?.[0] as { searchId: string }

    listeners.get('match')?.({ searchId: request.searchId, payload: 'legacy-batch' })
    expect(didMatch).toHaveBeenCalledWith('legacy-batch')
    expect(bridge.ack).not.toHaveBeenCalled()

    listeners.get('match')?.({ searchId: request.searchId, batchId: 1, payload: 'explicit-batch' })
    expect(didMatch).toHaveBeenCalledWith('explicit-batch')
    expect(bridge.ack).toHaveBeenCalledWith(request.searchId, 1)

    listeners.get('done')?.({ searchId: request.searchId })
    await search
  })
})
