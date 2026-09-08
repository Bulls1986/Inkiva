import { expect, test } from '@playwright/test'
import type { ElectronApplication } from 'playwright'
import {
  clickMenuById,
  getMessageBoxCalls,
  installMessageBoxCapture,
  launchElectron,
  waitForMenuReady
} from './helpers'

const stableUpdateEnv = {
  INKIVA_E2E_UPDATE_PLATFORM: 'win32',
  INKIVA_E2E_UPDATE_CURRENT_VERSION: '1.0.0',
  // Keep the background check out of the manual-dialog tests so the assertion
  // is specifically about the requested source.
  INKIVA_E2E_UPDATE_BACKGROUND_DELAY_MS: '60000'
}

const noReleaseScenarios = [
  ['no formal release', 'no-release'],
  ['prerelease-only release', 'prerelease-only'],
  ['draft-only release', 'draft-only'],
  ['malformed release metadata', 'malformed-release']
] as const

const failedCheckScenarios = [
  ['network failure', 'network-error', 'network unavailable'],
  ['missing update artifact', 'missing-artifact', 'latest.yml is missing']
] as const

const getUpdateStatuses = async(app: ElectronApplication) => app.evaluate(() => {
  const globalState = global as unknown as {
    __inkiva_e2e_update_statuses__?: Array<{ state: string }>
  }
  return (globalState.__inkiva_e2e_update_statuses__ ?? []).slice()
})

const getProviderState = async(app: ElectronApplication) => app.evaluate(() => {
  const globalState = global as unknown as {
    __inkiva_e2e_update__?: { checkCalls: number; installCalls: number }
  }
  return globalState.__inkiva_e2e_update__ ?? { checkCalls: 0, installCalls: 0 }
})

for (const [label, scenario] of noReleaseScenarios) {
  test(`manual check treats ${label} as up-to-date`, async() => {
    const { app } = await launchElectron([], {
      env: { ...stableUpdateEnv, INKIVA_E2E_UPDATE_SCENARIO: scenario }
    })

    try {
      await waitForMenuReady(app)
      await installMessageBoxCapture(app)
      await clickMenuById(app, 'checkForUpdatesMenuItem')

      await expect.poll(async() =>
        (await getUpdateStatuses(app)).some(({ state }) => state === 'up-to-date')
      ).toBe(true)
      await expect.poll(async() =>
        (await getMessageBoxCalls(app)).at(-1)?.message ?? ''
      ).toMatch(/最新|up to date/i)

      expect((await getMessageBoxCalls(app)).at(-1)?.detail).toBeUndefined()
      expect(await getProviderState(app)).toEqual({ checkCalls: 1, installCalls: 0 })
    } finally {
      await app.close()
    }
  })
}

for (const [label, scenario, detail] of failedCheckScenarios) {
  test(`manual check surfaces ${label}`, async() => {
    const { app } = await launchElectron([], {
      env: { ...stableUpdateEnv, INKIVA_E2E_UPDATE_SCENARIO: scenario }
    })

    try {
      await waitForMenuReady(app)
      await installMessageBoxCapture(app)
      await clickMenuById(app, 'checkForUpdatesMenuItem')

      await expect.poll(async() =>
        (await getUpdateStatuses(app)).some(({ state }) => state === 'error')
      ).toBe(true)
      await expect.poll(async() =>
        (await getMessageBoxCalls(app)).at(-1)?.message ?? ''
      ).toMatch(/无法检查更新|Unable to check for updates/i)

      const messageBox = (await getMessageBoxCalls(app)).at(-1)
      expect(messageBox?.detail).toContain(detail)
      expect(await getProviderState(app)).toEqual({ checkCalls: 1, installCalls: 0 })
    } finally {
      await app.close()
    }
  })
}

test('background check with no formal release is silent and successful', async() => {
  const { app } = await launchElectron([], {
    env: {
      ...stableUpdateEnv,
      INKIVA_E2E_UPDATE_SCENARIO: 'no-release',
      INKIVA_E2E_UPDATE_BACKGROUND_DELAY_MS: '50'
    }
  })

  try {
    await waitForMenuReady(app)
    await expect.poll(async() =>
      (await getUpdateStatuses(app)).some(({ state }) => state === 'up-to-date')
    ).toBe(true)
    expect(await getMessageBoxCalls(app)).toEqual([])
    expect(await getProviderState(app)).toEqual({ checkCalls: 1, installCalls: 0 })
  } finally {
    await app.close()
  }
})
