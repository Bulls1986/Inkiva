import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  WATCHER_EVENT_DEBOUNCE_MS,
  WatcherEventBatcher,
  type WatcherBatchChannel
} from 'main_renderer/filesystem/watcherBatch'

describe('watcher event batcher', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces and coalesces repeated path events to the latest payload', () => {
    vi.useFakeTimers()
    const sent: Array<{ channel: WatcherBatchChannel; payload: unknown }> = []
    const batcher = new WatcherEventBatcher({
      send: (channel, payload) => sent.push({ channel, payload })
    })

    batcher.enqueue('mt::update-object-tree', { type: 'add', version: 1 }, '/a.md')
    batcher.enqueue('mt::update-object-tree', { type: 'change', version: 2 }, '/a.md')

    expect(sent).toEqual([])
    expect(batcher.pendingCount).toBe(1)
    vi.advanceTimersByTime(WATCHER_EVENT_DEBOUNCE_MS)

    expect(sent).toEqual([
      { channel: 'mt::update-object-tree', payload: { type: 'change', version: 2 } }
    ])
    expect(batcher.pendingCount).toBe(0)
  })

  it('keeps distinct channels and paths in one bounded flush', () => {
    const sent: Array<{ channel: WatcherBatchChannel; payload: unknown }> = []
    const batcher = new WatcherEventBatcher({
      send: (channel, payload) => sent.push({ channel, payload }),
      debounceMs: 1000
    })

    batcher.enqueue('mt::update-object-tree', { type: 'unlink', path: '/a.md' }, '/a.md')
    batcher.enqueue('mt::update-file', { type: 'change', path: '/a.md' }, '/a.md')
    batcher.enqueue('mt::update-object-tree', { type: 'add', path: '/b.md' }, '/b.md')

    expect(batcher.flushNow()).toBe(3)
    expect(sent.map(({ channel }) => channel)).toEqual([
      'mt::update-object-tree',
      'mt::update-file',
      'mt::update-object-tree'
    ])
  })

  it('bounds each flush and yields the remaining events', () => {
    vi.useFakeTimers()
    const send = vi.fn()
    const batcher = new WatcherEventBatcher({
      send,
      maxEventsPerFlush: 2,
      debounceMs: 1000
    })

    batcher.enqueue('mt::update-object-tree', { path: '/a.md' }, '/a.md')
    batcher.enqueue('mt::update-object-tree', { path: '/b.md' }, '/b.md')
    batcher.enqueue('mt::update-object-tree', { path: '/c.md' }, '/c.md')

    expect(batcher.flushNow()).toBe(2)
    expect(send).toHaveBeenCalledTimes(2)
    expect(batcher.pendingCount).toBe(1)

    vi.runAllTimers()

    expect(send).toHaveBeenCalledTimes(3)
    expect(batcher.pendingCount).toBe(0)
  })

  it('does not emit after close and cancels the debounce timer', () => {
    vi.useFakeTimers()
    const send = vi.fn()
    const batcher = new WatcherEventBatcher({
      send,
      debounceMs: 25
    })

    batcher.enqueue('mt::update-file', { type: 'change' }, '/a.md')
    batcher.close()
    vi.advanceTimersByTime(25)

    expect(send).not.toHaveBeenCalled()
    expect(batcher.pendingCount).toBe(0)
  })

  it('isolates a sender failure and continues flushing remaining events', () => {
    const send = vi.fn((channel: WatcherBatchChannel) => {
      if (channel === 'mt::update-file') throw new Error('window closed')
    })
    const errors: unknown[] = []
    const batcher = new WatcherEventBatcher({
      send,
      onSendError: (error) => errors.push(error),
      debounceMs: 1000
    })

    batcher.enqueue('mt::update-file', {}, '/a.md')
    batcher.enqueue('mt::update-object-tree', {}, '/b.md')

    expect(batcher.flushNow()).toBe(2)
    expect(send).toHaveBeenCalledTimes(2)
    expect(errors).toHaveLength(1)
  })
})
