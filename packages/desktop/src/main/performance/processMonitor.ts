import type { PerformanceSampleUnit } from '@shared/types/performance'
import type { MainPerformanceCoordinator } from './index'

export interface MainProcessMetric {
  type?: string
  cpu?: { percentCPUUsage?: number }
}

export interface MainProcessMemoryInfo {
  privateBytes?: number
  workingSetSize?: number
}

export interface MainProcessPerformanceSource {
  getAppMetrics: () => readonly MainProcessMetric[]
  getProcessMemoryInfo: () => Promise<MainProcessMemoryInfo>
}

export interface MainProcessPerformanceMonitorOptions {
  recorder: Pick<MainPerformanceCoordinator, 'enabled' | 'recordSample'>
  source: MainProcessPerformanceSource
  setInterval?: (callback: () => void, delayMs: number) => ReturnType<typeof setInterval>
  clearInterval?: (timer: ReturnType<typeof setInterval>) => void
  sampleIntervalMs?: number
}

const isFiniteNonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

export class MainProcessPerformanceMonitor {
  private readonly recorder: MainProcessPerformanceMonitorOptions['recorder']
  private readonly source: MainProcessPerformanceSource
  private readonly setInterval: (callback: () => void, delayMs: number) => ReturnType<typeof setInterval>
  private readonly clearInterval: (timer: ReturnType<typeof setInterval>) => void
  private readonly sampleIntervalMs: number
  private timer: ReturnType<typeof setInterval> | null = null
  private disposed = false

  constructor(options: MainProcessPerformanceMonitorOptions) {
    this.recorder = options.recorder
    this.source = options.source
    this.setInterval = options.setInterval ?? ((callback, delayMs) => setInterval(callback, delayMs))
    this.clearInterval = options.clearInterval ?? (timer => clearInterval(timer))
    this.sampleIntervalMs = Math.max(250, Math.floor(options.sampleIntervalMs ?? 1_000))
  }

  start(): void {
    if (this.timer !== null || this.disposed || !this.recorder.enabled) return
    this.timer = this.setInterval(() => {
      void this.sample()
    }, this.sampleIntervalMs)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.timer !== null) {
      this.clearInterval(this.timer)
      this.timer = null
    }
  }

  private async sample(): Promise<void> {
    if (this.disposed) return

    let metrics: readonly MainProcessMetric[] = []
    try {
      metrics = this.source.getAppMetrics()
    } catch {
      return
    }

    const rendererMetrics = metrics.filter(metric =>
      metric.type === 'Renderer' || metric.type === 'Tab'
    )
    const cpuValues = rendererMetrics
      .map(metric => metric.cpu?.percentCPUUsage)
      .filter(isFiniteNonNegative)
      .map(value => value / 100)

    const rendererCpu = cpuValues.reduce((total, value) => total + value, 0)
    const maxTabCpu = cpuValues.length > 0 ? Math.max(...cpuValues) : 0
    this.record('background.rendererIdleCpu', 'ratio', rendererCpu)
    this.record('background.tabCpu', 'ratio', maxTabCpu)

    try {
      const memory = await this.source.getProcessMemoryInfo()
      if (isFiniteNonNegative(memory.privateBytes)) {
        this.record('memory.main.privateBytes', 'bytes', memory.privateBytes * 1_024)
      }
      if (isFiniteNonNegative(memory.workingSetSize)) {
        this.record('memory.main.workingSetBytes', 'bytes', memory.workingSetSize * 1_024)
      }
    } catch {
      // Memory diagnostics are optional on unsupported Electron platforms.
    }
  }

  private record(metric: string, unit: PerformanceSampleUnit, value: number): void {
    if (this.disposed) return
    this.recorder.recordSample(metric, unit, value, { phase: 'memory' })
  }
}
