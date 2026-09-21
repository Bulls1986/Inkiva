import {
  normalizePerformanceEvent,
  PERFORMANCE_TRACE_SCHEMA_VERSION,
  type PerformanceBootInfo,
  type PerformanceEvent,
  type PerformanceEventName,
  type PerformanceFrameSampleBatch,
  type PerformanceFrameSampleTuple,
  type PerformanceReport,
  type PerformanceSampleUnit
} from '@shared/types/performance'
import {
  MainPerformanceRecorder,
  type MainPerformanceClock,
  type MainPerformanceEventOptions,
  type MainPerformanceMeasureOptions,
  type MainPerformanceRecorderOptions
} from './recorder'
import {
  PerformanceReportStore,
  PerformanceReportWriter,
  type PerformanceReportFlushResult,
  type PerformanceReportInput,
  type PerformanceReportWriteResult
} from './report-store'

const MAX_RENDERER_EVENTS = 10_000

const FRAME_METRICS: ReadonlyArray<[
  metric: string,
  unit: PerformanceSampleUnit,
  value: (sample: PerformanceFrameSampleTuple) => number,
  phase: 'editor' | 'memory'
]> = [
  ['core.frame.duration', 'ms', (sample) => sample[2], 'editor'],
  ['core.frame.over16_7', 'ratio', (sample) => (sample[2] > 16.7 ? 1 : 0), 'editor'],
  ['core.frame.over33', 'ratio', (sample) => (sample[2] > 33 ? 1 : 0), 'editor'],
  ['core.forcedReflow', 'count', (sample) => sample[3], 'editor'],
  ['core.interactive.longTaskObserver', 'count', (sample) => sample[4], 'editor'],
  ['core.interactive.longTask', 'count', () => 0, 'editor'],
  ['core.gc.over50', 'count', () => 0, 'memory']
]

interface PendingRendererFrameSample {
  sample: PerformanceFrameSampleTuple
  metricCount: number
}

export interface MainPerformanceCoordinatorOptions extends MainPerformanceRecorderOptions {
  reportDirectory?: string | null
  now?: () => number
  writer?: Pick<
    {
      write: (report: PerformanceReportInput) => Promise<PerformanceReportWriteResult>
    },
    'write'
  >
  maxRendererEvents?: number
}

export interface MainPerformanceCoordinator {
  readonly enabled: boolean
  mark(
    name: PerformanceEventName,
    options: MainPerformanceEventOptions
  ): PerformanceEvent | undefined
  measure(
    name: PerformanceEventName,
    options: MainPerformanceMeasureOptions
  ): PerformanceEvent | undefined
  recordSample(
    metric: string,
    unit: PerformanceSampleUnit,
    value: number,
    options: MainPerformanceEventOptions
  ): PerformanceEvent | undefined
  recordRendererEvent(event: unknown): boolean
  recordRendererEvents(events: unknown): number
  recordRendererFrameSamples(batch: unknown): number
  getBootInfo(): PerformanceBootInfo
  snapshot(): PerformanceReport
  flush(): Promise<PerformanceReportFlushResult>
  dispose(): void
}

class MainPerformanceCoordinatorImpl implements MainPerformanceCoordinator {
  readonly enabled: boolean

  private readonly recorder: MainPerformanceRecorder
  private readonly reportStore: PerformanceReportStore
  private readonly maxRendererEvents: number
  private readonly traceId: string
  private readonly pendingRendererFrameSamples: PendingRendererFrameSample[] = []
  private rendererEventCount = 0

  constructor(options: MainPerformanceCoordinatorOptions = {}) {
    this.enabled = options.enabled === true
    this.recorder = new MainPerformanceRecorder(options)
    this.traceId = this.recorder.getTrace().traceId
    this.maxRendererEvents = Math.max(
      1,
      Math.floor(options.maxRendererEvents ?? MAX_RENDERER_EVENTS)
    )
    const writer =
      options.writer ??
      new PerformanceReportWriter({
        enabled:
          this.enabled && options.reportDirectory !== null && options.reportDirectory !== undefined,
        outputDirectory: options.reportDirectory ?? undefined
      })
    this.reportStore = new PerformanceReportStore({
      enabled: this.enabled,
      now: options.now,
      outputDirectory: options.reportDirectory ?? undefined,
      writer
    })
    this.reportStore.recordTrace(this.recorder.snapshot())
  }

  mark(
    name: PerformanceEventName,
    options: MainPerformanceEventOptions
  ): PerformanceEvent | undefined {
    const event = this.recorder.mark(name, options)
    if (event) this.reportStore.recordEvent(event)
    return event
  }

  measure(
    name: PerformanceEventName,
    options: MainPerformanceMeasureOptions
  ): PerformanceEvent | undefined {
    const event = this.recorder.measure(name, options)
    if (event) this.reportStore.recordEvent(event)
    return event
  }

  recordSample(
    metric: string,
    unit: PerformanceSampleUnit,
    value: number,
    options: MainPerformanceEventOptions
  ): PerformanceEvent | undefined {
    const event = this.recorder.recordSample(metric, unit, value, options)
    if (event) this.reportStore.recordEvent(event)
    return event
  }

  recordRendererEvent(event: unknown): boolean {
    if (!this.enabled || this.rendererEventCount >= this.maxRendererEvents) return false

    const normalizedEvent = normalizePerformanceEvent(event, {
      expectedProcess: 'renderer',
      expectedTraceId: this.traceId
    })
    if (!normalizedEvent) return false

    this.reportStore.recordEvent(normalizedEvent)
    this.rendererEventCount += 1
    return true
  }

  recordRendererEvents(events: unknown): number {
    const candidates = Array.isArray(events) ? events : [events]
    let accepted = 0
    for (const event of candidates) {
      if (this.recordRendererEvent(event)) accepted += 1
    }
    return accepted
  }

  recordRendererFrameSamples(batch: unknown): number {
    if (!this.enabled || batch === null || typeof batch !== 'object') return 0
    const candidate = batch as Partial<PerformanceFrameSampleBatch>
    if (candidate.traceId !== this.traceId || !Array.isArray(candidate.samples)) return 0

    let accepted = 0
    for (const rawSample of candidate.samples) {
      if (!Array.isArray(rawSample) || rawSample.length !== 5) continue
      const [timestampEpochMs, elapsedMs, durationMs, forcedReflowCount, observerAvailable] = rawSample
      if (
        ![timestampEpochMs, elapsedMs, durationMs, forcedReflowCount].every(
          (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0
        ) ||
        (observerAvailable !== 0 && observerAvailable !== 1)
      ) continue

      const remaining = this.maxRendererEvents - this.rendererEventCount
      if (remaining <= 0) break
      const metricCount = Math.min(FRAME_METRICS.length, remaining)
      this.pendingRendererFrameSamples.push({
        sample: [
          timestampEpochMs,
          elapsedMs,
          durationMs,
          forcedReflowCount,
          observerAvailable
        ],
        metricCount
      })
      this.rendererEventCount += metricCount
      accepted += metricCount
    }
    return accepted
  }

  getBootInfo(): PerformanceBootInfo {
    const trace = this.recorder.getTrace()
    return {
      enabled: this.enabled,
      traceId: trace.traceId,
      mainTimeOriginEpochMs: trace.timeOriginEpochMs
    }
  }

  private materializeRendererFrameSamples(): void {
    if (this.pendingRendererFrameSamples.length === 0) return
    const pending = this.pendingRendererFrameSamples.splice(0)
    for (const { sample, metricCount } of pending) {
      const [timestampEpochMs, elapsedMs] = sample
      for (let index = 0; index < metricCount; index += 1) {
        const [metric, unit, readValue, phase] = FRAME_METRICS[index]!
        this.reportStore.recordEvent({
          schemaVersion: PERFORMANCE_TRACE_SCHEMA_VERSION,
          name: 'metric_sample',
          process: 'renderer',
          phase,
          traceId: this.traceId,
          timestampEpochMs,
          elapsedMs,
          metadata: { metric, unit, value: readValue(sample) }
        })
      }
    }
  }

  snapshot(): PerformanceReport {
    this.materializeRendererFrameSamples()
    // The coordinator only admits schema-valid renderer events and owns the
    // main recorder's schema-valid events. The report store accepts a wider
    // phase string so it can safely archive a future producer, therefore the
    // public coordinator boundary can narrow its snapshot back to the shared
    // current-version contract here.
    return this.reportStore.snapshot() as PerformanceReport
  }

  flush(): Promise<PerformanceReportFlushResult> {
    this.materializeRendererFrameSamples()
    return this.reportStore.flush()
  }

  dispose(): void {
    this.recorder.dispose()
  }
}

export const createMainPerformanceCoordinator = (
  options: MainPerformanceCoordinatorOptions = {}
): MainPerformanceCoordinator => new MainPerformanceCoordinatorImpl(options)

export type { MainPerformanceClock }
