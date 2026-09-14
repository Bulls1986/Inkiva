import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import {
  MINIMUM_SAMPLE_COUNT,
  METRIC_UNITS,
  parsePerformanceGateReport,
  type GateLevel,
  type MetricSeries,
  type MetricUnit,
  type PerformanceGateEnvironment,
  type PerformanceGateReport,
} from './contract.js'

interface StoredMetric {
  unit: MetricUnit
  samples: number[]
}

export interface PerformanceGateReportMetadata {
  productVersion: string
  suite: string
  level: GateLevel
  environment: PerformanceGateEnvironment
  generatedAt?: string
}

export class PerformanceSampleCollector {
  private readonly metrics = new Map<string, StoredMetric>()

  add(name: string, unit: MetricUnit, value: number): this {
    if (name.trim() === '') {
      throw new Error('metric name must be non-empty')
    }
    if (!METRIC_UNITS.includes(unit)) {
      throw new Error('metric ' + name + ' has an invalid unit')
    }
    if (!Number.isFinite(value) || value < 0) {
      throw new Error('metric ' + name + ' sample must be finite and non-negative')
    }

    const existing = this.metrics.get(name)
    if (existing !== undefined && existing.unit !== unit) {
      throw new Error(
        'metric ' +
          name +
          ' changed unit from ' +
          existing.unit +
          ' to ' +
          unit,
      )
    }
    if (existing === undefined) {
      this.metrics.set(name, { unit, samples: [value] })
    } else {
      existing.samples.push(value)
    }
    return this
  }

  addMany(name: string, unit: MetricUnit, values: readonly number[]): this {
    for (const value of values) this.add(name, unit, value)
    return this
  }

  has(name: string): boolean {
    return this.metrics.has(name)
  }

  sampleCount(name: string): number {
    return this.metrics.get(name)?.samples.length ?? 0
  }

  metricNames(): string[] {
    return [...this.metrics.keys()].sort((left, right) => left.localeCompare(right))
  }

  toMetrics(): Record<string, MetricSeries> {
    const result: Record<string, MetricSeries> = {}
    for (const name of this.metricNames()) {
      const metric = this.metrics.get(name)
      if (metric === undefined) continue
      result[name] = {
        unit: metric.unit,
        samples: [...metric.samples],
      }
    }
    return result
  }

  clear(): void {
    this.metrics.clear()
  }
}

export const createPerformanceGateReport = (
  collector: PerformanceSampleCollector,
  metadata: PerformanceGateReportMetadata,
): PerformanceGateReport => {
  const metrics = collector.toMetrics()
  if (Object.keys(metrics).length === 0) {
    throw new Error('performance gate report must contain at least one metric')
  }
  for (const [name, metric] of Object.entries(metrics)) {
    if (metric.samples.length < MINIMUM_SAMPLE_COUNT) {
      throw new Error(
        'metric ' +
          name +
          ' has ' +
          metric.samples.length +
          ' samples; requires at least ' +
          MINIMUM_SAMPLE_COUNT,
      )
    }
  }

  return parsePerformanceGateReport({
    schemaVersion: 1,
    productVersion: metadata.productVersion,
    suite: metadata.suite,
    level: metadata.level,
    generatedAt: metadata.generatedAt ?? new Date().toISOString(),
    environment: metadata.environment,
    metrics,
  })
}

export const writePerformanceGateReport = (
  filePath: string,
  report: PerformanceGateReport,
): void => {
  const validated = parsePerformanceGateReport(report)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(validated, null, 2) + '\n', 'utf8')
}

export const readPerformanceGateReport = (filePath: string): PerformanceGateReport =>
  parsePerformanceGateReport(JSON.parse(readFileSync(filePath, 'utf8')) as unknown)
