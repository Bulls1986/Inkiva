import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canonicalizeReferenceEnvironment,
  type ReferenceEnvironmentObservation
} from './reference-environment.js'

const validObservation = (): ReferenceEnvironmentObservation => ({
  os: 'Microsoft Windows 11 Enterprise',
  cpuCores: 4,
  memoryBytes: 8 * 1024 ** 3,
  diskKind: 'SATA SSD',
  integratedGpu: true,
  displayWidth: 1920,
  displayHeight: 1080,
  refreshRateHz: 60,
  powerMode: 'Balanced',
  networkMode: 'offline',
  runner: 'reference-low-end'
})

test('canonicalizes a verified minimum reference environment', () => {
  const environment = canonicalizeReferenceEnvironment(validObservation())
  assert.deepEqual(environment, {
    os: 'Windows 11 64-bit',
    cpu: '4-core low-voltage x86',
    memory: '8 GB',
    disk: 'SATA SSD',
    gpu: 'integrated graphics',
    display: '1920x1080 @ 60Hz',
    power: 'Balanced',
    network: 'offline',
    runner: 'reference-low-end'
  })
})

test('allows a larger runner only when every minimum capability remains satisfied', () => {
  const environment = canonicalizeReferenceEnvironment({
    ...validObservation(),
    cpuCores: 8,
    memoryBytes: 16 * 1024 ** 3,
    diskKind: 'entry NVMe'
  })
  assert.equal(environment.disk, 'entry NVMe')
})

test('rejects a non-reference capability before a report can be marked official', () => {
  for (const change of [
    { os: 'Ubuntu 24.04' },
    { cpuCores: 2 },
    { memoryBytes: 7 * 1024 ** 3 },
    { integratedGpu: false },
    { displayWidth: 1280 },
    { refreshRateHz: 30 },
    { powerMode: 'High Performance' },
    { networkMode: 'online' },
    { runner: 'developer-machine' }
  ]) {
    assert.throws(
      () => canonicalizeReferenceEnvironment({ ...validObservation(), ...change }),
      /reference environment/
    )
  }
})
