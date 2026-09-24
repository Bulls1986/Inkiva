import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AutosaveQueue, type AutosaveRequest } from '@/store/autosaveQueue'

const request = (revision: number): AutosaveRequest => ({
  id: 'doc-1',
  revision,
  filename: 'note.md',
  pathname: '/tmp/note.md',
  markdown: `revision-${revision}`,
  options: {}
})

describe('AutosaveQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('coalesces dirty revisions before starting one write', () => {
    const sent: AutosaveRequest[] = []
    const queue = new AutosaveQueue({ send: value => sent.push(value) })

    queue.schedule(request(1), 100)
    queue.schedule(request(2), 100)
    queue.schedule(request(3), 100)

    vi.advanceTimersByTime(99)
    expect(sent).toEqual([])

    vi.advanceTimersByTime(1)
    expect(sent.map(value => value.revision)).toEqual([3])

    queue.dispose()
  })

  it('reschedules the same document with the latest autosave delay and keeps other documents isolated', () => {
    const sent: AutosaveRequest[] = []
    const queue = new AutosaveQueue({ send: value => sent.push(value) })
    const other = { ...request(1), id: 'doc-2', pathname: '/tmp/other.md' }

    queue.schedule(request(1), 5000)
    queue.schedule(other, 2000)
    queue.schedule(request(2), 6200)

    vi.advanceTimersByTime(2000)
    expect(sent.map(value => value.id)).toEqual(['doc-2'])

    vi.advanceTimersByTime(4199)
    expect(sent.map(value => value.revision)).toEqual([1])

    vi.advanceTimersByTime(1)
    expect(sent.map(value => [value.id, value.revision])).toEqual([
      ['doc-2', 1],
      ['doc-1', 2]
    ])

    queue.dispose()
  })

  it('drops delayed autosave work when an explicit save supersedes it', () => {
    const sent: AutosaveRequest[] = []
    const queue = new AutosaveQueue({ send: value => sent.push(value) })

    queue.schedule(request(1), 100)
    queue.cancel('doc-1')
    vi.advanceTimersByTime(100)

    expect(sent).toEqual([])
    expect(queue.hasWork('doc-1')).toBe(false)

    queue.dispose()
  })

  it('never overlaps writes and does not let an old ack mark newer content clean', () => {
    const sent: AutosaveRequest[] = []
    const queue = new AutosaveQueue({ send: value => sent.push(value) })

    queue.schedule(request(1), 10)
    vi.advanceTimersByTime(10)
    expect(sent.map(value => value.revision)).toEqual([1])
    expect(queue.hasWork('doc-1')).toBe(true)

    queue.schedule(request(2), 10)
    vi.advanceTimersByTime(10)
    expect(sent.map(value => value.revision)).toEqual([1])

    expect(queue.acknowledge('doc-1', 1)).toMatchObject({
      request: request(1),
      isLatest: false,
      success: true
    })
    expect(sent.map(value => value.revision)).toEqual([1, 2])

    expect(queue.acknowledge('doc-1', 2)).toMatchObject({
      request: request(2),
      isLatest: true,
      success: true
    })
    expect(queue.hasWork('doc-1')).toBe(false)

    queue.dispose()
  })

  it('writes the undo-to-clean revision after the older dirty ack', () => {
    const sent: AutosaveRequest[] = []
    const queue = new AutosaveQueue({ send: value => sent.push(value) })
    const edited = { ...request(1), markdown: 'edited' }
    const undone = { ...request(2), markdown: 'original' }

    queue.schedule(edited, 0)
    vi.runOnlyPendingTimers()
    queue.schedule(undone, 0)
    vi.runOnlyPendingTimers()

    expect(sent).toEqual([edited])
    expect(queue.acknowledge('doc-1', 1)).toMatchObject({
      request: edited,
      isLatest: false,
      success: true
    })

    // The first ack cannot make the document clean: the queue still has to
    // persist the content restored by undo.
    vi.runOnlyPendingTimers()
    expect(sent).toEqual([edited, undone])
    expect(queue.acknowledge('doc-1', 2)).toMatchObject({
      request: undone,
      isLatest: true,
      success: true
    })
    expect(queue.hasWork('doc-1')).toBe(false)

    queue.dispose()
  })

  it('drains a pending revision after a failed write without overlapping it', () => {
    const sent: AutosaveRequest[] = []
    const queue = new AutosaveQueue({ send: value => sent.push(value) })

    queue.schedule(request(1), 0)
    vi.runOnlyPendingTimers()
    queue.schedule(request(2), 0)
    vi.runOnlyPendingTimers()

    expect(sent.map(value => value.revision)).toEqual([1])
    expect(queue.acknowledge('doc-1', 1, new Error('disk full'))).toMatchObject({
      request: request(1),
      isLatest: false,
      success: false
    })
    expect(sent.map(value => value.revision)).toEqual([1, 2])

    queue.dispose()
  })
})
