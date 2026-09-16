import {
  isPerformanceEventName,
  isPerformancePhase,
  isPerformanceSampleUnit,
  PERFORMANCE_TRACE_SCHEMA_VERSION,
  sanitizePerformanceIdentifier,
  sanitizePerformanceMetadata,
  type PerformanceEvent,
  type PerformanceEventName,
  type PerformancePhase,
  type PerformanceSampleUnit
} from '@shared/types/performance'

/**
 * The renderer clock is intentionally injected so tests can control the
 * monotonic timeline. `timeOrigin` and `now()` are always read from the same
 * renderer Performance object; they must never be mixed with another
 * process's clock or with Date.now().
 */
export type RendererPerformanceClock = Pick<Performance, 'now' | 'timeOrigin'>

export type RendererPerformanceMetadataInput = Record<string, unknown>

export interface RendererPerformanceContext {
  phase: PerformancePhase
  operationId?: string
  documentId?: string
  /** Runtime values are sanitized into the shared flat JSON-safe metadata shape. */
  metadata?: RendererPerformanceMetadataInput
  /** Internal key used when the same event name needs more than one mark. */
  markId?: string
}

export interface RendererPerformanceMeasureOptions extends RendererPerformanceContext {
  startMark: string
  endMark?: string
}

export type RendererPerformanceSink = (event: PerformanceEvent) => void

export interface RendererPerformanceObserverEntryList {
  getEntries: () => PerformanceEntry[]
}

export interface RendererPerformanceObserverLike {
  observe: (options: PerformanceObserverInit) => void
  disconnect: () => void
}

export type RendererPerformanceObserverCallback = (
  list: RendererPerformanceObserverEntryList
) => void

export type RendererPerformanceObserverConstructor = new (
  callback: RendererPerformanceObserverCallback
) => RendererPerformanceObserverLike

export type RendererPerformanceContextProvider =
  | RendererPerformanceContext
  | (() => RendererPerformanceContext)

export interface RendererPerformanceRecorderOptions {
  sink: RendererPerformanceSink
  enabled?: boolean
  traceId?: string
  performance?: RendererPerformanceClock
  performanceObserver?: RendererPerformanceObserverConstructor | null
  longTaskContext?: RendererPerformanceContextProvider
}

const DEFAULT_PHASE: PerformancePhase = 'editor'

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const getDefaultPerformance = (): RendererPerformanceClock | undefined => {
  const candidate = (
    globalThis as typeof globalThis & {
      performance?: Partial<Performance>
    }
  ).performance

  if (!candidate || typeof candidate.now !== 'function' || !isFiniteNumber(candidate.timeOrigin)) {
    return undefined
  }

  return candidate as RendererPerformanceClock
}

const getDefaultPerformanceObserver = (): RendererPerformanceObserverConstructor | undefined => {
  const candidate = (
    globalThis as typeof globalThis & {
      PerformanceObserver?: unknown
    }
  ).PerformanceObserver

  return typeof candidate === 'function'
    ? (candidate as RendererPerformanceObserverConstructor)
    : undefined
}

const createTraceId = (): string => {
  const cryptoObject = (
    globalThis as typeof globalThis & {
      crypto?: { randomUUID?: () => string }
    }
  ).crypto

  if (typeof cryptoObject?.randomUUID === 'function') {
    return cryptoObject.randomUUID()
  }

  return `renderer-${Math.random().toString(36).slice(2)}`
}

export class RendererPerformanceRecorder {
  readonly enabled: boolean
  readonly traceId: string
  readonly timeOriginEpochMs?: number
  readonly startedAtEpochMs?: number

  private readonly sink: RendererPerformanceSink
  private readonly clock?: RendererPerformanceClock
  private readonly traceStartNow?: number
  private readonly marks = new Map<string, RendererPerformanceMark>()
  private readonly longTaskContext?: RendererPerformanceContextProvider
  private observer?: RendererPerformanceObserverLike
  private disposed = false

  constructor(options: RendererPerformanceRecorderOptions) {
    this.enabled = options.enabled === true
    this.sink = options.sink
    this.traceId = options.traceId ?? (this.enabled ? createTraceId() : '')

    // Disabled capture must have no observable setup side effects: in
    // particular, do not read the clock, construct an observer, or retain
    // marks when collection is disabled.
    if (!this.enabled) return

    const clock = options.performance ?? getDefaultPerformance()
    if (!clock || !isFiniteNumber(clock.timeOrigin)) return

    this.clock = clock
    this.timeOriginEpochMs = clock.timeOrigin

    const traceStartNow = this.readClockNow()
    if (traceStartNow === undefined) return

    this.traceStartNow = traceStartNow
    this.startedAtEpochMs = clock.timeOrigin + traceStartNow
    this.longTaskContext = options.longTaskContext

    const observerConstructor =
      options.performanceObserver === undefined
        ? getDefaultPerformanceObserver()
        : options.performanceObserver

    if (observerConstructor) {
      this.observeLongTasks(observerConstructor)
    }
  }

  mark(
    name: PerformanceEventName,
    options: RendererPerformanceContext
  ): PerformanceEvent | undefined
  mark(
    name: PerformanceEventName,
    phase: PerformancePhase,
    options?: Omit<RendererPerformanceContext, 'phase'>
  ): PerformanceEvent | undefined
  mark(
    name: PerformanceEventName,
    phaseOrOptions: PerformancePhase | RendererPerformanceContext,
    context: Omit<RendererPerformanceContext, 'phase'> = {}
  ): PerformanceEvent | undefined {
    if (!this.canCollect() || !isPerformanceEventName(name)) return undefined

    const options: RendererPerformanceContext =
      typeof phaseOrOptions === 'string' ? { ...context, phase: phaseOrOptions } : phaseOrOptions
    if (!isPerformancePhase(options.phase)) return undefined

    const timestampNow = this.readClockNow()
    if (timestampNow === undefined) return undefined

    const timestampEpochMs = this.toEpochMs(timestampNow)
    if (timestampEpochMs === undefined) return undefined

    const event = this.createEvent(name, options, timestampNow, timestampEpochMs)
    this.marks.set(sanitizePerformanceIdentifier(options.markId) ?? name, {
      monotonicMs: timestampNow,
      timestampEpochMs
    })

    return this.deliver(event)
  }

  recordSample(
    metric: string,
    unit: PerformanceSampleUnit,
    value: number,
    context: RendererPerformanceContext
  ): PerformanceEvent | undefined {
    const metricName = sanitizePerformanceIdentifier(metric)
    if (!this.canCollect() || !metricName || !isPerformanceSampleUnit(unit)) return undefined
    if (!isFiniteNumber(value) || value < 0) return undefined

    const timestampNow = this.readClockNow()
    if (timestampNow === undefined) return undefined
    const timestampEpochMs = this.toEpochMs(timestampNow)
    if (timestampEpochMs === undefined) return undefined

    const metadata = {
      ...(context.metadata ?? {}),
      metric: metricName,
      unit,
      value
    }
    const event = this.createEvent(
      'metric_sample',
      { ...context, metadata },
      timestampNow,
      timestampEpochMs
    )
    return this.deliver(event)
  }

  measure(
    name: PerformanceEventName,
    options: RendererPerformanceMeasureOptions
  ): PerformanceEvent | undefined
  measure(
    name: PerformanceEventName,
    startMark: string,
    options: RendererPerformanceContext
  ): PerformanceEvent | undefined
  measure(
    name: PerformanceEventName,
    startMark: string,
    endMark: string,
    options: RendererPerformanceContext
  ): PerformanceEvent | undefined
  measure(
    name: PerformanceEventName,
    first: string | RendererPerformanceMeasureOptions,
    second?: string | RendererPerformanceContext,
    third?: RendererPerformanceContext
  ): PerformanceEvent | undefined {
    if (!this.canCollect() || !isPerformanceEventName(name)) return undefined

    const invocation = this.normalizeMeasureInvocation(first, second, third)
    if (invocation === undefined) return undefined

    const start = this.marks.get(invocation.startMark)
    if (start === undefined) return undefined

    let end: RendererPerformanceMark
    if (invocation.endMark !== undefined) {
      const endMark = this.marks.get(invocation.endMark)
      if (endMark === undefined) return undefined
      end = endMark
    } else {
      const timestampNow = this.readClockNow()
      if (timestampNow === undefined) return undefined

      const timestampEpochMs = this.toEpochMs(timestampNow)
      if (timestampEpochMs === undefined) return undefined
      end = { monotonicMs: timestampNow, timestampEpochMs }
    }

    const event = this.createEvent(
      name,
      invocation.options,
      end.monotonicMs,
      end.timestampEpochMs,
      Math.max(0, end.monotonicMs - start.monotonicMs)
    )
    return this.deliver(event)
  }

  recordMark(
    name: PerformanceEventName,
    options: RendererPerformanceContext
  ): PerformanceEvent | undefined
  recordMark(
    name: PerformanceEventName,
    phase: PerformancePhase,
    options?: Omit<RendererPerformanceContext, 'phase'>
  ): PerformanceEvent | undefined
  recordMark(
    name: PerformanceEventName,
    phaseOrOptions: PerformancePhase | RendererPerformanceContext,
    context: Omit<RendererPerformanceContext, 'phase'> = {}
  ): PerformanceEvent | undefined {
    return typeof phaseOrOptions === 'string'
      ? this.mark(name, phaseOrOptions, context)
      : this.mark(name, phaseOrOptions)
  }

  recordMeasure(
    name: PerformanceEventName,
    options: RendererPerformanceMeasureOptions
  ): PerformanceEvent | undefined
  recordMeasure(
    name: PerformanceEventName,
    startMark: string,
    options: RendererPerformanceContext
  ): PerformanceEvent | undefined
  recordMeasure(
    name: PerformanceEventName,
    startMark: string,
    endMark: string,
    options: RendererPerformanceContext
  ): PerformanceEvent | undefined
  recordMeasure(
    name: PerformanceEventName,
    first: string | RendererPerformanceMeasureOptions,
    second?: string | RendererPerformanceContext,
    third?: RendererPerformanceContext
  ): PerformanceEvent | undefined {
    if (typeof first !== 'string') return this.measure(name, first)
    if (typeof second === 'string') {
      if (third === undefined) return undefined
      return this.measure(name, first, second, third)
    }
    if (second === undefined) return undefined
    return this.measure(name, first, second)
  }

  get longTaskObserverAvailable(): boolean {
    return this.observer !== undefined
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.marks.clear()

    const observer = this.observer
    this.observer = undefined
    if (!observer) return

    try {
      observer.disconnect()
    } catch {
      // Instrumentation cleanup must not surface a renderer error.
    }
  }

  private canCollect(): boolean {
    return (
      this.enabled && !this.disposed && this.clock !== undefined && this.traceStartNow !== undefined
    )
  }

  private readClockNow(): number | undefined {
    if (!this.clock) return undefined

    try {
      const value = this.clock.now()
      return isFiniteNumber(value) ? value : undefined
    } catch {
      return undefined
    }
  }

  private observeLongTasks(observerConstructor: RendererPerformanceObserverConstructor): void {
    const callback: RendererPerformanceObserverCallback = (list) => {
      this.handleLongTaskEntries(list)
    }
    const PerformanceObserverConstructor = observerConstructor

    let observer: RendererPerformanceObserverLike | undefined
    try {
      observer = new PerformanceObserverConstructor(callback)
      observer.observe({ type: 'longtask', buffered: true })
      this.observer = observer
    } catch {
      try {
        observer?.disconnect()
      } catch {
        // Ignore a partially initialized observer during feature detection.
      }

      // Some implementations support longtask observation but reject the
      // `type`/`buffered` form. Retry with the older entryTypes form without
      // making unsupported observers fatal to the renderer.
      try {
        observer = new PerformanceObserverConstructor(callback)
        observer.observe({ entryTypes: ['longtask'] })
        this.observer = observer
      } catch {
        try {
          observer?.disconnect()
        } catch {
          // Ignore observer cleanup failures.
        }
      }
    }
  }

  private handleLongTaskEntries(list: RendererPerformanceObserverEntryList): void {
    if (!this.canCollect()) return

    let entries: PerformanceEntry[]
    try {
      entries = list.getEntries()
    } catch {
      return
    }

    try {
      for (const entry of entries) {
        if (entry.entryType !== 'longtask') continue
        if (!isFiniteNumber(entry.startTime) || !isFiniteNumber(entry.duration)) continue
        if (entry.duration < 0) continue

        // Buffered entries may predate this recorder. They belong to another
        // trace and must not appear as if they happened in this one.
        if (entry.startTime < this.traceStartNow!) continue

        const context = this.resolveLongTaskContext()
        if (!isPerformancePhase(context.phase)) continue

        const timestampEpochMs = this.toEpochMs(entry.startTime)
        if (timestampEpochMs === undefined) continue

        const event = this.createEvent(
          'long_task',
          context,
          entry.startTime,
          timestampEpochMs,
          entry.duration
        )
        this.deliver(event)
        if (entry.duration > 50) {
          this.recordSample('core.interactive.longTask', 'count', 1, context)
        }
      }
    } catch {
      // A malformed observer entry must not interrupt the remaining renderer
      // event loop or turn diagnostics into an application failure.
    }
  }

  private resolveLongTaskContext(): RendererPerformanceContext {
    const provider = this.longTaskContext
    if (!provider) return { phase: DEFAULT_PHASE }

    try {
      return typeof provider === 'function' ? provider() : provider
    } catch {
      return { phase: DEFAULT_PHASE }
    }
  }

  private createEvent(
    name: PerformanceEventName,
    context: RendererPerformanceContext,
    timestampNow: number,
    timestampEpochMs: number,
    durationMs?: number
  ): PerformanceEvent {
    const event: PerformanceEvent = {
      schemaVersion: PERFORMANCE_TRACE_SCHEMA_VERSION,
      name,
      process: 'renderer',
      phase: context.phase,
      traceId: this.traceId,
      timestampEpochMs,
      elapsedMs: Math.max(0, timestampNow - this.traceStartNow!)
    }

    const operationId = sanitizePerformanceIdentifier(context.operationId)
    if (operationId !== undefined) event.operationId = operationId

    const documentId = sanitizePerformanceIdentifier(context.documentId)
    if (documentId !== undefined) event.documentId = documentId

    if (durationMs !== undefined) event.durationMs = durationMs

    const metadata = sanitizePerformanceMetadata(context.metadata)
    if (metadata !== undefined) event.metadata = metadata

    return event
  }

  private deliver(event: PerformanceEvent): PerformanceEvent {
    try {
      this.sink({
        ...event,
        ...(event.metadata === undefined ? {} : { metadata: { ...event.metadata } })
      })
    } catch {
      // A diagnostics sink is outside the editor hot path. A sink failure
      // must not become a renderer failure or change recorder state.
    }

    return event
  }

  private toEpochMs(monotonicMs: number): number | undefined {
    if (this.timeOriginEpochMs === undefined) return undefined

    const timestampEpochMs = this.timeOriginEpochMs + monotonicMs
    return isFiniteNumber(timestampEpochMs) ? timestampEpochMs : undefined
  }

  private normalizeMeasureInvocation(
    first: string | RendererPerformanceMeasureOptions,
    second?: string | RendererPerformanceContext,
    third?: RendererPerformanceContext
  ):
    | {
      startMark: string
      endMark?: string
      options: RendererPerformanceContext
    }
    | undefined {
    if (typeof first !== 'string') {
      if (!sanitizePerformanceIdentifier(first.startMark)) return undefined
      return {
        startMark: first.startMark,
        endMark: first.endMark,
        options: first
      }
    }

    if (!sanitizePerformanceIdentifier(first)) return undefined
    if (typeof second === 'string') {
      if (!sanitizePerformanceIdentifier(second) || third === undefined) return undefined
      return {
        startMark: first,
        endMark: second,
        options: third
      }
    }
    if (second === undefined) return undefined
    return {
      startMark: first,
      options: second
    }
  }
}

interface RendererPerformanceMark {
  monotonicMs: number
  timestampEpochMs: number
}

export const createRendererPerformanceRecorder = (
  options: RendererPerformanceRecorderOptions
): RendererPerformanceRecorder => new RendererPerformanceRecorder(options)
