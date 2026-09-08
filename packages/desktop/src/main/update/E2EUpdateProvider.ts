import type { ReleaseCandidate, UpdateCheckResult, UpdateProvider } from './types'

export const E2E_UPDATE_SCENARIOS = [
  'no-release',
  'prerelease-only',
  'draft-only',
  'malformed-release',
  'network-error',
  'missing-artifact'
] as const

export type E2EUpdateScenario = typeof E2E_UPDATE_SCENARIOS[number]

export const isE2EUpdateScenario = (value: string | undefined): value is E2EUpdateScenario =>
  E2E_UPDATE_SCENARIOS.includes(value as E2EUpdateScenario)

interface E2EUpdateState {
  checkCalls: number
  installCalls: number
}

const getE2EUpdateState = (): E2EUpdateState => {
  const globalState = globalThis as typeof globalThis & {
    __inkiva_e2e_update__?: E2EUpdateState
  }
  return (globalState.__inkiva_e2e_update__ ??= { checkCalls: 0, installCalls: 0 })
}

const candidate = (tagName: string, extra: Partial<ReleaseCandidate> = {}): ReleaseCandidate => ({
  tagName,
  draft: false,
  prerelease: false,
  ...extra
})

/**
 * Deterministic provider used only when the desktop E2E suite opts in via
 * INKIVA_E2E_UPDATE_SCENARIO. It never contacts GitHub and never installs an
 * update; the scenarios exercise the application/update-manager boundary.
 */
export class E2EUpdateProvider implements UpdateProvider {
  readonly autoDownload = false

  constructor(private readonly _scenario: E2EUpdateScenario) {}

  async checkForUpdates(): Promise<UpdateCheckResult> {
    getE2EUpdateState().checkCalls += 1

    switch (this._scenario) {
      case 'network-error':
        throw Object.assign(new Error('network unavailable'), { code: 'ERR_NETWORK' })
      case 'missing-artifact':
        throw Object.assign(new Error('latest.yml is missing'), {
          code: 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND'
        })
      case 'prerelease-only':
        return { candidates: [candidate('v1.1.0-beta.1', { prerelease: true })] }
      case 'draft-only':
        return { candidates: [candidate('v1.1.0', { draft: true })] }
      case 'malformed-release':
        return { candidates: [candidate('not-a-semver')] }
      case 'no-release':
      default:
        return { candidates: [] }
    }
  }

  quitAndInstall(): void {
    getE2EUpdateState().installCalls += 1
  }
}
