import assert from 'node:assert/strict'
import test from 'node:test'
import { createPerformanceGateMetadata } from './metadata.js'

test('creates metadata only for a validated reference environment', () => {
  const metadata = createPerformanceGateMetadata(
    {
      os: 'Windows 11 64-bit',
      cpu: '4-core low-voltage x86',
      memory: '8 GB',
      disk: 'SATA SSD',
      gpu: 'integrated graphics',
      display: '1920x1080 @ 60Hz',
      power: 'Balanced',
      network: 'offline',
      runner: 'reference-low-end'
    },
    'P1',
    '0.3.0',
    'inkiva-reference-gate'
  )

  assert.deepEqual(metadata, {
    productVersion: '0.3.0',
    suite: 'inkiva-reference-gate',
    level: 'P1',
    environment: {
      os: 'Windows 11 64-bit',
      cpu: '4-core low-voltage x86',
      memory: '8 GB',
      disk: 'SATA SSD',
      gpu: 'integrated graphics',
      display: '1920x1080 @ 60Hz',
      power: 'Balanced',
      network: 'offline',
      runner: 'reference-low-end'
    }
  })
})

test('rejects metadata for a non-reference environment', () => {
  assert.throws(
    () =>
      createPerformanceGateMetadata(
        {
          os: 'macOS',
          cpu: 'developer',
          memory: '32 GB',
          disk: 'NVMe',
          gpu: 'discrete',
          display: '2560x1440 @ 144Hz',
          power: 'High Performance',
          network: 'online',
          runner: 'developer-machine'
        },
        'P0',
        '0.3.0',
        'inkiva-reference-gate'
      ),
    /Windows low-end reference/
  )
})
