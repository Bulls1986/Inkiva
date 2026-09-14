export const PERFORMANCE_GATE_SCHEMA_VERSION = 1 as const
export const MINIMUM_SAMPLE_COUNT = 20 as const

export const GATE_LEVELS = ['P0', 'P1', 'P2', 'P3'] as const
export type GateLevel = (typeof GATE_LEVELS)[number]

export const METRIC_UNITS = ['ms', 'count', 'bytes', 'ratio'] as const
export type MetricUnit = (typeof METRIC_UNITS)[number]

export const STATISTICS = ['min', 'p50', 'p95', 'p99', 'max', 'count'] as const
export type Statistic = (typeof STATISTICS)[number]

export const OPERATORS = ['lt', 'lte', 'eq', 'gte', 'gt'] as const
export type Operator = (typeof OPERATORS)[number]

export const ENVIRONMENT_KEYS = [
  'os',
  'cpu',
  'memory',
  'disk',
  'gpu',
  'display',
  'power',
  'network',
  'runner',
] as const
export type EnvironmentKey = (typeof ENVIRONMENT_KEYS)[number]

export interface MetricSeries {
  unit: MetricUnit
  samples: number[]
}

export interface PerformanceGateEnvironment {
  os: string
  cpu: string
  memory: string
  disk: string
  gpu: string
  display: string
  power: string
  network: string
  runner: string
}

export interface PerformanceGateReport {
  schemaVersion: number
  productVersion: string
  suite: string
  level: GateLevel
  generatedAt: string
  environment: PerformanceGateEnvironment
  metrics: Record<string, MetricSeries>
}

export interface GateDefinition {
  id: string
  metric: string
  unit: MetricUnit
  statistic: Statistic
  operator: Operator
  limit: number
  minSamples?: number
}

export interface DegradationMetric {
  metric: string
  statistic: Statistic
}

export interface DegradationConfig {
  metrics: DegradationMetric[]
  maxRelativeIncrease: number
}

export interface PerformanceGateLevelConfig {
  gates: GateDefinition[]
  degradation?: DegradationConfig
}

export interface PerformanceGateConfig {
  schemaVersion: number
  minimumSamples: number
  levels: Record<GateLevel, PerformanceGateLevelConfig>
}

export interface GateFailure {
  code:
    | 'invalid-report'
    | 'invalid-config'
    | 'metric-missing'
    | 'unit-mismatch'
    | 'insufficient-samples'
    | 'threshold-failed'
    | 'baseline-missing'
    | 'baseline-metric-missing'
    | 'baseline-unit-mismatch'
    | 'baseline-insufficient-samples'
    | 'baseline-invalid'
    | 'degradation-failed'
  gateId?: string
  metric?: string
  detail: string
}

export interface PerformanceGateEvaluation {
  passed: boolean
  level: GateLevel
  failures: GateFailure[]
  observed: Record<string, number>
}

export interface EvaluatePerformanceGateOptions {
  baseline?: PerformanceGateReport
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecord(value: unknown, label: string): UnknownRecord {
  if (!isRecord(value)) {
    throw new Error(label + ' must be an object')
  }
  return value
}

function assertKnownKeys(
  value: UnknownRecord,
  allowed: readonly string[],
  label: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new Error(label + ' contains unknown key: ' + key)
    }
  }
}

function isGateLevel(value: unknown): value is GateLevel {
  return typeof value === 'string' && GATE_LEVELS.includes(value as GateLevel)
}

function isMetricUnit(value: unknown): value is MetricUnit {
  return typeof value === 'string' && METRIC_UNITS.includes(value as MetricUnit)
}

function isStatistic(value: unknown): value is Statistic {
  return typeof value === 'string' && STATISTICS.includes(value as Statistic)
}

function isOperator(value: unknown): value is Operator {
  return typeof value === 'string' && OPERATORS.includes(value as Operator)
}

function assertNonEmptyString(value: unknown, label: string): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(label + ' must be a non-empty string')
  }
}

function assertFiniteNumber(value: unknown, label: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(label + ' must be a finite number')
  }
}

function assertNonNegativeSamples(samples: unknown, label: string): asserts samples is number[] {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error(label + ' must be a non-empty array')
  }
  for (const [index, sample] of samples.entries()) {
    assertFiniteNumber(sample, label + '[' + index + ']')
    if (sample < 0) {
      throw new Error(label + '[' + index + '] must be non-negative')
    }
  }
}

function validateEnvironment(value: unknown): asserts value is PerformanceGateEnvironment {
  const environment = asRecord(value, 'report.environment')
  assertKnownKeys(environment, ENVIRONMENT_KEYS, 'report.environment')
  for (const key of ENVIRONMENT_KEYS) {
    assertNonEmptyString(environment[key], 'report.environment.' + key)
  }
}

function validateMetricSeries(
  value: unknown,
  label: string,
): asserts value is MetricSeries {
  const metric = asRecord(value, label)
  assertKnownKeys(metric, ['unit', 'samples'], label)
  if (!isMetricUnit(metric.unit)) {
    throw new Error(label + '.unit is invalid')
  }
  assertNonNegativeSamples(metric.samples, label + '.samples')
}

function validateReport(value: unknown): asserts value is PerformanceGateReport {
  const report = asRecord(value, 'report')
  assertKnownKeys(
    report,
    [
      'schemaVersion',
      'productVersion',
      'suite',
      'level',
      'generatedAt',
      'environment',
      'metrics',
    ],
    'report',
  )
  if (report.schemaVersion !== PERFORMANCE_GATE_SCHEMA_VERSION) {
    throw new Error('report.schemaVersion is unsupported')
  }
  assertNonEmptyString(report.productVersion, 'report.productVersion')
  assertNonEmptyString(report.suite, 'report.suite')
  if (!isGateLevel(report.level)) {
    throw new Error('report.level is invalid')
  }
  assertNonEmptyString(report.generatedAt, 'report.generatedAt')
  validateEnvironment(report.environment)
  const metrics = asRecord(report.metrics, 'report.metrics')
  for (const [metricName, metric] of Object.entries(metrics)) {
    assertNonEmptyString(metricName, 'report.metrics key')
    validateMetricSeries(metric, 'report.metrics.' + metricName)
  }
}

function validateGateDefinition(value: unknown, label: string): asserts value is GateDefinition {
  const gate = asRecord(value, label)
  assertKnownKeys(
    gate,
    ['id', 'metric', 'unit', 'statistic', 'operator', 'limit', 'minSamples'],
    label,
  )
  assertNonEmptyString(gate.id, label + '.id')
  assertNonEmptyString(gate.metric, label + '.metric')
  if (!isMetricUnit(gate.unit)) {
    throw new Error(label + '.unit is invalid')
  }
  if (!isStatistic(gate.statistic)) {
    throw new Error(label + '.statistic is invalid')
  }
  if (!isOperator(gate.operator)) {
    throw new Error(label + '.operator is invalid')
  }
  assertFiniteNumber(gate.limit, label + '.limit')
  if (gate.minSamples !== undefined) {
    if (
      typeof gate.minSamples !== 'number' ||
      !Number.isInteger(gate.minSamples) ||
      gate.minSamples < MINIMUM_SAMPLE_COUNT
    ) {
      throw new Error(label + '.minSamples must be an integer of at least 20')
    }
  }
}

function validateDegradationMetric(
  value: unknown,
  label: string,
): asserts value is DegradationMetric {
  const metric = asRecord(value, label)
  assertKnownKeys(metric, ['metric', 'statistic'], label)
  assertNonEmptyString(metric.metric, label + '.metric')
  if (!isStatistic(metric.statistic)) {
    throw new Error(label + '.statistic is invalid')
  }
}

function validateDegradation(
  value: unknown,
  label: string,
): asserts value is DegradationConfig {
  const degradation = asRecord(value, label)
  assertKnownKeys(degradation, ['metrics', 'maxRelativeIncrease'], label)
  if (!Array.isArray(degradation.metrics) || degradation.metrics.length === 0) {
    throw new Error(label + '.metrics must be a non-empty array')
  }
  for (const [index, metric] of degradation.metrics.entries()) {
    validateDegradationMetric(metric, label + '.metrics[' + index + ']')
  }
  assertFiniteNumber(degradation.maxRelativeIncrease, label + '.maxRelativeIncrease')
  if (degradation.maxRelativeIncrease < 0) {
    throw new Error(label + '.maxRelativeIncrease must be non-negative')
  }
}

function validateLevelConfig(
  value: unknown,
  label: string,
): asserts value is PerformanceGateLevelConfig {
  const level = asRecord(value, label)
  assertKnownKeys(level, ['gates', 'degradation'], label)
  if (!Array.isArray(level.gates) || level.gates.length === 0) {
    throw new Error(label + '.gates must be a non-empty array')
  }
  const ids = new Set<string>()
  for (const [index, gate] of level.gates.entries()) {
    validateGateDefinition(gate, label + '.gates[' + index + ']')
    if (ids.has(gate.id)) {
      throw new Error(label + ' contains duplicate gate id: ' + gate.id)
    }
    ids.add(gate.id)
  }
  if (level.degradation !== undefined) {
    validateDegradation(level.degradation, label + '.degradation')
  }
}

export function validatePerformanceGateConfig(
  value: unknown,
): asserts value is PerformanceGateConfig {
  const config = asRecord(value, 'config')
  assertKnownKeys(config, ['schemaVersion', 'minimumSamples', 'levels'], 'config')
  if (config.schemaVersion !== PERFORMANCE_GATE_SCHEMA_VERSION) {
    throw new Error('config.schemaVersion is unsupported')
  }
  if (
    typeof config.minimumSamples !== 'number' ||
    !Number.isInteger(config.minimumSamples) ||
    config.minimumSamples < MINIMUM_SAMPLE_COUNT
  ) {
    throw new Error('config.minimumSamples must be an integer of at least 20')
  }
  const levels = asRecord(config.levels, 'config.levels')
  for (const key of Object.keys(levels)) {
    if (!isGateLevel(key)) {
      throw new Error('config.levels contains unknown level: ' + key)
    }
  }
  for (const level of GATE_LEVELS) {
    if (levels[level] === undefined) {
      throw new Error('config.levels is missing level: ' + level)
    }
    validateLevelConfig(levels[level], 'config.levels.' + level)
  }
}

export function validatePerformanceGateReport(
  value: unknown,
): asserts value is PerformanceGateReport {
  validateReport(value)
}

export function parsePerformanceGateConfig(value: unknown): PerformanceGateConfig {
  validatePerformanceGateConfig(value)
  return value
}

export function parsePerformanceGateReport(value: unknown): PerformanceGateReport {
  validatePerformanceGateReport(value)
  return value
}

export function percentile(sortedValues: readonly number[], percentileValue: number): number {
  if (sortedValues.length === 0) {
    throw new Error('cannot calculate a percentile for an empty series')
  }
  if (percentileValue < 0 || percentileValue > 1) {
    throw new Error('percentile must be between 0 and 1')
  }
  const position = percentileValue * (sortedValues.length - 1)
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.ceil(position)
  const weight = position - lowerIndex
  const lower = sortedValues[lowerIndex]
  const upper = sortedValues[upperIndex]
  if (lower === undefined || upper === undefined) {
    throw new Error('percentile index is out of range')
  }
  return lower + (upper - lower) * weight
}

export interface MetricStatistics {
  min: number
  p50: number
  p95: number
  p99: number
  max: number
  count: number
}

export function calculateStatistics(series: MetricSeries): MetricStatistics {
  validateMetricSeries(series, 'metric')
  const sorted = [...series.samples].sort((left, right) => left - right)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  if (first === undefined || last === undefined) {
    throw new Error('metric series must not be empty')
  }
  return {
    min: first,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: last,
    count: sorted.length,
  }
}

function satisfies(actual: number, operator: Operator, limit: number): boolean {
  switch (operator) {
    case 'lt':
      return actual < limit
    case 'lte':
      return actual <= limit
    case 'eq':
      return actual === limit
    case 'gte':
      return actual >= limit
    case 'gt':
      return actual > limit
  }
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(4)
}

function evaluateDegradation(
  report: PerformanceGateReport,
  degradation: DegradationConfig,
  options: EvaluatePerformanceGateOptions | undefined,
  minimumSamples: number,
  failures: GateFailure[],
): void {
  const baseline = options?.baseline
  if (baseline === undefined) {
    failures.push({
      code: 'baseline-missing',
      detail: 'degradation gates require a P0 baseline report',
    })
    return
  }

  try {
    validatePerformanceGateReport(baseline)
  } catch (error) {
    failures.push({
      code: 'baseline-invalid',
      detail: error instanceof Error ? error.message : String(error),
    })
    return
  }

  for (const degradationMetric of degradation.metrics) {
    const currentSeries = report.metrics[degradationMetric.metric]
    if (currentSeries === undefined) {
      failures.push({
        code: 'metric-missing',
        metric: degradationMetric.metric,
        detail: 'degradation metric is missing from current report',
      })
      continue
    }
    const baselineSeries = baseline.metrics[degradationMetric.metric]
    if (baselineSeries === undefined) {
      failures.push({
        code: 'baseline-metric-missing',
        metric: degradationMetric.metric,
        detail: 'degradation metric is missing from baseline report',
      })
      continue
    }
    if (currentSeries.unit !== baselineSeries.unit) {
      failures.push({
        code: 'baseline-unit-mismatch',
        metric: degradationMetric.metric,
        detail: 'current and baseline metric units differ',
      })
      continue
    }
    if (currentSeries.samples.length < minimumSamples) {
      failures.push({
        code: 'insufficient-samples',
        metric: degradationMetric.metric,
        detail:
          'current degradation metric has ' +
          currentSeries.samples.length +
          ' samples; requires at least ' +
          minimumSamples,
      })
      continue
    }
    if (baselineSeries.samples.length < minimumSamples) {
      failures.push({
        code: 'baseline-insufficient-samples',
        metric: degradationMetric.metric,
        detail:
          'baseline degradation metric has ' +
          baselineSeries.samples.length +
          ' samples; requires at least ' +
          minimumSamples,
      })
      continue
    }

    const currentValue = calculateStatistics(currentSeries)[degradationMetric.statistic]
    const baselineValue = calculateStatistics(baselineSeries)[degradationMetric.statistic]
    if (baselineValue <= 0) {
      failures.push({
        code: 'degradation-failed',
        metric: degradationMetric.metric,
        detail: 'baseline degradation metric must be greater than zero',
      })
      continue
    }
    const relativeIncrease = (currentValue - baselineValue) / baselineValue
    if (relativeIncrease > degradation.maxRelativeIncrease) {
      failures.push({
        code: 'degradation-failed',
        metric: degradationMetric.metric,
        detail:
          'relative increase ' +
          formatNumber(relativeIncrease * 100) +
          '% exceeds ' +
          formatNumber(degradation.maxRelativeIncrease * 100) +
          '%',
      })
    }
  }
}

export function evaluatePerformanceGate(
  report: PerformanceGateReport,
  config: PerformanceGateConfig,
  options?: EvaluatePerformanceGateOptions,
): PerformanceGateEvaluation {
  try {
    validatePerformanceGateReport(report)
    validatePerformanceGateConfig(config)
  } catch (error) {
    return {
      passed: false,
      level: isRecord(report) && isGateLevel(report.level) ? report.level : 'P0',
      failures: [
        {
          code: 'invalid-report',
          detail: error instanceof Error ? error.message : String(error),
        },
      ],
      observed: {},
    }
  }

  const levelConfig = config.levels[report.level]
  const failures: GateFailure[] = []
  const observed: Record<string, number> = {}

  for (const gate of levelConfig.gates) {
    const metric = report.metrics[gate.metric]
    if (metric === undefined) {
      failures.push({
        code: 'metric-missing',
        gateId: gate.id,
        metric: gate.metric,
        detail: 'required metric is missing',
      })
      continue
    }
    if (metric.unit !== gate.unit) {
      failures.push({
        code: 'unit-mismatch',
        gateId: gate.id,
        metric: gate.metric,
        detail: 'expected unit ' + gate.unit + ' but received ' + metric.unit,
      })
      continue
    }
    const requiredSamples = Math.max(config.minimumSamples, gate.minSamples ?? 0)
    if (metric.samples.length < requiredSamples) {
      failures.push({
        code: 'insufficient-samples',
        gateId: gate.id,
        metric: gate.metric,
        detail:
          'received ' +
          metric.samples.length +
          ' samples; requires at least ' +
          requiredSamples,
      })
      continue
    }
    const actual = calculateStatistics(metric)[gate.statistic]
    observed[gate.id] = actual
    if (!satisfies(actual, gate.operator, gate.limit)) {
      failures.push({
        code: 'threshold-failed',
        gateId: gate.id,
        metric: gate.metric,
        detail:
          'observed ' +
          gate.statistic +
          '=' +
          formatNumber(actual) +
          ' does not satisfy ' +
          gate.operator +
          ' ' +
          formatNumber(gate.limit),
      })
    }
  }

  if (levelConfig.degradation !== undefined) {
    evaluateDegradation(
      report,
      levelConfig.degradation,
      options,
      config.minimumSamples,
      failures,
    )
  }

  return {
    passed: failures.length === 0,
    level: report.level,
    failures,
    observed,
  }
}
