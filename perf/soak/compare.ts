import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SOAK_SCHEMA_VERSION = 1 as const

export type SoakSuite = 'desktop' | 'muya'
export type MetricUnit = 'ms' | 'count' | 'bytes' | 'ratio'
export type AbsoluteGateOperator = 'eq' | 'lt' | 'lte' | 'gt' | 'gte'

export interface AbsoluteGate {
  id: string
  name: string
  unit: MetricUnit
  operator: AbsoluteGateOperator
  limit: number
}

export interface AbsoluteGateFailure {
  id: string
  name: string
  unit: MetricUnit
  operator: AbsoluteGateOperator
  limit: number
  currentValue?: number
  reason: 'metric-missing' | 'unit-mismatch' | 'failed'
}

export interface SoakMetric {
  name: string
  unit: MetricUnit
  value: number
}

export interface SoakReport {
  schemaVersion: typeof SOAK_SCHEMA_VERSION
  suite: SoakSuite
  generatedAt: string
  commit?: string
  environment?: Record<string, string>
  metrics: SoakMetric[]
}

export interface ThresholdConfig {
  schemaVersion: typeof SOAK_SCHEMA_VERSION
  comparison: 'relative'
  maxRelativeRegression: number
  regressionPolicy: 'blocking'
  absoluteGates: AbsoluteGate[]
}

export interface ComparedMetric {
  name: string
  unit: MetricUnit
  baselineValue: number
  currentValue: number
  relativeChange: number
}

export interface SkippedMetric {
  name: string
  reason: 'baseline-missing' | 'unit-mismatch' | 'baseline-not-positive'
}

export interface PerformanceComparison {
  schemaVersion: typeof SOAK_SCHEMA_VERSION
  suite: SoakSuite
  generatedAt: string
  status: 'compared' | 'baseline-unavailable' | 'no-comparable-metrics'
  baselineCommit?: string
  threshold: number
  comparedMetrics: ComparedMetric[]
  skippedMetrics: SkippedMetric[]
  failures: ComparedMetric[]
  absoluteFailures: AbsoluteGateFailure[]
  passed: boolean
}

const allowedReportKeys = new Set([
  'schemaVersion',
  'suite',
  'generatedAt',
  'commit',
  'environment',
  'metrics'
])
const allowedMetricKeys = new Set(['name', 'unit', 'value'])
const allowedThresholdKeys = new Set([
  '$schema',
  '$id',
  'schemaVersion',
  'comparison',
  'maxRelativeRegression',
  'regressionPolicy',
  'absoluteGates'
])
const metricUnits: readonly MetricUnit[] = ['ms', 'count', 'bytes', 'ratio']
const absoluteGateOperators: readonly AbsoluteGateOperator[] = ['eq', 'lt', 'lte', 'gt', 'gte']
const allowedAbsoluteGateKeys = new Set(['id', 'name', 'unit', 'operator', 'limit'])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const assertKnownKeys = (
  value: Record<string, unknown>,
  allowed: Set<string>,
  label: string
): void => {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unknown field: ${key}`)
  }
}

const isFiniteNonNegativeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

const isSuite = (value: unknown): value is SoakSuite => value === 'desktop' || value === 'muya'

const isMetricUnit = (value: unknown): value is MetricUnit =>
  typeof value === 'string' && metricUnits.includes(value as MetricUnit)

const isAbsoluteGateOperator = (value: unknown): value is AbsoluteGateOperator =>
  typeof value === 'string' && absoluteGateOperators.includes(value as AbsoluteGateOperator)

export const validateSoakReport = (value: unknown): SoakReport => {
  if (!isRecord(value)) {
    throw new Error('performance report must be an object')
  }
  assertKnownKeys(value, allowedReportKeys, 'performance report')

  if (value.schemaVersion !== SOAK_SCHEMA_VERSION) {
    throw new Error(`performance report schemaVersion must be ${SOAK_SCHEMA_VERSION}`)
  }
  if (!isSuite(value.suite)) {
    throw new Error('performance report suite must be desktop or muya')
  }
  if (typeof value.generatedAt !== 'string' || !Number.isFinite(Date.parse(value.generatedAt))) {
    throw new Error('performance report generatedAt must be an ISO date-time string')
  }
  if (
    value.commit !== undefined &&
    (typeof value.commit !== 'string' || value.commit.length === 0)
  ) {
    throw new Error('performance report commit must be a non-empty string')
  }

  let environment: Record<string, string> | undefined
  if (value.environment !== undefined) {
    if (!isRecord(value.environment)) {
      throw new Error('performance report environment must be an object')
    }
    environment = {}
    for (const [key, item] of Object.entries(value.environment)) {
      if (typeof item !== 'string') {
        throw new Error(`performance report environment.${key} must be a string`)
      }
      environment[key] = item
    }
  }

  if (!Array.isArray(value.metrics)) {
    throw new Error('performance report metrics must be an array')
  }
  const names = new Set<string>()
  const metrics: SoakMetric[] = []
  for (const candidate of value.metrics) {
    if (!isRecord(candidate)) {
      throw new Error('performance report metric must be an object')
    }
    assertKnownKeys(candidate, allowedMetricKeys, 'performance report metric')
    if (typeof candidate.name !== 'string' || candidate.name.length === 0) {
      throw new Error('performance report metric name must be non-empty')
    }
    if (!isMetricUnit(candidate.unit)) {
      throw new Error(`performance report metric ${candidate.name} has an invalid unit`)
    }
    if (!isFiniteNonNegativeNumber(candidate.value)) {
      throw new Error(
        `performance report metric ${candidate.name} must be a finite non-negative number`
      )
    }
    if (names.has(candidate.name)) {
      throw new Error(`performance report contains duplicate metric: ${candidate.name}`)
    }
    names.add(candidate.name)
    metrics.push({ name: candidate.name, unit: candidate.unit, value: candidate.value })
  }

  return {
    schemaVersion: SOAK_SCHEMA_VERSION,
    suite: value.suite,
    generatedAt: value.generatedAt,
    ...(value.commit === undefined ? {} : { commit: value.commit }),
    ...(environment === undefined ? {} : { environment }),
    metrics
  }
}

export const validateThresholdConfig = (value: unknown): ThresholdConfig => {
  if (!isRecord(value)) {
    throw new Error('threshold config must be an object')
  }
  assertKnownKeys(value, allowedThresholdKeys, 'threshold config')

  if (value.schemaVersion !== SOAK_SCHEMA_VERSION) {
    throw new Error(`threshold config schemaVersion must be ${SOAK_SCHEMA_VERSION}`)
  }
  if (value.comparison !== 'relative') {
    throw new Error('threshold config comparison must be relative')
  }
  if (!isFiniteNonNegativeNumber(value.maxRelativeRegression) || value.maxRelativeRegression >= 1) {
    throw new Error('threshold config maxRelativeRegression must be between 0 and 1')
  }
  if (value.regressionPolicy !== 'blocking') {
    throw new Error('threshold config regressionPolicy must be blocking')
  }
  if (!Array.isArray(value.absoluteGates)) {
    throw new Error('threshold config absoluteGates must be an array')
  }

  const gateIds = new Set<string>()
  const absoluteGates: AbsoluteGate[] = []
  for (const candidate of value.absoluteGates) {
    if (!isRecord(candidate)) {
      throw new Error('threshold absolute gate must be an object')
    }
    assertKnownKeys(candidate, allowedAbsoluteGateKeys, 'threshold absolute gate')
    if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
      throw new Error('threshold absolute gate id must be non-empty')
    }
    if (typeof candidate.name !== 'string' || candidate.name.length === 0) {
      throw new Error('threshold absolute gate name must be non-empty')
    }
    if (!isMetricUnit(candidate.unit)) {
      throw new Error('threshold absolute gate ' + candidate.id + ' has an invalid unit')
    }
    if (!isAbsoluteGateOperator(candidate.operator)) {
      throw new Error('threshold absolute gate ' + candidate.id + ' has an invalid operator')
    }
    if (!isFiniteNonNegativeNumber(candidate.limit)) {
      throw new Error('threshold absolute gate ' + candidate.id + ' limit must be finite and non-negative')
    }
    if (gateIds.has(candidate.id)) {
      throw new Error('threshold absolute gate contains duplicate id: ' + candidate.id)
    }
    gateIds.add(candidate.id)
    absoluteGates.push({
      id: candidate.id,
      name: candidate.name,
      unit: candidate.unit,
      operator: candidate.operator,
      limit: candidate.limit
    })
  }

  return {
    schemaVersion: SOAK_SCHEMA_VERSION,
    comparison: 'relative',
    maxRelativeRegression: value.maxRelativeRegression,
    regressionPolicy: 'blocking',
    absoluteGates
  }
}

const passesAbsoluteGate = (value: number, gate: AbsoluteGate): boolean => {
  switch (gate.operator) {
    case 'eq': return value === gate.limit
    case 'lt': return value < gate.limit
    case 'lte': return value <= gate.limit
    case 'gt': return value > gate.limit
    case 'gte': return value >= gate.limit
  }
}

const evaluateAbsoluteGates = (
  report: SoakReport,
  gates: AbsoluteGate[]
): AbsoluteGateFailure[] => {
  const metrics = new Map(report.metrics.map((metric) => [metric.name, metric]))
  const failures: AbsoluteGateFailure[] = []
  for (const gate of gates) {
    const metric = metrics.get(gate.name)
    if (!metric) {
      failures.push({
        id: gate.id,
        name: gate.name,
        unit: gate.unit,
        operator: gate.operator,
        limit: gate.limit,
        reason: 'metric-missing'
      })
      continue
    }
    if (metric.unit !== gate.unit) {
      failures.push({
        id: gate.id,
        name: gate.name,
        unit: gate.unit,
        operator: gate.operator,
        limit: gate.limit,
        currentValue: metric.value,
        reason: 'unit-mismatch'
      })
      continue
    }
    if (!passesAbsoluteGate(metric.value, gate)) {
      failures.push({
        id: gate.id,
        name: gate.name,
        unit: gate.unit,
        operator: gate.operator,
        limit: gate.limit,
        currentValue: metric.value,
        reason: 'failed'
      })
    }
  }
  return failures
}

export const compareSoakReports = (
  currentValue: unknown,
  baselineValue: unknown | undefined,
  thresholdValue: unknown
): PerformanceComparison => {
  const current = validateSoakReport(currentValue)
  const thresholds = validateThresholdConfig(thresholdValue)
  const generatedAt = new Date().toISOString()

  const absoluteMetricNames = new Set(thresholds.absoluteGates.map((gate) => gate.name))
  const absoluteFailures = evaluateAbsoluteGates(current, thresholds.absoluteGates)

  if (baselineValue === undefined) {
    return {
      schemaVersion: SOAK_SCHEMA_VERSION,
      suite: current.suite,
      generatedAt,
      status: 'baseline-unavailable',
      threshold: thresholds.maxRelativeRegression,
      comparedMetrics: [],
      skippedMetrics: current.metrics
        .filter(({ name }) => !absoluteMetricNames.has(name))
        .map(({ name }) => ({ name, reason: 'baseline-missing' })),
      failures: [],
      absoluteFailures,
      passed: false
    }
  }

  const baseline = validateSoakReport(baselineValue)
  if (baseline.suite !== current.suite) {
    throw new Error(`cannot compare ${current.suite} report with ${baseline.suite} baseline`)
  }

  const baselineMetrics = new Map(baseline.metrics.map((metric) => [metric.name, metric]))
  const comparedMetrics: ComparedMetric[] = []
  const skippedMetrics: SkippedMetric[] = []

  for (const metric of current.metrics) {
    if (absoluteMetricNames.has(metric.name)) continue
    const baselineMetric = baselineMetrics.get(metric.name)
    if (!baselineMetric) {
      skippedMetrics.push({ name: metric.name, reason: 'baseline-missing' })
      continue
    }
    if (baselineMetric.unit !== metric.unit) {
      skippedMetrics.push({ name: metric.name, reason: 'unit-mismatch' })
      continue
    }
    if (baselineMetric.value <= 0) {
      skippedMetrics.push({ name: metric.name, reason: 'baseline-not-positive' })
      continue
    }

    comparedMetrics.push({
      name: metric.name,
      unit: metric.unit,
      baselineValue: baselineMetric.value,
      currentValue: metric.value,
      relativeChange: (metric.value - baselineMetric.value) / baselineMetric.value
    })
  }

  comparedMetrics.sort((left, right) => left.name.localeCompare(right.name))
  const failures = comparedMetrics.filter(
    (metric) => metric.relativeChange > thresholds.maxRelativeRegression
  )
  const hasAbsoluteMetrics = current.metrics.some(({ name }) => absoluteMetricNames.has(name))
  const status = comparedMetrics.length > 0 || hasAbsoluteMetrics ? 'compared' : 'no-comparable-metrics'

  return {
    schemaVersion: SOAK_SCHEMA_VERSION,
    suite: current.suite,
    generatedAt,
    status,
    ...(baseline.commit === undefined ? {} : { baselineCommit: baseline.commit }),
    threshold: thresholds.maxRelativeRegression,
    comparedMetrics,
    skippedMetrics,
    failures,
    absoluteFailures,
    passed:
      status === 'compared' &&
      failures.length === 0 &&
      skippedMetrics.length === 0 &&
      absoluteFailures.length === 0
  }
}

interface CliOptions {
  currentPath: string
  baselinePath?: string
  thresholdPath: string
  outputPath: string
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

const parseArgs = (args: string[]): CliOptions => {
  const options: Partial<CliOptions> = {}
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const value = args[index + 1]
    if (arg === '--current' && value) options.currentPath = value
    else if (arg === '--baseline' && value) options.baselinePath = value
    else if (arg === '--thresholds' && value) options.thresholdPath = value
    else if (arg === '--output' && value) options.outputPath = value
    else throw new Error(`unknown or incomplete argument: ${arg}`)
    index += 1
  }

  if (!options.currentPath || !options.thresholdPath || !options.outputPath) {
    throw new Error(
      'usage: compare.ts --current <path> --thresholds <path> --output <path> [--baseline <path>]'
    )
  }
  return options as CliOptions
}

const appendSummary = (comparison: PerformanceComparison): void => {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (!summaryPath) return

  const suiteLabel = comparison.suite === 'desktop' ? 'Desktop' : 'Muya'
  const lines = [
    '## ' + suiteLabel + ' performance soak',
    '- Baseline: ' + (comparison.status === 'baseline-unavailable' ? 'unavailable' : 'available'),
    '- Passed: ' + (comparison.passed ? 'yes' : 'no'),
    '- Compared metrics: ' + comparison.comparedMetrics.length,
    '- Blocking threshold: ' + (comparison.threshold * 100).toFixed(0) + '% relative regression',
    '- Blocking regressions: ' + comparison.failures.length,
    '- Absolute gate failures: ' + comparison.absoluteFailures.length,
    '- Skipped metrics: ' + comparison.skippedMetrics.length
  ]
  for (const failure of comparison.failures) {
    lines.push(
      '  - "' + failure.name + '": ' + failure.baselineValue.toFixed(2) + ' → ' +
        failure.currentValue.toFixed(2) + ' ' + failure.unit + ' (+' +
        (failure.relativeChange * 100).toFixed(1) + '%)'
    )
  }
  for (const absoluteFailure of comparison.absoluteFailures) {
    const currentValue =
      absoluteFailure.currentValue === undefined ? 'missing' : absoluteFailure.currentValue.toFixed(2)
    lines.push(
      '  - "' + absoluteFailure.name + '": ' + currentValue + ' ' + absoluteFailure.unit +
        ' ' + absoluteFailure.operator + ' ' + absoluteFailure.limit + ' (' +
        absoluteFailure.reason + ')'
    )
  }
  for (const skipped of comparison.skippedMetrics) {
    lines.push('  - "' + skipped.name + '": skipped because ' + skipped.reason)
  }
  appendFileSync(summaryPath, lines.join('\n') + '\n')
}

export const runComparisonCli = (args: string[]): PerformanceComparison => {
  const options = parseArgs(args)
  const current = validateSoakReport(readJson(options.currentPath))
  const baseline =
    options.baselinePath && existsSync(options.baselinePath)
      ? validateSoakReport(readJson(options.baselinePath))
      : undefined
  const thresholds = validateThresholdConfig(readJson(options.thresholdPath))
  const comparison = compareSoakReports(current, baseline, thresholds)

  mkdirSync(dirname(options.outputPath), { recursive: true })
  writeFileSync(options.outputPath, `${JSON.stringify(comparison, null, 2)}\n`, 'utf8')
  for (const failure of comparison.failures) {
    console.error(
      '::error title=Performance regression::' + comparison.suite + ' ' + failure.name +
      ' increased ' + (failure.relativeChange * 100).toFixed(1) + '% (' +
      failure.baselineValue.toFixed(2) + ' → ' + failure.currentValue.toFixed(2) + ' ' + failure.unit + ')'
    )
  }
  for (const absoluteFailure of comparison.absoluteFailures) {
    console.error(
      '::error title=Absolute performance gate failed::' + comparison.suite + ' ' +
      absoluteFailure.name + ' is ' + (
        absoluteFailure.currentValue === undefined
          ? 'missing'
          : String(absoluteFailure.currentValue)
      ) + ' ' + absoluteFailure.unit + '; expected ' + absoluteFailure.operator + ' ' +
      absoluteFailure.limit + ' (' + absoluteFailure.reason + ')'
    )
  }
  for (const skipped of comparison.skippedMetrics) {
    console.error(
      '::error title=Performance comparison incomplete::' + comparison.suite + ' ' +
      skipped.name + ' was skipped (' + skipped.reason + ')'
    )
  }
  if (!comparison.passed) {
    console.error(
      '::error title=Performance comparison failed::' + comparison.suite + ' status=' + comparison.status
    )
  }
  appendSummary(comparison)
  return comparison
}

const isMainModule =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMainModule) {
  try {
    const comparison = runComparisonCli(process.argv.slice(2))
    if (!comparison.passed) process.exitCode = 1
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
