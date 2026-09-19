import { LARGE_GATE_SAMPLE_COUNT } from './large-collection.js'
import {
  getLargeGateScenario,
  RUNTIME_COLLECTED_METRICS,
  type LargeGateLevel
} from './large-scenarios.js'
import { mergePerformanceTraceReports, type RawPerformanceReport } from './trace-input.js'

export const P1_LARGE_GATE_SHARDS = [
  'doc-50k',
  'doc-100k',
  'doc-large',
  'tree',
  'tabs-open',
  'tabs-switch',
  'memory-footprint',
  'memory-leak'
] as const

export const P2_LARGE_GATE_SHARDS = [
  'doc-50k',
  'doc-large',
  'headings',
  'tree',
  'tabs-open',
  'tabs-switch',
  'memory-footprint',
  'diagrams',
  'combination',
  'memory-leak'
] as const

export type P1LargeGateShard = (typeof P1_LARGE_GATE_SHARDS)[number]
export type P2LargeGateShard = (typeof P2_LARGE_GATE_SHARDS)[number]
export type LargeGateShard = P1LargeGateShard | P2LargeGateShard

export const getLargeGateShards = (level: LargeGateLevel): readonly LargeGateShard[] => {
  if (level === 'P1') return P1_LARGE_GATE_SHARDS
  if (level === 'P2') return P2_LARGE_GATE_SHARDS
  return []
}

export const parseLargeGateShard = (
  level: LargeGateLevel,
  value: string | undefined
): LargeGateShard | null => {
  const shard = value?.trim()
  if (!shard) return null
  const shards = getLargeGateShards(level)
  if (!shards.includes(shard as LargeGateShard)) {
    throw new Error(
      level + ' large gate shard is unknown: ' + shard + '; expected ' + shards.join(', ')
    )
  }
  return shard as LargeGateShard
}

const metricCounts = (report: RawPerformanceReport): Map<string, number> => {
  const counts = new Map<string, number>()
  for (const trace of report.traces) {
    for (const event of trace.events) {
      if (event === null || typeof event !== 'object' || Array.isArray(event)) continue
      const candidate = event as { name?: unknown; metadata?: unknown }
      if (candidate.name !== 'metric_sample') continue
      if (
        candidate.metadata === null ||
        typeof candidate.metadata !== 'object' ||
        Array.isArray(candidate.metadata)
      ) { continue }
      const metric = (candidate.metadata as { metric?: unknown }).metric
      if (typeof metric !== 'string' || metric === '') continue
      counts.set(metric, (counts.get(metric) ?? 0) + 1)
    }
  }
  return counts
}

export const assertLargeGateRawCoverage = (
  report: RawPerformanceReport,
  level: LargeGateLevel,
  minimumSamples = LARGE_GATE_SAMPLE_COUNT
): void => {
  const counts = metricCounts(report)
  const required = new Set([...getLargeGateScenario(level).metrics, ...RUNTIME_COLLECTED_METRICS])
  const missing = [...required].filter((metric) => (counts.get(metric) ?? 0) < minimumSamples)
  if (missing.length > 0) {
    throw new Error(
      level +
        ' real collector did not produce ' +
        minimumSamples +
        ' raw samples for: ' +
        missing.map((metric) => metric + '=' + String(counts.get(metric) ?? 0)).join(', ')
    )
  }
}

export const mergeLargeGateShardReports = (
  reports: readonly unknown[],
  level: LargeGateLevel
): RawPerformanceReport => {
  const merged = mergePerformanceTraceReports(reports)
  assertLargeGateRawCoverage(merged, level)
  return merged
}
