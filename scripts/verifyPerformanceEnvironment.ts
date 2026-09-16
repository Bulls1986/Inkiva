import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import * as os from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  canonicalizeReferenceEnvironment,
  type ReferenceEnvironmentObservation
} from '../perf/gate/reference-environment.js'

const POWERSHELL_PROBE = [
  '$os = Get-CimInstance Win32_OperatingSystem | Select-Object -ExpandProperty Caption',
  '$disk = Get-PhysicalDisk | Select-Object -First 1',
  '$video = Get-CimInstance Win32_VideoController | Select-Object -First 1',
  '$plan = Get-CimInstance -Namespace root/cimv2/power -ClassName Win32_PowerPlan | Where-Object IsActive | Select-Object -First 1',
  '$name = [string]$video.Name',
  '$integrated = $name -match "(?i)intel.*(UHD|HD|Iris)|amd.*(Radeon Graphics|Vega)|Microsoft Basic Display"',
  '$diskKind = if ([string]$disk.BusType -match "(?i)SATA") { "SATA SSD" } elseif ([string]$disk.BusType -match "(?i)NVMe") { "entry NVMe" } else { "unsupported" }',
  '[pscustomobject]@{ os = $os; diskKind = $diskKind; integratedGpu = $integrated; displayWidth = $video.CurrentHorizontalResolution; displayHeight = $video.CurrentVerticalResolution; refreshRateHz = $video.CurrentRefreshRate; powerMode = $plan.ElementName } | ConvertTo-Json -Compress'
].join('; ')

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const runPowerShellProbe = (): Record<string, unknown> => {
  let output: string
  try {
    output = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', POWERSHELL_PROBE],
      { encoding: 'utf8', timeout: 10_000 }
    ).trim()
  } catch (error) {
    throw new Error(
      'reference environment probe failed: ' +
        (error instanceof Error ? error.message : String(error))
    )
  }
  if (output === '') throw new Error('reference environment probe returned no data')
  let value: unknown
  try {
    value = JSON.parse(output) as unknown
  } catch (error) {
    throw new Error(
      'reference environment probe returned invalid JSON: ' +
        (error instanceof Error ? error.message : String(error))
    )
  }
  if (!isRecord(value)) throw new Error('reference environment probe returned an invalid object')
  return value
}

const asNumber = (value: unknown, label: string): number => {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) {
    throw new Error('reference environment probe returned invalid ' + label)
  }
  return numeric
}

export const normalizeDiskKind = (
  value: unknown
): ReferenceEnvironmentObservation['diskKind'] => {
  if (value === 'SATA SSD' || value === 'entry NVMe') return value
  return 'unsupported'
}

export const readReferenceEnvironmentObservation = (): ReferenceEnvironmentObservation => {
  if (process.platform !== 'win32') {
    throw new Error('reference environment requires a Windows runner')
  }

  const system = runPowerShellProbe()
  const networkMode = process.env.INKIVA_PERF_OFFLINE === 'true' ? 'offline' : 'online'
  const runner = process.env.INKIVA_PERF_RUNNER_LABEL ?? ''
  return {
    os: typeof system.os === 'string' ? system.os : '',
    cpuCores: os.cpus().length,
    memoryBytes: os.totalmem(),
    diskKind: normalizeDiskKind(system.diskKind),
    integratedGpu: system.integratedGpu === true,
    displayWidth: asNumber(system.displayWidth, 'display width'),
    displayHeight: asNumber(system.displayHeight, 'display height'),
    refreshRateHz: asNumber(system.refreshRateHz, 'refresh rate'),
    powerMode: typeof system.powerMode === 'string' ? system.powerMode : '',
    networkMode,
    runner
  }
}

export const verifyPerformanceEnvironment = (): Record<string, string> =>
  canonicalizeReferenceEnvironment(readReferenceEnvironmentObservation())

const readArgument = (
  args: string[],
  name: string,
  required: boolean
): string | undefined => {
  const index = args.indexOf(name)
  const value = args[index + 1]
  if (index < 0) {
    if (required) throw new Error('usage: verifyPerformanceEnvironment.ts --output <environment.json>')
    return undefined
  }
  if (value === undefined || value.trim() === '') {
    throw new Error('usage: verifyPerformanceEnvironment.ts --output <environment.json>')
  }
  return resolve(value)
}

const writeJson = (path: string, value: unknown): void => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8')
}

const isMainModule =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMainModule) {
  try {
    const args = process.argv.slice(2)
    const outputPath = readArgument(args, '--output', true) as string
    const observationOutputPath = readArgument(args, '--observation-output', false)
    const observation = readReferenceEnvironmentObservation()
    if (observationOutputPath !== undefined) writeJson(observationOutputPath, observation)
    writeJson(outputPath, canonicalizeReferenceEnvironment(observation))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export type { ReferenceEnvironmentObservation }
