import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  GATE_LEVELS,
  evaluatePerformanceGate,
  parsePerformanceGateConfig,
  parsePerformanceGateReport,
  type GateLevel,
  type GateFailure,
  type PerformanceGateConfig,
  type PerformanceGateEnvironment,
  type PerformanceGateEvaluation,
  type PerformanceGateReport
} from './contract.js'
import { collectPerformanceReportSamples } from './performance-report.js'
import {
  createPerformanceGateReport,
  type PerformanceGateReportMetadata,
  PerformanceSampleCollector
} from './runner.js'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const levelFrom = (value: unknown): GateLevel =>
  isRecord(value) && typeof value.level === 'string' && GATE_LEVELS.includes(value.level as GateLevel)
    ? value.level as GateLevel
    : 'P0'

const failure = (
  code: GateFailure['code'],
  detail: string,
  level: GateLevel
): PerformanceGateEvaluation => ({
  passed: false,
  level,
  failures: [{ code, detail }],
  observed: {}
})

export const evaluatePerformanceGateInput = (
  reportValue: unknown,
  configValue: unknown,
  baselineValue?: unknown
): PerformanceGateEvaluation => {
  let config: PerformanceGateConfig
  try {
    config = parsePerformanceGateConfig(configValue)
  } catch (error) {
    return failure(
      'invalid-config',
      error instanceof Error ? error.message : String(error),
      levelFrom(reportValue)
    )
  }

  let report: PerformanceGateReport
  try {
    report = parsePerformanceGateReport(reportValue)
  } catch (error) {
    return failure(
      'invalid-report',
      error instanceof Error ? error.message : String(error),
      levelFrom(reportValue)
    )
  }

  let baseline: PerformanceGateReport | undefined
  if (baselineValue !== undefined) {
    try {
      baseline = parsePerformanceGateReport(baselineValue)
    } catch (error) {
      return failure(
        'baseline-invalid',
        error instanceof Error ? error.message : String(error),
        report.level
      )
    }
  }

  return evaluatePerformanceGate(report, config, baseline === undefined ? undefined : { baseline })
}

export const createPerformanceGateReportFromTrace = (
  input: unknown,
  metadata: PerformanceGateReportMetadata
): PerformanceGateReport => {
  const collector = new PerformanceSampleCollector()
  collectPerformanceReportSamples(input, collector)
  return createPerformanceGateReport(collector, metadata)
}

interface CliOptions {
  inputPath: string
  thresholdsPath: string
  outputPath: string
  baselinePath?: string
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
    const argument = args[index]
    const value = args[index + 1]
    if (argument === '--input' && value) options.inputPath = value
    else if (argument === '--thresholds' && value) options.thresholdsPath = value
    else if (argument === '--output' && value) options.outputPath = value
    else if (argument === '--baseline' && value) options.baselinePath = value
    else throw new Error(`unknown or incomplete argument: ${argument}`)
    index += 1
  }
  if (!options.inputPath || !options.thresholdsPath || !options.outputPath) {
    throw new Error(
      'usage: evaluate.ts --input <gate-report.json> --thresholds <thresholds.json> --output <evaluation.json> [--baseline <report.json>]'
    )
  }
  return options as CliOptions
}

export const runPerformanceGateCli = (args: string[]): PerformanceGateEvaluation => {
  const options = parseArgs(args)
  const result = evaluatePerformanceGateInput(
    readJson(options.inputPath),
    readJson(options.thresholdsPath),
    options.baselinePath === undefined ? undefined : readJson(options.baselinePath)
  )
  writeFileSync(options.outputPath, JSON.stringify(result, null, 2) + '\\n', 'utf8')
  for (const item of result.failures) {
    console.error(
      '::error title=Performance gate failed::' + item.code + ': ' + item.detail
    )
  }
  return result
}

const isMainModule =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMainModule) {
  try {
    const result = runPerformanceGateCli(process.argv.slice(2))
    if (!result.passed) process.exitCode = 1
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
