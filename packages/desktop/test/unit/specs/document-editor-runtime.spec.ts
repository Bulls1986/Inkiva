import { describe, expect, it, vi } from 'vitest'
import { DocumentRevisionSnapshotCache } from '@/services/documentRevisionSnapshot'
import { DocumentEditorRuntime } from '@/services/documentEditorRuntime'

const createRuntime = () => {
  const snapshots = new DocumentRevisionSnapshotCache({ maxCost: 10_000 })
  return { snapshots, runtime: new DocumentEditorRuntime({ snapshots }) }
}

describe('DocumentEditorRuntime', () => {
  it('owns registered runtime resources and disposes each exactly once', () => {
    const { runtime } = createRuntime()
    const first = vi.fn()
    const second = vi.fn()

    runtime.registerDisposable(first)
    runtime.registerDisposable(second)
    runtime.dispose()
    runtime.dispose()

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    expect(runtime.isDisposed).toBe(true)
  })

  it('fails closed when a new resource is registered after disposal', () => {
    const { runtime } = createRuntime()
    const late = vi.fn()

    runtime.dispose()

    expect(() => runtime.registerDisposable(late)).toThrow(/disposed/i)
    expect(late).not.toHaveBeenCalled()
  })

  it('owns subscription setup and teardown as one lifecycle resource', () => {
    const { runtime } = createRuntime()
    const handler = vi.fn()
    const subscribe = vi.fn((_handler: () => void) => undefined)
    const unsubscribe = vi.fn((_handler: () => void) => undefined)

    runtime.subscribe(subscribe, unsubscribe, handler)

    expect(subscribe).toHaveBeenCalledOnce()
    expect(subscribe).toHaveBeenCalledWith(handler)

    runtime.dispose()
    runtime.dispose()

    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(unsubscribe).toHaveBeenCalledWith(handler)
  })

  it('coordinates dirty revision allocation with deferred snapshot scheduling', () => {
    const snapshots = new DocumentRevisionSnapshotCache({ maxCost: 10_000 })
    const scheduler = {
      request: vi.fn(),
      flush: vi.fn(),
      dispose: vi.fn()
    }
    const runtime = new DocumentEditorRuntime({ snapshots, snapshotScheduler: scheduler })
    const markDirty = vi.fn(() => snapshots.advanceContentRevision('doc'))
    const capture = vi.fn()

    const revision = runtime.recordMutation('doc', markDirty, capture, false)

    expect(revision).toBe(1)
    expect(markDirty).toHaveBeenCalledWith('doc')
    expect(scheduler.request).toHaveBeenCalledOnce()
    const [id, scheduledCapture, immediate] = scheduler.request.mock.calls[0]
    expect(id).toBe('doc')
    expect(immediate).toBe(false)
    scheduledCapture('persistence')
    expect(capture).toHaveBeenCalledWith('doc', 1, 'persistence')

    runtime.flushSnapshot('doc', 'switch')
    expect(scheduler.flush).toHaveBeenCalledWith('doc', 'switch')

    runtime.dispose()
    expect(scheduler.dispose).toHaveBeenCalledOnce()
  })

  it('restores history for the current revision without exposing cache lookup timing', () => {
    const { snapshots, runtime } = createRuntime()
    runtime.activateDocument('doc', 3)
    snapshots.getHistoryMeta('doc', 3, () => ({ engineHistory: { undo: 1 } }))
    const apply = vi.fn()

    expect(runtime.restoreCurrentHistory<{ engineHistory: unknown }>('doc', apply)).toBe(true)
    expect(apply).toHaveBeenCalledWith({ engineHistory: { undo: 1 } })

    runtime.advanceContentRevision('doc')
    expect(runtime.restoreCurrentHistory<{ engineHistory: unknown }>('doc', apply)).toBe(false)
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('owns document lifecycle and monotonic content revision transitions', () => {
    const { snapshots, runtime } = createRuntime()

    expect(runtime.activateDocument('doc', 4)).toBe(4)
    expect(snapshots.inspect('doc')).toMatchObject({ revision: 4, lifecycle: 'active' })

    expect(runtime.advanceContentRevision('doc')).toBe(5)
    runtime.touchPresentation('doc')
    expect(runtime.currentRevision('doc')).toBe(5)

    runtime.setDocumentLifecycle('doc', 'warm')
    expect(snapshots.inspect('doc')).toMatchObject({ revision: 5, lifecycle: 'warm' })
  })

  it('reuses one revision markdown snapshot across persistence consumers', () => {
    const { runtime } = createRuntime()
    runtime.activateDocument('doc')
    const revision = runtime.advanceContentRevision('doc')
    const serialize = vi.fn(() => '# shared\n')

    expect(runtime.getMarkdown('doc', revision, serialize)).toBe('# shared\n')
    expect(runtime.getMarkdown('doc', revision, serialize)).toBe('# shared\n')
    expect(serialize).toHaveBeenCalledTimes(1)
  })
})
