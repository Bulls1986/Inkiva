import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  PerformanceEvent,
  PerformanceEventName,
  PerformancePhase
} from '@shared/types/performance'
import {
  createRendererPerformanceRecorder,
  type RendererPerformanceContext,
  type RendererPerformanceRecorder,
  type RendererPerformanceSink
} from '@/services/performance/renderer'

type TestClock = {
  timeOrigin: number
  now: ReturnType<typeof vi.fn<() => number>>
}

type LongTaskEntry = {
  entryType: 'longtask'
  name: string
  startTime: number
  duration: number
}

type EntryList = {
  getEntries: () => PerformanceEntry[]
}

class TestPerformanceObserver {
  static instances: TestPerformanceObserver[] = []

  readonly observe = vi.fn()
  readonly disconnect = vi.fn()

  private readonly callback: (list: EntryList) => void

  constructor(callback: (list: EntryList) => void) {
    this.callback = callback
    TestPerformanceObserver.instances.push(this)
  }

  emit(...entries: LongTaskEntry[]): void {
    this.callback({
      getEntries: () => entries as unknown as PerformanceEntry[]
    })
  }
}

const createClock = (initialNow = 10, timeOrigin = 1_700_000_000_000): TestClock => {
  const currentNow = initialNow
  return {
    timeOrigin,
    now: vi.fn(() => currentNow)
  }
}

const setClockNow = (clock: TestClock, value: number): void => {
  clock.now.mockImplementation(() => value)
}

const createRecorder = (
  overrides: Partial<{
    enabled: boolean
    traceId: string
    clock: TestClock
    phase: PerformancePhase
    longTaskContext: RendererPerformanceContext
  }> = {}
): {
  recorder: RendererPerformanceRecorder
  clock: TestClock
  sink: ReturnType<typeof vi.fn<RendererPerformanceSink>>
} => {
  const clock = overrides.clock ?? createClock()
  const sink = vi.fn<RendererPerformanceSink>()
  const recorder = createRendererPerformanceRecorder({
    enabled: overrides.enabled ?? true,
    traceId: overrides.traceId ?? 'trace-renderer-test',
    performance: clock,
    performanceObserver: TestPerformanceObserver,
    longTaskContext: overrides.longTaskContext ?? {
      phase: overrides.phase ?? 'editor'
    },
    sink
  })

  return { recorder, clock, sink }
}

const eventAt = (
  sink: ReturnType<typeof vi.fn<RendererPerformanceSink>>,
  index = 0
): PerformanceEvent => {
  const event = sink.mock.calls[index]?.[0]
  if (!event) throw new Error(`Expected performance event at index ${index}`)
  return event
}

afterEach(() => {
  TestPerformanceObserver.instances = []
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('RendererPerformanceRecorder', () => {
  it('does not collect or create an observer when disabled', () => {
    const clock = createClock()
    const sink = vi.fn<RendererPerformanceSink>()
    const recorder = createRendererPerformanceRecorder({
      enabled: false,
      performance: clock,
      performanceObserver: TestPerformanceObserver,
      sink
    })

    recorder.mark('renderer_bootstrap_start', { phase: 'startup' })
    recorder.measure('renderer_bootstrap_start', 'renderer_bootstrap_start', { phase: 'startup' })

    expect(sink).not.toHaveBeenCalled()
    expect(clock.now).not.toHaveBeenCalled()
    expect(TestPerformanceObserver.instances).toHaveLength(0)
  })

  it('converts renderer monotonic mark time to an epoch timestamp using timeOrigin', () => {
    const { recorder, clock, sink } = createRecorder()
    setClockNow(clock, 37)

    recorder.mark('renderer_bootstrap_start', {
      phase: 'startup',
      operationId: 'boot-1',
      documentId: 'doc-1',
      metadata: {
        attempt: 1,
        cold: true,
        note: 'shell',
        missing: undefined,
        nested: { ignored: true },
        invalidNumber: Number.NaN,
        invalidInfinity: Number.POSITIVE_INFINITY,
        oversized: 'x'.repeat(2_000)
      }
    })

    expect(eventAt(sink)).toEqual({
      schemaVersion: 1,
      name: 'renderer_bootstrap_start',
      process: 'renderer',
      phase: 'startup',
      traceId: 'trace-renderer-test',
      operationId: 'boot-1',
      documentId: 'doc-1',
      timestampEpochMs: 1_700_000_000_037,
      elapsedMs: 27,
      metadata: {
        attempt: 1,
        cold: true,
        note: 'shell',
        oversized: 'x'.repeat(1_024)
      }
    })
  })

  it('records a measure duration from a prior mark without mixing process clocks', () => {
    const { recorder, clock, sink } = createRecorder()
    setClockNow(clock, 12)
    recorder.mark('muya_init_start', { phase: 'document-open' })

    setClockNow(clock, 58)
    recorder.measure('muya_init_end', 'muya_init_start', {
      phase: 'document-open',
      operationId: 'open-1',
      documentId: 'doc-1',
      metadata: { source: 'session' }
    })

    expect(sink).toHaveBeenCalledTimes(2)
    expect(eventAt(sink, 1)).toEqual({
      schemaVersion: 1,
      name: 'muya_init_end',
      process: 'renderer',
      phase: 'document-open',
      traceId: 'trace-renderer-test',
      operationId: 'open-1',
      documentId: 'doc-1',
      timestampEpochMs: 1_700_000_000_058,
      elapsedMs: 48,
      durationMs: 46,
      metadata: {
        source: 'session'
      }
    })
  })

  it('does not emit a measure when its start mark is unknown', () => {
    const { recorder, sink } = createRecorder()

    recorder.measure('muya_init_end', 'missing-mark', { phase: 'document-open' })

    expect(sink).not.toHaveBeenCalled()
  })

  it('observes long tasks when supported and maps their renderer timeline to epoch time', () => {
    const { sink } = createRecorder({
      phase: 'editor',
      longTaskContext: {
        phase: 'editor',
        operationId: 'edit-1',
        documentId: 'doc-1',
        metadata: { source: 'long-task-test' }
      }
    })

    const observer = TestPerformanceObserver.instances[0]
    expect(observer).toBeDefined()
    expect(observer?.observe).toHaveBeenCalledWith({ type: 'longtask', buffered: true })

    observer?.emit({
      entryType: 'longtask',
      name: 'self',
      startTime: 120,
      duration: 85
    })

    expect(eventAt(sink)).toEqual({
      schemaVersion: 1,
      name: 'long_task',
      process: 'renderer',
      phase: 'editor',
      traceId: 'trace-renderer-test',
      operationId: 'edit-1',
      documentId: 'doc-1',
      timestampEpochMs: 1_700_000_000_120,
      elapsedMs: 110,
      durationMs: 85,
      metadata: {
        source: 'long-task-test'
      }
    })
  })

  it('ignores buffered long tasks that started before this trace', () => {
    const { recorder, sink } = createRecorder()
    const observer = TestPerformanceObserver.instances[0]
    expect(observer).toBeDefined()

    observer?.emit({
      entryType: 'longtask',
      name: 'buffered-before-trace',
      startTime: 9,
      duration: 100
    })

    expect(sink).not.toHaveBeenCalled()
    recorder.dispose()
  })

  it('supports independent mark ids and an explicit measure end mark', () => {
    const { recorder, clock, sink } = createRecorder()
    setClockNow(clock, 20)
    recorder.mark('document_open_start', {
      phase: 'document-open',
      markId: 'open-1-start'
    })

    setClockNow(clock, 52)
    recorder.mark('muya_init_end', {
      phase: 'document-open',
      markId: 'open-1-end'
    })

    const measured = recorder.measure('first_editor_interactive', {
      phase: 'document-open',
      startMark: 'open-1-start',
      endMark: 'open-1-end',
      operationId: 'open-1'
    })

    expect(measured).toMatchObject({
      name: 'first_editor_interactive',
      timestampEpochMs: 1_700_000_000_052,
      durationMs: 32,
      operationId: 'open-1'
    })
    expect(sink).toHaveBeenCalledTimes(3)
  })

  it('feature-detects a missing PerformanceObserver without throwing', () => {
    vi.stubGlobal('PerformanceObserver', undefined)
    const sink = vi.fn<RendererPerformanceSink>()

    expect(() =>
      createRendererPerformanceRecorder({
        enabled: true,
        performance: createClock(),
        sink,
        longTaskContext: { phase: 'editor' }
      })
    ).not.toThrow()

    expect(sink).not.toHaveBeenCalled()
  })

  it('disconnects the observer and ignores stale callbacks and marks after dispose', () => {
    const { recorder, sink } = createRecorder()
    const observer = TestPerformanceObserver.instances[0]
    expect(observer).toBeDefined()

    recorder.mark('app_shell_mounted', { phase: 'startup' })
    recorder.dispose()
    recorder.mark('editor_shell_mounted', { phase: 'startup' })
    recorder.measure('editor_shell_mounted', 'app_shell_mounted', { phase: 'startup' })
    observer?.emit({
      entryType: 'longtask',
      name: 'stale',
      startTime: 99,
      duration: 10
    })

    expect(observer?.disconnect).toHaveBeenCalledOnce()
    expect(sink).toHaveBeenCalledTimes(1)
    expect(eventAt(sink).name).toBe('app_shell_mounted')

    recorder.dispose()
    expect(observer?.disconnect).toHaveBeenCalledOnce()
  })

  it('returns no event when a recorder is already disposed', () => {
    const { recorder } = createRecorder()
    recorder.dispose()

    expect(recorder.mark('first_editor_interactive', { phase: 'editor' })).toBeUndefined()
    expect(
      recorder.measure('first_editor_interactive', 'missing', { phase: 'editor' })
    ).toBeUndefined()
  })

  it('keeps the event catalog type-safe at the recorder boundary', () => {
    const { recorder, sink } = createRecorder()
    const name: PerformanceEventName = 'document_open_start'

    recorder.mark(name, { phase: 'document-open' })

    expect(eventAt(sink).name).toBe('document_open_start')
  })
})
