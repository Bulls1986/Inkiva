import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { getLargeGateShards, mergeLargeGateShardReports } from '../perf/gate/large-shards.js'
import type { LargeGateLevel } from '../perf/gate/large-scenarios.js'

const readValue = (args: string[], flag: string): string => {
  const index = args.indexOf(flag)
  const value = args[index + 1]
  if (index < 0 || value === undefined || value.trim() === '') {
    throw new Error('missing ' + flag)
  }
  return value
}

const main = (): void => {
  const args = process.argv.slice(2)
  const level = readValue(args, '--level') as LargeGateLevel
  if (level !== 'P1' && level !== 'P2') {
    throw new Error('--level must be P1 or P2')
  }
  const inputRoot = resolve(readValue(args, '--input-root'))
  const outputPath = resolve(readValue(args, '--output'))
  const reports = getLargeGateShards(level).map((shard) => {
    const artifact = 'perf-large-' + level + '-' + shard
    const filePath = join(inputRoot, artifact, level + '.raw.json')
    try {
      return JSON.parse(readFileSync(filePath, 'utf8')) as unknown
    } catch (error) {
      throw new Error(
        'required large-gate shard artifact is missing or invalid: ' +
          artifact +
          ' (' +
          (error instanceof Error ? error.message : String(error)) +
          ')'
      )
    }
  })

  // Detect unexpected empty download roots early; the exact shard lookup above
  // remains authoritative and fail-closed for missing artifacts.
  if (readdirSync(inputRoot).length === 0) {
    throw new Error('large-gate shard artifact root is empty')
  }

  const merged = mergeLargeGateShardReports(reports, level)
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, JSON.stringify(merged, null, 2) + '\n', 'utf8')
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
