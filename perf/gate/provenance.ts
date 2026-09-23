import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { PerformanceGateProvenance } from './contract.js'

export interface BenchmarkProvenanceOptions {
  repoRoot: string
  runMode: string
  warmState: string
  environment?: NodeJS.ProcessEnv
  fixtureHashes?: Record<string, string>
}

const readGit = (repoRoot: string, args: string[]): string =>
  execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 5_000,
    windowsHide: true
  }).trim()

const readElectronVersion = (
  repoRoot: string,
  environment: NodeJS.ProcessEnv
): string => {
  const injected = environment.INKIVA_PERF_ELECTRON_VERSION?.trim()
  if (injected) return injected
  const packagePath = resolve(repoRoot, 'node_modules/electron/package.json')
  const value = JSON.parse(readFileSync(packagePath, 'utf8')) as { version?: unknown }
  if (typeof value.version !== 'string' || value.version.trim() === '') {
    throw new Error('installed Electron package version is unavailable')
  }
  return value.version
}

export const readBenchmarkProvenance = (
  options: BenchmarkProvenanceOptions
): PerformanceGateProvenance => {
  const repoRoot = resolve(options.repoRoot)
  const environment = options.environment ?? process.env
  const commit = environment.GITHUB_SHA?.trim() || readGit(repoRoot, ['rev-parse', 'HEAD'])
  const detectedBranch =
    environment.GITHUB_HEAD_REF?.trim() ||
    environment.GITHUB_REF_NAME?.trim() ||
    readGit(repoRoot, ['branch', '--show-current'])
  const branch = detectedBranch === '' ? 'detached' : detectedBranch
  const graphicsBackend = environment.INKIVA_PERF_GRAPHICS_BACKEND?.trim() || 'default'
  const runId = environment.GITHUB_RUN_ID?.trim() || 'local'

  return {
    commit,
    branch,
    nodeVersion: process.version,
    electronVersion: readElectronVersion(repoRoot, environment),
    graphicsBackend,
    runMode: options.runMode,
    warmState: options.warmState,
    runId,
    ...(options.fixtureHashes === undefined ? {} : { fixtureHashes: options.fixtureHashes })
  }
}
