import type { PerformanceSampleUnit } from '@shared/types/performance'
import type {
  RendererPerformanceContext,
  RendererPerformanceObserverCallback,
  RendererPerformanceObserverConstructor,
  RendererPerformanceObserverLike,
  RendererPerformanceRecorder
} from './renderer'

export interface RuntimePerformanceRecorder
  extends Pick<RendererPerformanceRecorder, 'enabled' | 'recordSample'> {}

export interface RuntimePerformanceMemory {
  usedJSHeapSize?: number
  totalJSHeapSize?: number
}

export interface RuntimePerformanceClock {
  now: () => number
  memory?: RuntimePerformanceMemory
}

export interface RuntimePerformanceMonitorOptions {
  recorder: RuntimePerformanceRecorder
  performance?: RuntimePerformanceClock
  performanceObserver?: RendererPerformanceObserverConstructor | null
  requestAnimationFrame?: (callback: (timestamp: number) => void) => number
  cancelAnimationFrame?: (handle: number) => void
  setInterval?: (callback: () => void, delayMs: number) => ReturnType<typeof setInterval>
  clearInterval?: (timer: ReturnType<typeof setInterval>) => void
  memorySampleIntervalMs?: number
}

const INPUT_EVENT_NAMES = new Set([
  'beforeinput',
  'compositionend',
  'input',
  'keydown',
  'keyup',
  'paste'
])

const isFiniteNonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

const getDefaultClock = (): RuntimePerformanceClock | undefined => {
  const candidate = (
    globalThis as typeof globalThis & {
      performance?: RuntimePerformanceClock
    }
  ).performance
  return candidate && typeof candidate.now === 'function' ? candidate : undefined
}

const getDefaultObserver = (): RendererPerformanceObserverConstructor | undefined => {
  const candidate = (
    globalThis as typeof globalThis & {
      PerformanceObserver?: unknown
    }
  ).PerformanceObserver
  return typeof candidate === 'function'
    ? candidate as RendererPerformanceObserverConstructor
    : undefined
}

const getDefaultRequestAnimationFrame = ():
  ((callback: (timestamp: number) => void) => number) | undefined => {
  const candidate = (
    globalThis as typeof globalThis & {
      requestAnimationFrame?: (callback: (timestamp: number) => void) => number
    }
  ).requestAnimationFrame
  return typeof candidate === 'function' ? candidate.bind(globalThis) : undefined
}

const getDefaultCancelAnimationFrame = (): ((handle: number) => void) | undefined => {
  const candidate = (
    globalThis as typeof globalThis & {
      cancelAnimationFrame?: (handle: number) => void
    }
  ).cancelAnimationFrame
  return typeof candidate === 'function' ? candidate.bind(globalThis) : undefined
}

export class RuntimePerformanceMonitor {
  private readonly recorder: RuntimePerformanceRecorder
  private readonly performance?: RuntimePerformanceClock
  private readonly observerConstructor?: RendererPerformanceObserverConstructor
  private readonly requestAnimationFrame?: (callback: (timestamp: number) => void) => number
  private readonly cancelAnimationFrame?: (handle: number) => void
  private readonly setInterval: (callback: () => void, delayMs: number) => ReturnType<typeof setInterval>
  private readonly clearInterval: (timer: ReturnType<typeof setInterval>) => void
  private readonly memorySampleIntervalMs: number
  private readonly observers: RendererPerformanceObserverLike[] = []
  private started = false
  private disposed = false
  private frameHandle: number | null = null
  private lastFrameTimestamp: number | undefined
  private memoryTimer: ReturnType<typeof setInterval> | null = null

  constructor(options: RuntimePerformanceMonitorOptions) {
    this.recorder = options.recorder
    this.performance = options.performance ?? getDefaultClock()
    this.observerConstructor =
      options.performanceObserver === undefined
        ? getDefaultObserver()
        : options.performanceObserver ?? undefined
    this.requestAnimationFrame = options.requestAnimationFrame ?? getDefaultRequestAnimationFrame()
    this.cancelAnimationFrame = options.cancelAnimationFrame ?? getDefaultCancelAnimationFrame()
    this.setInterval = options.setInterval ?? ((callback, delayMs) => setInterval(callback, delayMs))
    this.clearInterval = options.clearInterval ?? (timer => clearInterval(timer))
    this.memorySampleIntervalMs = Math.max(250, Math.floor(options.memorySampleIntervalMs ?? 1_000))
  }

  start(): void {
    if (this.started || this.disposed || !this.recorder.enabled) return
    this.started = true
    this.installInputObserver()
    this.installGcObserver()
    this.startFrameSampling()
    this.memoryTimer = this.setInterval(() => this.sampleMemory(), this.memorySampleIntervalMs)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.frameHandle !== null) {
      this.cancelAnimationFrame?.(this.frameHandle)
      this.frameHandle = null
    }
    if (this.memoryTimer !== null) {
      this.clearInterval(this.memoryTimer)
      this.memoryTimer = null
    }
    for (const observer of this.observers) {
      try {
        observer.disconnect()
      } catch {
        // Performance cleanup must never affect the editor.
      }
    }
    this.observers.length = 0
  }

  private installInputObserver(): void {
    this.installObserver(
      'event',
      { type: 'event', buffered: true, durationThreshold: 0 } as PerformanceObserverInit,
      (entry) => {
        if (entry.entryType !== 'event' || !INPUT_EVENT_NAMES.has(entry.name)) return
        if (!isFiniteNonNegative(entry.duration)) return
        this.record('core.input.latency', 'ms', entry.duration, {
          phase: 'editor',
          metadata: { eventName: entry.name }
        })
      }
    )
  }

  private installGcObserver(): void {
    this.installObserver(
      'gc',
      { type: 'gc', buffered: true } as PerformanceObserverInit,
      (entry) => {
        if (entry.entryType !== 'gc' || !isFiniteNonNegative(entry.duration)) return
        const context: RendererPerformanceContext = {
          phase: 'memory',
          metadata: { gcName: entry.name }
        }
        this.record('core.gc.stall', 'ms', entry.duration, context)
        if (entry.duration > 50) this.record('core.gc.over50', 'count', 1, context)
      }
    )
  }

  private installObserver(
    type: string,
    options: PerformanceObserverInit,
    handle: (entry: PerformanceEntry) => void
  ): void {
    const constructor = this.observerConstructor
    if (!constructor) return

    const callback: RendererPerformanceObserverCallback = (list) => {
      if (this.disposed) return
      let entries: PerformanceEntry[]
      try {
        entries = list.getEntries()
      } catch {
        return
      }
      for (const entry of entries) handle(entry)
    }

    let observer: RendererPerformanceObserverLike | undefined
    try {
      observer = new constructor(callback)
      observer.observe(options)
      this.observers.push(observer)
      return
    } catch {
      try {
        observer?.disconnect()
      } catch {
        // Ignore a partially initialized observer.
      }
    }

    try {
      observer = new constructor(callback)
      observer.observe({ entryTypes: [type] })
      this.observers.push(observer)
    } catch {
      try {
        observer?.disconnect()
      } catch {
        // Ignore unsupported performance entry types.
      }
    }
  }

  private startFrameSampling(): void {
    const requestAnimationFrame = this.requestAnimationFrame
    if (!requestAnimationFrame) return

    const sampleFrame = (timestamp: number) => {
      if (this.disposed) return
      if (this.lastFrameTimestamp !== undefined) {
        const duration = Math.max(0, timestamp - this.lastFrameTimestamp)
        this.record('core.frame.duration', 'ms', duration, { phase: 'editor' })
        this.record('core.frame.over16_7', 'ratio', duration > 16.7 ? 1 : 0, { phase: 'editor' })
        this.record('core.frame.over33', 'ratio', duration > 33 ? 1 : 0, { phase: 'editor' })
      }
      this.lastFrameTimestamp = timestamp
      this.frameHandle = requestAnimationFrame(sampleFrame)
    }

    this.frameHandle = requestAnimationFrame(sampleFrame)
  }

  private sampleMemory(): void {
    const memory = this.performance?.memory
    if (!memory) return
    if (isFiniteNonNegative(memory.usedJSHeapSize)) {
      this.record('memory.renderer.usedHeap', 'bytes', memory.usedJSHeapSize, { phase: 'memory' })
    }
    if (isFiniteNonNegative(memory.totalJSHeapSize)) {
      this.record('memory.renderer.totalHeap', 'bytes', memory.totalJSHeapSize, { phase: 'memory' })
    }
  }

  private record(
    metric: string,
    unit: PerformanceSampleUnit,
    value: number,
    context: RendererPerformanceContext
  ): void {
    if (this.disposed) return
    this.recorder.recordSample(metric, unit, value, context)
  }
}
