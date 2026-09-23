import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  GATE_LEVELS,
  type GateLevel
} from '../perf/gate/contract.js'
import { createPerformanceGateMetadata } from '../perf/gate/metadata.js'
import { readBenchmarkProvenance } from '../perf/gate/provenance.js'

const readValue = (args: string[], flag: string): string => {
  const index = args.indexOf(flag)
  const value = args[index + 1]
  if (index < 0 || value === undefined || value.trim() === '') {
    throw new Error('missing ' + flag)
  }
  return value
}

const readEnvironment = (filePath: string): unknown => {
  const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as unknown
  if (
    parsed !== null &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    'environment' in parsed
  ) {
    return (parsed as { environment: unknown }).environment
  }
  return parsed
}

const readPackageVersion = (): string => {
  const packagePath = resolve(dirname(fileURLToPath(import.meta.url)), '../package.json')
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as { version?: unknown }
  if (typeof packageJson.version !== 'string' || packageJson.version.trim() === '') {
    throw new Error('package.json version is missing')
  }
  return packageJson.version
}

const main = (): void => {
  const args = process.argv.slice(2)
  const environmentPath = resolve(readValue(args, '--environment'))
  const level = readValue(args, '--level')
  if (!GATE_LEVELS.includes(level as GateLevel)) {
    throw new Error('--level must be one of ' + GATE_LEVELS.join(', '))
  }
  const outputPath = resolve(readValue(args, '--output'))
  const metadata = createPerformanceGateMetadata(
    readEnvironment(environmentPath),
    level as GateLevel,
    readPackageVersion(),
    'inkiva-reference-gate',
    readBenchmarkProvenance({
      repoRoot: resolve(dirname(fileURLToPath(import.meta.url)), '..'),
      runMode: 'reference-' + level.toLowerCase(),
      warmState: 'mixed'
    })
  )
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, JSON.stringify(metadata, null, 2) + '\n', 'utf8')
}

const isMainModule =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMainModule) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
