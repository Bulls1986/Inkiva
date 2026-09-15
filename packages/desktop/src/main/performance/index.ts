import {
  normalizePerformanceEvent,
  type PerformanceBootInfo,
  type PerformanceEvent,
  type PerformanceEventName,
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
const MAX_LATE_RENDERER_METRICS = 256
const REQUIRED_LATE_RENDERER_METRICS = new Set([
  'soak.durationMs',
  'soak.cycles',
  'memory.heapGrowth50',
  'memory.heapLinearGrowth',
  'stability.crash',
  'stability.rendererCrash',
  'stability.oom',
  'stability.cpuRunaway',
  'stability.rendererHang'
])

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
  private readonly lateRendererMetricKeys = new Set<string>()
  private rendererEventCount = 0

  constructor(options: MainPerformanceCoordinatorOptions = {}) {
    this.enabled = options.enabled === true
    this.recorder = new MainPerformanceRecorder(options)
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
    if (!this.enabled) return false

    const normalizedEvent = normalizePerformanceEvent(event, {
      expectedProcess: 'renderer',
      expectedTraceId: this.recorder.getTrace().traceId
    })
    if (!normalizedEvent) return false

    if (this.rendererEventCount < this.maxRendererEvents) {
      this.reportStore.recordEvent(normalizedEvent)
      this.rendererEventCount += 1
      return true
    }

    const metric = normalizedEvent.metadata?.metric
    if (normalizedEvent.name !== 'metric_sample' || typeof metric !== 'string') return false

    const isRequiredMetric = REQUIRED_LATE_RENDERER_METRICS.has(metric)
    if (
      !isRequiredMetric &&
      !this.lateRendererMetricKeys.has(metric) &&
      this.lateRendererMetricKeys.size >= MAX_LATE_RENDERER_METRICS
    ) {
      return false
    }
    this.lateRendererMetricKeys.add(metric)
    return this.reportStore.recordLatestMetricSample(normalizedEvent)
  }

  getBootInfo(): PerformanceBootInfo {
    const trace = this.recorder.getTrace()
    return {
      enabled: this.enabled,
      traceId: trace.traceId,
      mainTimeOriginEpochMs: trace.timeOriginEpochMs
    }
  }

  snapshot(): PerformanceReport {
    // The coordinator only admits schema-valid renderer events and owns the
    // main recorder's schema-valid events. The report store accepts a wider
    // phase string so it can safely archive a future producer, therefore the
    // public coordinator boundary can narrow its snapshot back to the shared
    // current-version contract here.
    return this.reportStore.snapshot() as PerformanceReport
  }

  flush(): Promise<PerformanceReportFlushResult> {
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
