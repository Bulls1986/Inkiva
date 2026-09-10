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
  // Keep the background check out of the manual-check tests so the assertion
  // is specifically about the requested source.
  INKIVA_E2E_UPDATE_BACKGROUND_DELAY_MS: '60000'
}

const noReleaseScenarios = [
  ['no formal release', 'no-release'],
  ['prerelease-only release', 'prerelease-only'],
  ['draft-only release', 'draft-only'],
  ['malformed release metadata', 'malformed-release'],
  ['missing update artifact', 'missing-artifact']
] as const

const failedCheckScenarios = [
  ['network failure', 'network-error', 'network unavailable']
] as const

const getUpdateStatuses = async(app: ElectronApplication) =>
  app.evaluate(() => {
    const globalState = global as unknown as {
      __inkiva_e2e_update_statuses__?: Array<{ state: string }>
    }
    return (globalState.__inkiva_e2e_update_statuses__ ?? []).slice()
  })

const getProviderState = async(app: ElectronApplication) =>
  app.evaluate(() => {
    const globalState = global as unknown as {
      __inkiva_e2e_update__?: { checkCalls: number; downloadCalls: number; installCalls: number }
    }
    return globalState.__inkiva_e2e_update__ ?? { checkCalls: 0, downloadCalls: 0, installCalls: 0 }
  })

for (const [label, scenario] of noReleaseScenarios) {
  test(`manual check treats ${label} as up-to-date`, async() => {
    const { app, page } = await launchElectron([], {
      env: { ...stableUpdateEnv, INKIVA_E2E_UPDATE_SCENARIO: scenario }
    })

    try {
      await waitForMenuReady(app)
      await installMessageBoxCapture(app)
      await clickMenuById(app, 'checkForUpdatesMenuItem')

      await expect
        .poll(async() =>
          (await getUpdateStatuses(app)).some(({ state }) => state === 'up-to-date')
        )
        .toBe(true)
      await expect
        .poll(async() => (await page.locator('.mt-notification').allTextContents()).join('\n'))
        .toMatch(/最新|up to date/i)

      expect(await getMessageBoxCalls(app)).toEqual([])
      expect(await getProviderState(app)).toEqual({
        checkCalls: 1,
        downloadCalls: 0,
        installCalls: 0
      })
    } finally {
      await app.close()
    }
  })
}

for (const [label, scenario, detail] of failedCheckScenarios) {
  test(`manual check surfaces ${label}`, async() => {
    const { app, page } = await launchElectron([], {
      env: { ...stableUpdateEnv, INKIVA_E2E_UPDATE_SCENARIO: scenario }
    })

    try {
      await waitForMenuReady(app)
      await installMessageBoxCapture(app)
      await clickMenuById(app, 'checkForUpdatesMenuItem')

      await expect
        .poll(async() => (await getUpdateStatuses(app)).some(({ state }) => state === 'error'))
        .toBe(true)
      await expect
        .poll(async() => (await page.locator('.mt-notification').allTextContents()).join('\n'))
        .toMatch(/无法检查更新|Unable to check for updates/i)

      await expect
        .poll(async() => (await page.locator('.mt-notification').allTextContents()).join('\n'))
        .toContain(detail)
      expect(await getMessageBoxCalls(app)).toEqual([])
      expect(await getProviderState(app)).toEqual({
        checkCalls: 1,
        downloadCalls: 0,
        installCalls: 0
      })
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
    await expect
      .poll(async() => (await getUpdateStatuses(app)).some(({ state }) => state === 'up-to-date'))
      .toBe(true)
    expect(await getMessageBoxCalls(app)).toEqual([])
    expect(await getProviderState(app)).toEqual({
      checkCalls: 1,
      downloadCalls: 0,
      installCalls: 0
    })
  } finally {
    await app.close()
  }
})

test('manual check reports and downloads a stable update before offering restart', async() => {
  const { app, page } = await launchElectron([], {
    env: { ...stableUpdateEnv, INKIVA_E2E_UPDATE_SCENARIO: 'stable-update' }
  })

  try {
    await waitForMenuReady(app)
    await installMessageBoxCapture(app)
    await clickMenuById(app, 'checkForUpdatesMenuItem')

    await expect
      .poll(async() => (await page.locator('.mt-notification').allTextContents()).join('\n'))
      .toMatch(/1\.1\.0/)
    await expect
      .poll(async() =>
        (await getUpdateStatuses(app)).some(({ state }) => state === 'ready-to-install')
      )
      .toBe(true)

    expect(await getUpdateStatuses(app)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ state: 'available', latestVersion: '1.1.0' }),
        expect.objectContaining({ state: 'downloading', latestVersion: '1.1.0' }),
        expect.objectContaining({ state: 'ready-to-install', latestVersion: '1.1.0' })
      ])
    )
    expect(await getProviderState(app)).toEqual({
      checkCalls: 1,
      downloadCalls: 1,
      installCalls: 0
    })
    expect(await getMessageBoxCalls(app)).toEqual([])

    const readyNotification = page
      .locator('.mt-notification')
      .filter({ hasText: /更新已准备|update is ready/i })
      .last()
    await expect(readyNotification).toBeVisible()
    await readyNotification.locator('.confirm').click()

    await expect.poll(async() => (await getProviderState(app)).installCalls).toBe(1)
  } finally {
    await app.close()
  }
})
