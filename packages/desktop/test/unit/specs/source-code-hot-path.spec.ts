import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SourceSnapshotScheduler } from '@/components/editorWithTabs/sourceCodeHotPath'

describe('SourceSnapshotScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('coalesces source edits without reading the full document synchronously', () => {
    const scheduler = new SourceSnapshotScheduler({ delayMs: 50, maxWaitMs: 200 })
    const captures: number[] = []

    scheduler.request('tab-1', 1, (revision) => captures.push(revision))
    scheduler.request('tab-1', 2, (revision) => captures.push(revision))

    expect(captures).toEqual([])
    vi.advanceTimersByTime(49)
    expect(captures).toEqual([])

    vi.advanceTimersByTime(1)
    expect(captures).toEqual([2])

    scheduler.dispose()
  })

  it('flushes the newest source revision at a document boundary', () => {
    const scheduler = new SourceSnapshotScheduler({ delayMs: 50, maxWaitMs: 200 })
    const captures: number[] = []

    scheduler.request('tab-1', 7, (revision) => captures.push(revision))
    scheduler.request('tab-1', 8, (revision) => captures.push(revision))
    scheduler.flush('tab-1')

    expect(captures).toEqual([8])
    vi.runAllTimers()
    expect(captures).toEqual([])

    scheduler.dispose()
  })

  it('cancels a stale tab snapshot without invoking its capture callback', () => {
    const scheduler = new SourceSnapshotScheduler({ delayMs: 50, maxWaitMs: 200 })
    const capture = vi.fn()

    scheduler.request('tab-1', 1, capture)
    scheduler.cancel('tab-1')
    vi.advanceTimersByTime(500)

    expect(capture).not.toHaveBeenCalled()
    scheduler.dispose()
  })
})
