import { readFileSync } from 'node:fs'

const SCHEMA_VERSION = 1

interface RawTrace {
  schemaVersion: typeof SCHEMA_VERSION
  traceId: string
  process: 'main' | 'renderer'
  startedAtEpochMs: number
  timeOriginEpochMs: number
  events: unknown[]
}

export interface RawPerformanceReport {
  schemaVersion: typeof SCHEMA_VERSION
  generatedAtEpochMs: number
  traces: RawTrace[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const asFiniteNumber = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(label + ' must be a finite number')
  }
  return value
}

const normalizeReport = (value: unknown, reportIndex: number): RawPerformanceReport => {
  if (!isRecord(value)) {
    throw new Error('performance trace report ' + reportIndex + ' must be an object')
  }
  if (value.schemaVersion !== SCHEMA_VERSION) {
    throw new Error('performance trace report ' + reportIndex + ' has unsupported schemaVersion')
  }
  const generatedAtEpochMs = asFiniteNumber(
    value.generatedAtEpochMs,
    'performance trace report ' + reportIndex + '.generatedAtEpochMs'
  )
  if (!Array.isArray(value.traces)) {
    throw new Error('performance trace report ' + reportIndex + '.traces must be an array')
  }

  const traces: RawTrace[] = []
  for (const [traceIndex, candidate] of value.traces.entries()) {
    if (!isRecord(candidate)) {
      throw new Error('performance trace ' + reportIndex + '/' + traceIndex + ' must be an object')
    }
    if (candidate.schemaVersion !== SCHEMA_VERSION) {
      throw new Error(
        'performance trace ' + reportIndex + '/' + traceIndex + ' has unsupported schemaVersion'
      )
    }
    if (
      typeof candidate.traceId !== 'string' ||
      candidate.traceId.trim() === '' ||
      typeof candidate.process !== 'string' ||
      (candidate.process !== 'main' && candidate.process !== 'renderer')
    ) {
      throw new Error('performance trace ' + reportIndex + '/' + traceIndex + ' has invalid identity')
    }
    if (!Array.isArray(candidate.events)) {
      throw new Error(
        'performance trace ' + reportIndex + '/' + traceIndex + '.events must be an array'
      )
    }
    traces.push({
      schemaVersion: SCHEMA_VERSION,
      traceId: candidate.traceId,
      process: candidate.process,
      startedAtEpochMs: asFiniteNumber(
        candidate.startedAtEpochMs,
        'performance trace ' + reportIndex + '/' + traceIndex + '.startedAtEpochMs'
      ),
      timeOriginEpochMs: asFiniteNumber(
        candidate.timeOriginEpochMs,
        'performance trace ' + reportIndex + '/' + traceIndex + '.timeOriginEpochMs'
      ),
      events: [...candidate.events]
    })
  }

  return { schemaVersion: SCHEMA_VERSION, generatedAtEpochMs, traces }
}

export const mergePerformanceTraceReports = (
  reports: readonly unknown[]
): RawPerformanceReport => {
  if (reports.length === 0) {
    throw new Error('at least one trace report is required')
  }

  const traces = new Map<string, RawTrace>()
  let generatedAtEpochMs = 0

  for (const [reportIndex, value] of reports.entries()) {
    const report = normalizeReport(value, reportIndex)
    generatedAtEpochMs = Math.max(generatedAtEpochMs, report.generatedAtEpochMs)

    for (const trace of report.traces) {
      const existing = traces.get(trace.traceId)
      if (existing === undefined) {
        traces.set(trace.traceId, {
          ...trace,
          events: [...trace.events]
        })
        continue
      }
      if (existing.process !== trace.process) {
        throw new Error('trace ' + trace.traceId + ' changed process across reports')
      }
      existing.events.push(...trace.events)
    }
  }

  if (traces.size === 0) {
    throw new Error('trace reports must contain at least one trace')
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAtEpochMs,
    traces: [...traces.values()]
  }
}

export const readAndMergePerformanceTraceReports = (
  paths: readonly string[]
): RawPerformanceReport => {
  if (paths.length === 0) {
    throw new Error('at least one trace report path is required')
  }

  const reports = paths.map((filePath) => {
    let content: string
    try {
      content = readFileSync(filePath, 'utf8')
    } catch (error) {
      throw new Error(
        'could not read performance trace report ' +
          filePath +
          ': ' +
          (error instanceof Error ? error.message : String(error))
      )
    }
    try {
      return JSON.parse(content) as unknown
    } catch (error) {
      throw new Error(
        'could not parse performance trace report ' +
          filePath +
          ': ' +
          (error instanceof Error ? error.message : String(error))
      )
    }
  })

  return mergePerformanceTraceReports(reports)
}
