import { randomUUID } from 'node:crypto'
import { performance as nodePerformance } from 'node:perf_hooks'
import {
  isPerformanceEventName,
  isPerformancePhase,
  sanitizePerformanceIdentifier,
  sanitizePerformanceMetadata,
  PERFORMANCE_TRACE_SCHEMA_VERSION,
  type PerformanceEvent,
  type PerformanceEventName,
  type PerformancePhase,
  type PerformanceTrace
} from '@shared/types/performance'

let processTraceId: string | undefined

const getProcessTraceId = (): string => {
  processTraceId ??= randomUUID()
  return processTraceId
}

const defaultClock: MainPerformanceClock = {
  now: () => nodePerformance.now(),
  timeOriginEpochMs: nodePerformance.timeOrigin
}

export interface MainPerformanceClock {
  /** Monotonic milliseconds from this clock's time origin. */
  now: () => number
  /** Epoch milliseconds corresponding to the clock's zero point. */
  timeOriginEpochMs: number
}

export interface MainPerformanceEventOptions {
  phase: PerformancePhase
  operationId?: string
  documentId?: string
  /** Runtime input is unknown on purpose; invalid values are discarded safely. */
  metadata?: unknown
  /** Internal key used when the same event name needs more than one mark. */
  markId?: string
}

export interface MainPerformanceMeasureOptions extends MainPerformanceEventOptions {
  startMark: string
  endMark?: string
}

export interface MainPerformanceRecorderOptions {
  /** Capture is opt-in so constructing the recorder is side-effect free by default. */
  enabled?: boolean
  clock?: MainPerformanceClock
  /** Primarily useful for deterministic tests or an explicitly coordinated trace. */
  traceId?: string
}

interface MonotonicMark {
  monotonicMs: number
  timestampEpochMs: number
}

type MarkContext = Omit<MainPerformanceEventOptions, 'markId' | 'phase'> & {
  markId?: string
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const cloneEvent = (event: PerformanceEvent): PerformanceEvent => ({
  ...event,
  ...(event.metadata === undefined ? {} : { metadata: { ...event.metadata } })
})

export class MainPerformanceRecorder {
  readonly enabled: boolean
  private readonly clock: MainPerformanceClock
  readonly traceId: string
  readonly timeOriginEpochMs: number
  private readonly startedAtMonotonicMs: number
  readonly startedAtEpochMs: number
  private readonly events: PerformanceEvent[] = []
  private readonly marks = new Map<string, MonotonicMark>()
  private disposed = false

  constructor(options: MainPerformanceRecorderOptions = {}) {
    this.enabled = options.enabled ?? false
    this.clock = options.clock ?? defaultClock
    this.traceId = sanitizePerformanceIdentifier(options.traceId) ?? getProcessTraceId()
    this.timeOriginEpochMs = isFiniteNumber(this.clock.timeOriginEpochMs)
      ? this.clock.timeOriginEpochMs
      : defaultClock.timeOriginEpochMs

    const initialNow = this.enabled ? this.readNow() : 0
    this.startedAtMonotonicMs = initialNow ?? 0
    this.startedAtEpochMs = this.toEpochMs(this.startedAtMonotonicMs) ?? this.timeOriginEpochMs
  }

  mark(
    name: PerformanceEventName,
    options: MainPerformanceEventOptions
  ): PerformanceEvent | undefined
  mark(
    name: PerformanceEventName,
    phase: PerformancePhase,
    options?: MarkContext
  ): PerformanceEvent | undefined
  mark(
    name: PerformanceEventName,
    phaseOrOptions: PerformancePhase | MainPerformanceEventOptions,
    context: MarkContext = {}
  ): PerformanceEvent | undefined {
    if (!this.canCollect() || !isPerformanceEventName(name)) return undefined

    const options: MainPerformanceEventOptions =
      typeof phaseOrOptions === 'string' ? { ...context, phase: phaseOrOptions } : phaseOrOptions
    if (!isPerformancePhase(options.phase)) return undefined

    const monotonicMs = this.readNow()
    if (monotonicMs === undefined) return undefined
    const timestampEpochMs = this.toEpochMs(monotonicMs)
    if (timestampEpochMs === undefined) return undefined

    const event = this.createEvent(name, options, monotonicMs, timestampEpochMs)
    this.events.push(event)
    this.marks.set(options.markId ?? name, { monotonicMs, timestampEpochMs })
    return cloneEvent(event)
  }

  measure(
    name: PerformanceEventName,
    options: MainPerformanceMeasureOptions
  ): PerformanceEvent | undefined
  measure(
    name: PerformanceEventName,
    startMark: string,
    options: MainPerformanceEventOptions
  ): PerformanceEvent | undefined
  measure(
    name: PerformanceEventName,
    startMark: string,
    endMark: string,
    options: MainPerformanceEventOptions
  ): PerformanceEvent | undefined
  measure(
    name: PerformanceEventName,
    first: string | MainPerformanceMeasureOptions,
    second?: string | MainPerformanceEventOptions,
    third?: MainPerformanceEventOptions
  ): PerformanceEvent | undefined {
    if (!this.canCollect() || !isPerformanceEventName(name)) return undefined

    const invocation = this.normalizeMeasureInvocation(first, second, third)
    if (invocation === undefined) return undefined

    const start = this.marks.get(invocation.startMark)
    if (start === undefined) return undefined

    let end: MonotonicMark | undefined
    if (invocation.endMark !== undefined) {
      end = this.marks.get(invocation.endMark)
      if (end === undefined) return undefined
    } else {
      const monotonicMs = this.readNow()
      if (monotonicMs === undefined) return undefined
      const timestampEpochMs = this.toEpochMs(monotonicMs)
      if (timestampEpochMs === undefined) return undefined
      end = { monotonicMs, timestampEpochMs }
    }

    const event = this.createEvent(
      name,
      invocation.options,
      end.monotonicMs,
      end.timestampEpochMs,
      Math.max(0, end.monotonicMs - start.monotonicMs)
    )
    this.events.push(event)
    return cloneEvent(event)
  }

  snapshot(): PerformanceTrace {
    return {
      schemaVersion: PERFORMANCE_TRACE_SCHEMA_VERSION,
      traceId: this.traceId,
      process: 'main',
      startedAtEpochMs: this.startedAtEpochMs,
      timeOriginEpochMs: this.timeOriginEpochMs,
      events: this.events.map(cloneEvent)
    }
  }

  getTrace(): PerformanceTrace {
    return this.snapshot()
  }

  dispose(): void {
    this.disposed = true
    this.marks.clear()
  }

  private canCollect(): boolean {
    return this.enabled && !this.disposed
  }

  private readNow(): number | undefined {
    try {
      const value = this.clock.now()
      return isFiniteNumber(value) ? value : undefined
    } catch {
      return undefined
    }
  }

  private toEpochMs(monotonicMs: number): number | undefined {
    const timestampEpochMs = this.timeOriginEpochMs + monotonicMs
    return isFiniteNumber(timestampEpochMs) ? timestampEpochMs : undefined
  }

  private createEvent(
    name: PerformanceEventName,
    options: MainPerformanceEventOptions,
    monotonicMs: number,
    timestampEpochMs: number,
    durationMs?: number
  ): PerformanceEvent {
    const elapsedMs = Math.max(0, monotonicMs - this.startedAtMonotonicMs)
    const event: PerformanceEvent = {
      schemaVersion: PERFORMANCE_TRACE_SCHEMA_VERSION,
      name,
      process: 'main',
      phase: options.phase,
      traceId: this.traceId,
      timestampEpochMs,
      elapsedMs
    }

    const operationId = sanitizePerformanceIdentifier(options.operationId)
    if (operationId !== undefined) event.operationId = operationId

    const documentId = sanitizePerformanceIdentifier(options.documentId)
    if (documentId !== undefined) event.documentId = documentId

    if (durationMs !== undefined) event.durationMs = durationMs

    const metadata = sanitizePerformanceMetadata(options.metadata)
    if (metadata !== undefined) event.metadata = metadata

    return event
  }

  private normalizeMeasureInvocation(
    first: string | MainPerformanceMeasureOptions,
    second?: string | MainPerformanceEventOptions,
    third?: MainPerformanceEventOptions
  ): { startMark: string; endMark?: string; options: MainPerformanceEventOptions } | undefined {
    if (typeof first !== 'string') {
      if (typeof first.startMark !== 'string' || first.startMark.length === 0) return undefined
      return {
        startMark: first.startMark,
        endMark: first.endMark,
        options: first
      }
    }

    if (first.length === 0) return undefined
    if (typeof second === 'string') {
      if (second.length === 0 || third === undefined) return undefined
      return { startMark: first, endMark: second, options: third }
    }
    if (second === undefined) return undefined
    return { startMark: first, options: second }
  }
}

export const createMainPerformanceRecorder = (
  options: MainPerformanceRecorderOptions = {}
): MainPerformanceRecorder => new MainPerformanceRecorder(options)
