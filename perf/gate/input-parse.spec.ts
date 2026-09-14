import assert from 'node:assert/strict'
import test from 'node:test'

import { createInputParseProbe } from '../../packages/desktop/src/renderer/src/services/performance/inputParse.js'

test('input parse probe records one non-negative synchronous duration', () => {
  let now = 100
  const recorded: number[] = []
  const probe = createInputParseProbe({
    enabled: true,
    now: () => now,
    record: (duration) => recorded.push(duration)
  })

  probe.begin()
  now = 103.5
  assert.equal(probe.finish(), 3.5)
  assert.deepEqual(recorded, [3.5])
})

test('input parse probe consumes a pending start exactly once', () => {
  let now = 10
  let calls = 0
  const probe = createInputParseProbe({
    enabled: true,
    now: () => now,
    record: () => {
      calls += 1
    }
  })

  probe.begin()
  now = 11
  assert.equal(probe.finish(), 1)
  assert.equal(probe.finish(), undefined)
  assert.equal(calls, 1)
})

test('disabled input parse probe has no clock or recorder side effects', () => {
  let clockReads = 0
  let recorderCalls = 0
  const probe = createInputParseProbe({
    enabled: false,
    now: () => {
      clockReads += 1
      return 1
    },
    record: () => {
      recorderCalls += 1
    }
  })

  probe.begin()
  assert.equal(probe.finish(), undefined)
  assert.equal(clockReads, 0)
  assert.equal(recorderCalls, 0)
})

test('input parse probe drops a non-monotonic clock sample', () => {
  let now = 20
  let recorderCalls = 0
  const probe = createInputParseProbe({
    enabled: true,
    now: () => now,
    record: () => {
      recorderCalls += 1
    }
  })

  probe.begin()
  now = 19
  assert.equal(probe.finish(), undefined)
  assert.equal(recorderCalls, 0)
})
