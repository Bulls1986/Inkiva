import {
  calculateStatistics,
  type MetricUnit,
  type PerformanceGateReport
} from './contract.js'
import { compareBenchmarkReportsForPooling } from './comparability.js'

export interface AcrossRunStatistics {
  values: number[]
  min: number
  max: number
  mean: number
  stddev: number
  cv: number
}

export interface RepeatabilityMetricSummary {
  metric: string
  unit: MetricUnit
  runCount: number
  p50: AcrossRunStatistics
  p95: AcrossRunStatistics
  p99: AcrossRunStatistics
}

export interface RepeatabilityAnalysis {
  runCount: number
  metrics: RepeatabilityMetricSummary[]
}

const summarizeAcrossRuns = (values: number[], unit: MetricUnit): AcrossRunStatistics => {
  const stats = calculateStatistics({ unit, samples: values })
  return {
    values: [...values],
    min: stats.min,
    max: stats.max,
    mean: stats.mean,
    stddev: stats.stddev,
    cv: stats.cv
  }
}

export const analyzeBenchmarkRepeatability = (
  reports: readonly PerformanceGateReport[],
  metricNames: readonly string[]
): RepeatabilityAnalysis => {
  if (reports.length < 2) {
    throw new Error('repeatability analysis requires at least two independent reports')
  }
  if (metricNames.length === 0) {
    throw new Error('repeatability analysis requires at least one metric')
  }

  const reference = reports[0]
  if (reference === undefined) throw new Error('repeatability reference report is missing')

  for (let index = 1; index < reports.length; index += 1) {
    const candidate = reports[index]
    if (candidate === undefined) continue
    const comparison = compareBenchmarkReportsForPooling(reference, candidate)
    if (!comparison.comparable) {
      throw new Error(
        'repeatability report ' + index + ' is not comparable: ' + comparison.reasons.join('; ')
      )
    }
  }

  const metrics = metricNames.map((metricName): RepeatabilityMetricSummary => {
    const firstSeries = reference.metrics[metricName]
    if (firstSeries === undefined) {
      throw new Error('repeatability metric is missing from report 0: ' + metricName)
    }

    const p50Values: number[] = []
    const p95Values: number[] = []
    const p99Values: number[] = []

    for (const [index, report] of reports.entries()) {
      const series = report.metrics[metricName]
      if (series === undefined) {
        throw new Error('repeatability metric is missing from report ' + index + ': ' + metricName)
      }
      if (series.unit !== firstSeries.unit) {
        throw new Error('repeatability metric unit differs in report ' + index + ': ' + metricName)
      }
      const stats = calculateStatistics(series)
      p50Values.push(stats.p50)
      p95Values.push(stats.p95)
      p99Values.push(stats.p99)
    }

    return {
      metric: metricName,
      unit: firstSeries.unit,
      runCount: reports.length,
      p50: summarizeAcrossRuns(p50Values, firstSeries.unit),
      p95: summarizeAcrossRuns(p95Values, firstSeries.unit),
      p99: summarizeAcrossRuns(p99Values, firstSeries.unit)
    }
  })

  return { runCount: reports.length, metrics }
}
