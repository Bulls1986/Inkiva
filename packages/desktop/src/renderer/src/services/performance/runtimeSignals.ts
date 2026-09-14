export interface MemoryGrowthSnapshot {
  ready: boolean
  growthRatio?: number
  linearGrowth: boolean
}

export interface MemoryGrowthTrackerOptions {
  windowSize?: number
  linearGrowthRatio?: number
  linearGrowthRSquared?: number
}

const isFiniteNonNegative = (value: number): boolean =>
  Number.isFinite(value) && value >= 0

const calculateRSquared = (values: readonly number[]): number => {
  if (values.length < 2) return 0

  const xMean = (values.length - 1) / 2
  const yMean = values.reduce((total, value) => total + value, 0) / values.length
  let covariance = 0
  let xVariance = 0
  let yVariance = 0

  for (const [index, value] of values.entries()) {
    const xDelta = index - xMean
    const yDelta = value - yMean
    covariance += xDelta * yDelta
    xVariance += xDelta * xDelta
    yVariance += yDelta * yDelta
  }

  if (xVariance === 0 || yVariance === 0) return 0
  const correlation = covariance / Math.sqrt(xVariance * yVariance)
  return correlation * correlation
}

export class MemoryGrowthTracker {
  private readonly windowSize: number
  private readonly linearGrowthRatio: number
  private readonly linearGrowthRSquared: number
  private values: number[] = []

  constructor(options: MemoryGrowthTrackerOptions = {}) {
    this.windowSize = Math.max(2, Math.floor(options.windowSize ?? 50))
    this.linearGrowthRatio = Math.max(0, options.linearGrowthRatio ?? 0.02)
    this.linearGrowthRSquared = Math.min(
      1,
      Math.max(0, options.linearGrowthRSquared ?? 0.8)
    )
  }

  observe(value: number): MemoryGrowthSnapshot {
    if (!isFiniteNonNegative(value)) {
      return { ready: false, linearGrowth: false }
    }

    this.values.push(value)
    if (this.values.length > this.windowSize) this.values.shift()
    if (this.values.length < this.windowSize) {
      return { ready: false, linearGrowth: false }
    }

    const first = this.values[0] ?? 0
    const last = this.values[this.values.length - 1] ?? first
    const growthRatio = first > 0 ? (last - first) / first : 0
    const linearGrowth =
      growthRatio > this.linearGrowthRatio &&
      calculateRSquared(this.values) >= this.linearGrowthRSquared

    return { ready: true, growthRatio, linearGrowth }
  }

  reset(): void {
    this.values = []
  }
}

export class EventLoopLagTracker {
  private readonly intervalMs: number
  private expectedAt: number | null = null

  constructor(intervalMs = 16.7) {
    this.intervalMs = Math.max(1, intervalMs)
  }

  observe(now: number): number | undefined {
    if (!Number.isFinite(now)) return undefined
    if (this.expectedAt === null) {
      this.expectedAt = now + this.intervalMs
      return undefined
    }

    const lag = Math.max(0, now - this.expectedAt)
    this.expectedAt = now + this.intervalMs
    return lag
  }

  reset(): void {
    this.expectedAt = null
  }
}

export class ScrollFpsTracker {
  private firstTimestamp: number | null = null
  private lastTimestamp: number | null = null
  private frameCount = 0

  begin(timestamp: number): void {
    if (!Number.isFinite(timestamp)) return
    this.firstTimestamp = timestamp
    this.lastTimestamp = timestamp
    this.frameCount = 1
  }

  frame(timestamp: number): void {
    if (!Number.isFinite(timestamp)) return
    if (this.firstTimestamp === null) {
      this.begin(timestamp)
      return
    }
    if (this.lastTimestamp !== null && timestamp <= this.lastTimestamp) return
    this.lastTimestamp = timestamp
    this.frameCount += 1
  }

  end(timestamp = this.lastTimestamp ?? 0): number | undefined {
    if (
      this.firstTimestamp === null ||
      this.frameCount < 2 ||
      !Number.isFinite(timestamp) ||
      timestamp <= this.firstTimestamp
    ) {
      this.reset()
      return undefined
    }

    const fps = (this.frameCount - 1) * 1_000 / (timestamp - this.firstTimestamp)
    this.reset()
    return Number.isFinite(fps) ? fps : undefined
  }

  reset(): void {
    this.firstTimestamp = null
    this.lastTimestamp = null
    this.frameCount = 0
  }
}

export class LayoutPerformanceTracker {
  private pendingWrite = false
  private forcedReflows = 0

  markDomWrite(): void {
    this.pendingWrite = true
  }

  markLayoutRead(): void {
    if (!this.pendingWrite) return
    this.forcedReflows += 1
    this.pendingWrite = false
  }

  consumeForcedReflows(): number {
    const count = this.forcedReflows
    this.forcedReflows = 0
    this.pendingWrite = false
    return count
  }

  reset(): void {
    this.pendingWrite = false
    this.forcedReflows = 0
  }
}
