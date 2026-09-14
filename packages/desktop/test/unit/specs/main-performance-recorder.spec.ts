import { describe, expect, it } from 'vitest'
import {
  createMainPerformanceRecorder,
  type MainPerformanceClock
} from 'main_renderer/performance/recorder'

class TestClock implements MainPerformanceClock {
  readonly timeOriginEpochMs: number
  reads = 0
  private currentNow: number

  constructor(timeOriginEpochMs: number, initialNow: number) {
    this.timeOriginEpochMs = timeOriginEpochMs
    this.currentNow = initialNow
  }

  now(): number {
    this.reads += 1
    return this.currentNow
  }

  advance(milliseconds: number): void {
    this.currentNow += milliseconds
  }
}

describe('MainPerformanceRecorder', () => {
  it('does not collect events or create file side effects when disabled', () => {
    const clock = new TestClock(1_700_000_000_000, 100)
    const recorder = createMainPerformanceRecorder({ enabled: false, clock })

    expect(
      recorder.mark('process_entry', {
        phase: 'startup',
        metadata: { shouldNotBeRecorded: true }
      })
    ).toBeUndefined()
    expect(
      recorder.measure('electron_ready', {
        startMark: 'process_entry',
        phase: 'startup'
      })
    ).toBeUndefined()
    expect(clock.reads).toBe(0)
    expect(recorder.getTrace().events).toEqual([])
    expect(JSON.stringify(recorder.snapshot())).toContain('"events":[]')
  })

  it('keeps one trace id stable for the application process', () => {
    const clock = new TestClock(1_700_000_000_000, 100)
    const first = createMainPerformanceRecorder({ enabled: true, clock })
    const second = createMainPerformanceRecorder({ enabled: true, clock })

    first.mark('process_entry', { phase: 'startup' })
    second.mark('process_entry', { phase: 'startup' })

    expect(first.getTrace().traceId).toBe(second.getTrace().traceId)
    expect(first.getTrace().events[0]?.traceId).toBe(first.getTrace().traceId)
    expect(second.getTrace().events[0]?.traceId).toBe(second.getTrace().traceId)
  })

  it('preserves collection order and records main-process event context', () => {
    const clock = new TestClock(1_700_000_000_000, 100)
    const recorder = createMainPerformanceRecorder({
      enabled: true,
      clock,
      traceId: 'trace-order'
    })

    recorder.mark('process_entry', {
      phase: 'startup',
      operationId: 'startup-1',
      documentId: 'document-1',
      metadata: { source: 'unit-test', attempt: 1 }
    })
    clock.advance(12.5)
    recorder.mark('electron_ready', { phase: 'startup' })

    const events = recorder.getTrace().events
    expect(events.map((event) => event.name)).toEqual(['process_entry', 'electron_ready'])
    expect(events[0]).toMatchObject({
      schemaVersion: 1,
      process: 'main',
      phase: 'startup',
      traceId: 'trace-order',
      operationId: 'startup-1',
      documentId: 'document-1',
      timestampEpochMs: 1_700_000_000_100,
      elapsedMs: 0,
      metadata: { source: 'unit-test', attempt: 1 }
    })
    expect(events[1]).toMatchObject({
      process: 'main',
      timestampEpochMs: 1_700_000_000_112.5,
      elapsedMs: 12.5
    })
  })

  it('measures duration with the injected main monotonic clock', () => {
    const clock = new TestClock(1_700_000_000_000, 20)
    const recorder = createMainPerformanceRecorder({
      enabled: true,
      clock,
      traceId: 'trace-measure'
    })

    recorder.mark('create_window_start', { phase: 'startup' })
    clock.advance(37)
    recorder.mark('browser_window_created', { phase: 'startup' })
    const measured = recorder.measure('load_url_start', {
      startMark: 'create_window_start',
      endMark: 'browser_window_created',
      phase: 'startup',
      operationId: 'window-1'
    })

    expect(measured).toMatchObject({
      name: 'load_url_start',
      process: 'main',
      timestampEpochMs: 1_700_000_000_057,
      durationMs: 37,
      operationId: 'window-1'
    })
    expect(recorder.getTrace().events.at(-1)).toEqual(measured)
  })

  it('sanitizes invalid or oversized metadata into JSON-safe values', () => {
    const clock = new TestClock(1_700_000_000_000, 1)
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const metadata: Record<string, unknown> = {
      validString: 'ok',
      validNumber: 2,
      validBoolean: true,
      validNull: null,
      invalidObject: { nested: true },
      invalidArray: ['not', 'supported'],
      invalidNumber: Number.NaN,
      invalidInfinity: Number.POSITIVE_INFINITY,
      invalidUndefined: undefined,
      invalidBigInt: BigInt(1),
      circular,
      oversizedString: 'x'.repeat(10_000)
    }
    Object.defineProperty(metadata, 'throwingGetter', {
      enumerable: true,
      get() {
        throw new Error('metadata getter failed')
      }
    })

    const recorder = createMainPerformanceRecorder({
      enabled: true,
      clock,
      traceId: 'trace-json'
    })
    recorder.mark('process_entry', { phase: 'startup', metadata })

    const trace = recorder.snapshot()
    expect(() => JSON.stringify(trace)).not.toThrow()
    const parsed = JSON.parse(JSON.stringify(trace)) as typeof trace
    const sanitized = parsed.events[0]?.metadata

    expect(sanitized).toMatchObject({
      validString: 'ok',
      validNumber: 2,
      validBoolean: true,
      validNull: null
    })
    expect(sanitized).not.toHaveProperty('invalidObject')
    expect(sanitized).not.toHaveProperty('invalidArray')
    expect(sanitized).not.toHaveProperty('invalidNumber')
    expect(sanitized).not.toHaveProperty('invalidBigInt')
    expect(sanitized).not.toHaveProperty('circular')
    expect(sanitized).not.toHaveProperty('throwingGetter')
    const oversizedString = sanitized?.oversizedString
    expect(typeof oversizedString).toBe('string')
    expect(oversizedString).toHaveLength(1_024)
  })

  it('stops collecting after dispose while preserving the completed trace', () => {
    const clock = new TestClock(1_700_000_000_000, 10)
    const recorder = createMainPerformanceRecorder({
      enabled: true,
      clock,
      traceId: 'trace-dispose'
    })
    recorder.mark('process_entry', { phase: 'startup' })

    recorder.dispose()
    clock.advance(10)

    expect(recorder.mark('electron_ready', { phase: 'startup' })).toBeUndefined()
    expect(
      recorder.measure('load_url_start', {
        startMark: 'process_entry',
        phase: 'startup'
      })
    ).toBeUndefined()
    expect(recorder.getTrace().events).toHaveLength(1)
    expect(recorder.getTrace().events[0]?.name).toBe('process_entry')
  })
  it('records metric samples without mixing process clocks', () => {
    const { recorder, clock } = createRecorder()
    setClockNow(clock, 15)

    const event = recorder.recordSample('memory.main.privateBytes', 'bytes', 2_048, {
      phase: 'memory',
      metadata: { source: 'process-memory' }
    })

    expect(event).toMatchObject({
      name: 'metric_sample',
      process: 'main',
      phase: 'memory',
      metadata: {
        metric: 'memory.main.privateBytes',
        unit: 'bytes',
        value: 2_048,
        source: 'process-memory'
      }
    })
  })
})
