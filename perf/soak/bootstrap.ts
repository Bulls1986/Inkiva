import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MINIMUM_MUYA_PERF_SAMPLES } from './collect'
import { validateSoakReport, type SoakReport } from './compare'

export const bootstrapSoakBaseline = (
  currentValue: unknown,
  outputPath: string
): SoakReport => {
  const report = validateSoakReport(currentValue)
  if (report.metrics.length === 0) {
    throw new Error('baseline report must contain at least one metric')
  }
  if (report.suite === 'muya') {
    const sampleCount = Number(report.environment?.sampleCount)
    if (!Number.isInteger(sampleCount) || sampleCount < MINIMUM_MUYA_PERF_SAMPLES) {
      throw new Error(
        'Muya baseline requires at least ' + MINIMUM_MUYA_PERF_SAMPLES + ' samples'
      )
    }
  }
  if (existsSync(outputPath)) {
    throw new Error('refusing to overwrite existing baseline: ' + outputPath)
  }

  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8')
  return report
}

interface CliOptions {
  currentPath: string
  outputPath: string
}

const readJson = (filePath: string): unknown => {
  return JSON.parse(readFileSync(filePath, 'utf8')) as unknown
}

const parseArgs = (args: string[]): CliOptions => {
  const options: Partial<CliOptions> = {}
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const value = args[index + 1]
    if (arg === '--current' && value) options.currentPath = value
    else if (arg === '--output' && value) options.outputPath = value
    else throw new Error('unknown or incomplete argument: ' + arg)
    index += 1
  }

  if (!options.currentPath || !options.outputPath) {
    throw new Error('usage: bootstrap.ts --current <path> --output <path>')
  }
  return options as CliOptions
}

const isMainModule =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMainModule) {
  try {
    const options = parseArgs(process.argv.slice(2))
    const current = readJson(options.currentPath)
    const report = bootstrapSoakBaseline(current, options.outputPath)
    console.log('Bootstrapped ' + report.suite + ' performance baseline.')
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
