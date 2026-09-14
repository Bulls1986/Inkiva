import {
  REFERENCE_ENVIRONMENT,
  type PerformanceGateEnvironment
} from './contract.js'

const MIN_REFERENCE_MEMORY_BYTES = 8 * 1024 ** 3
const MIN_REFERENCE_CPU_CORES = 4
const MIN_REFERENCE_REFRESH_RATE_HZ = 60

export interface ReferenceEnvironmentObservation {
  os: string
  cpuCores: number
  memoryBytes: number
  diskKind: 'SATA SSD' | 'entry NVMe' | 'unsupported'
  integratedGpu: boolean
  displayWidth: number
  displayHeight: number
  refreshRateHz: number
  powerMode: string
  networkMode: 'offline' | 'online'
  runner: string
}

const fail = (detail: string): never => {
  throw new Error('reference environment ' + detail)
}

export const canonicalizeReferenceEnvironment = (
  observation: ReferenceEnvironmentObservation
): PerformanceGateEnvironment => {
  if (!/^.{0,200}windows\s+11/i.test(observation.os)) {
    fail('must run on Windows 11')
  }
  if (
    !Number.isInteger(observation.cpuCores) ||
    observation.cpuCores < MIN_REFERENCE_CPU_CORES
  ) {
    fail('requires at least four CPU cores')
  }
  if (
    !Number.isFinite(observation.memoryBytes) ||
    observation.memoryBytes < MIN_REFERENCE_MEMORY_BYTES
  ) {
    fail('requires at least 8 GB of memory')
  }
  if (observation.diskKind !== 'SATA SSD' && observation.diskKind !== 'entry NVMe') {
    fail('requires a SATA SSD or entry NVMe disk')
  }
  if (!observation.integratedGpu) {
    fail('requires an integrated GPU')
  }
  if (
    observation.displayWidth !== 1920 ||
    observation.displayHeight !== 1080 ||
    !Number.isFinite(observation.refreshRateHz) ||
    observation.refreshRateHz < MIN_REFERENCE_REFRESH_RATE_HZ
  ) {
    fail('requires a 1920x1080 display at 60Hz or higher')
  }
  if (observation.powerMode !== 'Balanced') {
    fail('requires Balanced power mode')
  }
  if (observation.networkMode !== 'offline') {
    fail('requires offline test mode')
  }
  if (observation.runner !== 'reference-low-end') {
    fail('requires the reference-low-end runner label')
  }
  return {
    ...REFERENCE_ENVIRONMENT,
    disk: observation.diskKind
  }
}
