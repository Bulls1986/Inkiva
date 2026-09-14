import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  SOAK_SCHEMA_VERSION,
  type MetricUnit,
  type SoakMetric,
  type SoakReport,
  type SoakSuite,
  validateSoakReport
} from './compare'

interface MetricSample {
  unit: MetricUnit
  values: number[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const isFiniteNonNegativeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

const statSafe = (filePath: string): boolean => {
  try {
    statSync(filePath)
    return true
  } catch {
    return false
  }
}

const collectJsonFiles = (inputPath: string): string[] => {
  if (!statSafe(inputPath)) return []
  if (statSync(inputPath).isFile()) return inputPath.endsWith('.json') ? [inputPath] : []

  const files: string[] = []
  for (const entry of readdirSync(inputPath, { withFileTypes: true })) {
    const entryPath = join(inputPath, entry.name)
    if (entry.isDirectory()) files.push(...collectJsonFiles(entryPath))
    else if (entry.isFile() && entry.name.endsWith('.json')) files.push(entryPath)
  }
  return files.sort()
}

const readJson = (filePath: string): unknown => {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as unknown
  } catch (error) {
    throw new Error(
      `could not read JSON from ${filePath}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

const addSample = (
  samples: Map<string, MetricSample>,
  name: string,
  unit: MetricUnit,
  value: unknown
): void => {
  if (!isFiniteNonNegativeNumber(value)) return
  const existing = samples.get(name)
  if (existing && existing.unit !== unit) {
    throw new Error(`metric ${name} changed unit from ${existing.unit} to ${unit}`)
  }
  if (existing) existing.values.push(value)
  else samples.set(name, { unit, values: [value] })
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

const collectCanonicalReport = (
  value: Record<string, unknown>,
  suite: SoakSuite,
  samples: Map<string, MetricSample>
): boolean => {
  if (!('suite' in value) || !('metrics' in value)) return false
  const report = validateSoakReport(value)
  if (report.suite !== suite) {
    throw new Error(`found ${report.suite} report while collecting ${suite}`)
  }
  for (const metric of report.metrics) addSample(samples, metric.name, metric.unit, metric.value)
  return true
}

const collectDesktopLargeDocumentReport = (
  value: Record<string, unknown>,
  samples: Map<string, MetricSample>
): boolean => {
  if (value.schemaVersion !== SOAK_SCHEMA_VERSION || !Array.isArray(value.metrics)) return false
  if (
    !value.metrics.some((metric) => isRecord(metric) && 'kind' in metric && 'operations' in metric)
  ) {
    return false
  }

  for (const fixture of value.metrics) {
    if (!isRecord(fixture) || typeof fixture.kind !== 'string') {
      continue
    }
    addSample(samples, `desktop.perf-04.${fixture.kind}.open`, 'ms', fixture.openMs)
    if (!Array.isArray(fixture.operations)) continue
    for (const operation of fixture.operations) {
      if (!isRecord(operation) || typeof operation.name !== 'string') continue
      addSample(
        samples,
        `desktop.perf-04.${fixture.kind}.${operation.name}`,
        'ms',
        operation.durationMs
      )
      if (Array.isArray(operation.longTasksOver50Ms)) {
        addSample(
          samples,
          `desktop.perf-04.${fixture.kind}.${operation.name}.long-tasks-over-50ms`,
          'count',
          operation.longTasksOver50Ms.length
        )
      }
    }
  }
  return true
}

const collectDesktopTraceReport = (
  value: Record<string, unknown>,
  samples: Map<string, MetricSample>
): boolean => {
  if (value.schemaVersion !== SOAK_SCHEMA_VERSION || !Array.isArray(value.traces)) return false
  for (const trace of value.traces) {
    if (!isRecord(trace) || !Array.isArray(trace.events)) continue
    for (const event of trace.events) {
      if (!isRecord(event) || typeof event.name !== 'string' || typeof event.process !== 'string') {
        continue
      }
      const field = isFiniteNonNegativeNumber(event.durationMs)
        ? 'durationMs'
        : isFiniteNonNegativeNumber(event.elapsedMs)
          ? 'elapsedMs'
          : undefined
      if (!field) continue
      addSample(
        samples,
        `desktop.trace.${event.process}.${event.name}.${field}`,
        'ms',
        event[field]
      )
    }
  }
  return true
}

export const collectSoakReport = (suite: SoakSuite, inputPath: string): SoakReport => {
  const samples = new Map<string, MetricSample>()
  for (const filePath of collectJsonFiles(inputPath)) {
    const value = readJson(filePath)
    if (!isRecord(value)) continue
    if (collectCanonicalReport(value, suite, samples)) continue
    if (suite === 'desktop' && collectDesktopLargeDocumentReport(value, samples)) continue
    if (suite === 'desktop') collectDesktopTraceReport(value, samples)
  }

  const metrics: SoakMetric[] = [...samples.entries()]
    .map(([name, sample]) => ({ name, unit: sample.unit, value: median(sample.values) }))
    .sort((left, right) => left.name.localeCompare(right.name))
  const environment: Record<string, string> = {
    node: process.version,
    platform: process.platform
  }
  if (process.env.GITHUB_RUN_ID) environment.runId = process.env.GITHUB_RUN_ID

  return validateSoakReport({
    schemaVersion: SOAK_SCHEMA_VERSION,
    suite,
    generatedAt: new Date().toISOString(),
    ...(process.env.GITHUB_SHA ? { commit: process.env.GITHUB_SHA } : {}),
    environment,
    metrics
  })
}

interface CliOptions {
  suite: SoakSuite
  inputPath: string
  outputPath: string
}

const parseArgs = (args: string[]): CliOptions => {
  const options: Partial<CliOptions> = {}
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const value = args[index + 1]
    if (arg === '--suite' && (value === 'desktop' || value === 'muya')) options.suite = value
    else if (arg === '--input' && value) options.inputPath = value
    else if (arg === '--output' && value) options.outputPath = value
    else throw new Error(`unknown or incomplete argument: ${arg}`)
    index += 1
  }
  if (!options.suite || !options.inputPath || !options.outputPath) {
    throw new Error('usage: collect.ts --suite <desktop|muya> --input <path> --output <path>')
  }
  return options as CliOptions
}

export const runCollectionCli = (args: string[]): SoakReport => {
  const options = parseArgs(args)
  const report = collectSoakReport(options.suite, options.inputPath)
  mkdirSync(dirname(options.outputPath), { recursive: true })
  writeFileSync(options.outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(`Collected ${report.metrics.length} ${report.suite} performance metrics.`)
  return report
}

if (process.argv[1]?.endsWith('/collect.ts') || process.argv[1]?.endsWith('\\collect.ts')) {
  try {
    runCollectionCli(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
