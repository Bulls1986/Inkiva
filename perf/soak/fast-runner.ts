import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

import { evaluatePerformanceGateInput } from '../gate/evaluate.js'
import {
  parsePerformanceGateConfig,
  type PerformanceGateEvaluation,
  type MetricUnit,
  type PerformanceGateReport
} from '../gate/contract.js'
import {
  createPerformanceGateReport,
  PerformanceSampleCollector,
  writePerformanceGateReport,
  type PerformanceGateReportMetadata
} from '../gate/runner.js'
import { mergePerformanceTraceReports } from '../gate/trace-input.js'
import {
  FAST_GATE_MODE,
  FAST_GATE_REQUIRED_METRICS,
  resolveFastGateMode,
  type FastGateEnvironment
} from './fast-policy.js'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const thresholdsPath = resolve(currentDirectory, 'thresholds-fast.json')
const fastThresholds = parsePerformanceGateConfig(
  JSON.parse(readFileSync(thresholdsPath, 'utf8')) as unknown
)
const requiredMetricSet = new Set<string>(FAST_GATE_REQUIRED_METRICS)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const isMetricUnit = (value: unknown): value is MetricUnit =>
  value === 'ms' || value === 'count' || value === 'bytes' || value === 'ratio'

const isFiniteNonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

/**
 * Collect only the fast gate's declared metric families. Unknown event kinds
 * are ignored, while malformed metric samples are rejected so an unsupported
 * or broken capture cannot silently turn into a passing result.
 */
export const collectFastPerformanceReportSamples = (
  report: unknown,
  collector: PerformanceSampleCollector
): void => {
  if (!isRecord(report) || !Array.isArray(report.traces)) {
    throw new Error('fast performance report traces must be an array')
  }

  for (const [traceIndex, trace] of report.traces.entries()) {
    if (!isRecord(trace) || !Array.isArray(trace.events)) {
      throw new Error('fast performance trace ' + traceIndex + '.events must be an array')
    }

    for (const event of trace.events) {
      if (!isRecord(event) || event.name !== 'metric_sample') continue
      if (!isRecord(event.metadata)) {
        throw new Error('metric_sample metadata must be an object')
      }

      const metric = event.metadata.metric
      const unit = event.metadata.unit
      const value = event.metadata.value
      if (typeof metric !== 'string' || metric.trim() === '') {
        throw new Error('metric_sample metric must be a non-empty string')
      }
      if (!isMetricUnit(unit)) {
        throw new Error('metric_sample unit is invalid')
      }
      if (!isFiniteNonNegative(value)) {
        throw new Error('metric_sample value must be finite and non-negative')
      }
      if (requiredMetricSet.has(metric)) {
        collector.add(metric, unit, value)
      }
    }
  }
}

export const createFastPerformanceGateReport = (
  input: unknown,
  metadata: PerformanceGateReportMetadata
): PerformanceGateReport => {
  const collector = new PerformanceSampleCollector()
  collectFastPerformanceReportSamples(input, collector)
  return createPerformanceGateReport(collector, metadata)
}

export const evaluateFastPerformanceGate = (report: unknown): PerformanceGateEvaluation =>
  evaluatePerformanceGateInput(report, fastThresholds)

const readJson = (filePath: string): unknown => {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as unknown
  } catch (error) {
    throw new Error(
      'could not read JSON from ' +
        filePath +
        ': ' +
        (error instanceof Error ? error.message : String(error))
    )
  }
}

const readTraceDirectory = (inputPath: string): unknown => {
  const entries = readdirSync(inputPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .filter((entry) => !entry.name.endsWith('.raw.json'))
    .filter((entry) => !entry.name.includes('evaluation'))
    .filter((entry) => !entry.name.includes('report'))
    .map((entry) => join(inputPath, entry.name))
    .sort()

  if (entries.length === 0) {
    throw new Error('fast performance capture produced no trace reports')
  }
  return mergePerformanceTraceReports(entries.map((filePath) => readJson(filePath)))
}

const readTraceInput = (inputPath: string): unknown => {
  const resolvedPath = resolve(inputPath)
  const stat = statSync(resolvedPath)
  return stat.isDirectory() ? readTraceDirectory(resolvedPath) : readJson(resolvedPath)
}

const createFastMetadata = (environment: FastGateEnvironment): PerformanceGateReportMetadata => {
  resolveFastGateMode(environment)
  return {
    productVersion: '0.3.0',
    suite: 'inkiva-desktop-fast-pr-smoke',
    level: 'P0',
    environment: {
      os: process.platform,
      cpu: process.arch,
      memory: Math.round(os.totalmem() / (1024 * 1024 * 1024)) + ' GB CI host',
      disk: 'CI workspace',
      gpu: 'CI virtual display',
      display: 'CI virtual display',
      power: 'CI',
      network: 'offline',
      runner: environment.INKIVA_PERF_RUNNER_LABEL?.trim() || FAST_GATE_MODE
    }
  }
}

interface CliOptions {
  inputPath: string
  thresholdsPath?: string
  outputPath: string
  reportOutputPath: string
}

const parseArgs = (args: string[]): CliOptions => {
  const options: Partial<CliOptions> = {}
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    const value = args[index + 1]
    if (argument === '--input' && value) options.inputPath = value
    else if (argument === '--thresholds' && value) options.thresholdsPath = value
    else if (argument === '--output' && value) options.outputPath = value
    else if (argument === '--report-output' && value) options.reportOutputPath = value
    else throw new Error('unknown or incomplete argument: ' + argument)
    index += 1
  }
  if (!options.inputPath || !options.outputPath || !options.reportOutputPath) {
    throw new Error(
      'usage: fast-runner.ts --input <trace-directory> --thresholds <thresholds-fast.json> --output <evaluation.json> --report-output <report.json>'
    )
  }
  return options as CliOptions
}

export const runFastPerformanceGateCli = (
  args: string[],
  environment: FastGateEnvironment = process.env as FastGateEnvironment
): PerformanceGateEvaluation => {
  const options = parseArgs(args)
  if (options.thresholdsPath !== undefined && resolve(options.thresholdsPath) !== thresholdsPath) {
    throw new Error('only thresholds-fast.json may be used by the fast performance gate')
  }
  const input = readTraceInput(options.inputPath)
  const report = createFastPerformanceGateReport(input, createFastMetadata(environment))
  writePerformanceGateReport(options.reportOutputPath, report)
  const result = evaluateFastPerformanceGate(report)
  mkdirSync(dirname(options.outputPath), { recursive: true })
  writeFileSync(options.outputPath, JSON.stringify(result, null, 2) + '\n', 'utf8')
  for (const failure of result.failures) {
    console.error(
      '::error title=Fast performance gate failed::' + failure.code + ': ' + failure.detail
    )
  }
  return result
}

const isMainModule =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMainModule) {
  try {
    const result = runFastPerformanceGateCli(process.argv.slice(2))
    if (!result.passed) process.exitCode = 1
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
