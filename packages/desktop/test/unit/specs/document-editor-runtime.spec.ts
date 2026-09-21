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
