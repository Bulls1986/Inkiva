import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeDiskKind } from './verifyPerformanceEnvironment.js'

test('normalizes only explicitly supported reference disk kinds', () => {
  assert.equal(normalizeDiskKind('SATA SSD'), 'SATA SSD')
  assert.equal(normalizeDiskKind('entry NVMe'), 'entry NVMe')
  assert.equal(normalizeDiskKind('RAID'), 'unsupported')
  assert.equal(normalizeDiskKind(''), 'unsupported')
  assert.equal(normalizeDiskKind(undefined), 'unsupported')
})
