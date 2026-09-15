export const MEMORY_LEAK_SHORT_WINDOW_SIZE = 50 as const
export const MEMORY_LEAK_LONG_WINDOW_SIZE = 200 as const
export const MEMORY_LEAK_SAMPLE_COUNT = 20 as const
export const MEMORY_FOOTPRINT_SAMPLE_COUNT = 20 as const

export interface MemoryLeakSeriesOptions {
  shortWindowSize?: number
  longWindowSize?: number
  linearGrowthRatio?: number
  linearGrowthRSquared?: number
}

export interface MemoryLeakSeriesEvaluation {
  shortWindowSize: number
  longWindowSize: number
  growth50Ratio: number
  growth200Ratio: number
  linearGrowth50: boolean
  linearGrowth200: boolean
}

const isFiniteNonNegative = (value: number): boolean =>
  Number.isFinite(value) && value >= 0

/**
 * Converts an idle-baseline and post-load heap reading into a non-negative
 * footprint delta. CDP values are validated here so a broken sampler cannot
 * accidentally satisfy a memory gate.
 */
export const calculateHeapDelta = (baseline: number, measured: number): number => {
  if (!isFiniteNonNegative(baseline) || !isFiniteNonNegative(measured)) {
    throw new Error('heap footprint values must be finite non-negative numbers')
  }
  return Math.max(0, measured - baseline)
}

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

const calculateGrowthRatio = (values: readonly number[]): number => {
  const first = values[0] ?? 0
  const last = values.at(-1) ?? first
  return first > 0 ? (last - first) / first : 0
}

const hasLinearGrowth = (
  values: readonly number[],
  linearGrowthRatio: number,
  linearGrowthRSquared: number
): boolean =>
  calculateGrowthRatio(values) > linearGrowthRatio &&
  calculateRSquared(values) >= linearGrowthRSquared

export const evaluateMemoryLeakSeries = (
  samples: readonly number[],
  options: MemoryLeakSeriesOptions = {}
): MemoryLeakSeriesEvaluation => {
  const shortWindowSize = Math.floor(options.shortWindowSize ?? MEMORY_LEAK_SHORT_WINDOW_SIZE)
  const longWindowSize = Math.floor(options.longWindowSize ?? MEMORY_LEAK_LONG_WINDOW_SIZE)
  const linearGrowthRatio = options.linearGrowthRatio ?? 0.02
  const linearGrowthRSquared = options.linearGrowthRSquared ?? 0.8

  if (
    shortWindowSize < 2 ||
    longWindowSize < 2 ||
    shortWindowSize > longWindowSize ||
    !Number.isFinite(linearGrowthRatio) ||
    linearGrowthRatio < 0 ||
    linearGrowthRatio >= 1 ||
    !Number.isFinite(linearGrowthRSquared) ||
    linearGrowthRSquared < 0 ||
    linearGrowthRSquared > 1
  ) {
    throw new Error('memory leak window sizes and thresholds are invalid')
  }

  if (samples.some((sample) => !isFiniteNonNegative(sample))) {
    throw new Error('memory leak samples must be finite non-negative numbers')
  }

  if (samples.length < longWindowSize) {
    throw new Error(
      'memory leak evaluation requires ' + String(longWindowSize) + ' samples'
    )
  }

  const shortSamples = samples.slice(-shortWindowSize)
  const longSamples = samples.slice(-longWindowSize)

  return {
    shortWindowSize,
    longWindowSize,
    growth50Ratio: calculateGrowthRatio(shortSamples),
    growth200Ratio: calculateGrowthRatio(longSamples),
    linearGrowth50: hasLinearGrowth(
      shortSamples,
      linearGrowthRatio,
      linearGrowthRSquared
    ),
    linearGrowth200: hasLinearGrowth(
      longSamples,
      linearGrowthRatio,
      linearGrowthRSquared
    )
  }
}
