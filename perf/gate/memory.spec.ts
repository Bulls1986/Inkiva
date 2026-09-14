import assert from 'node:assert/strict'
import test from 'node:test'

import { evaluateMemoryLeakSeries } from './memory.js'

const stableSamples = (): number[] =>
  Array.from({ length: 200 }, (_, index) => 100_000 + (index % 2) * 20)

test('memory leak evaluation requires a complete 200-cycle series', () => {
  assert.throws(() => evaluateMemoryLeakSeries(stableSamples().slice(0, 199)), /200 samples/)
})

test('stable post-GC heap samples pass both the 50 and 200 cycle checks', () => {
  const result = evaluateMemoryLeakSeries(stableSamples())

  assert.equal(result.growth50Ratio !== undefined, true)
  assert.equal(result.linearGrowth50, false)
  assert.equal(result.linearGrowth200, false)
})

test('sustained heap growth is visible in both leak windows', () => {
  const result = evaluateMemoryLeakSeries(
    Array.from({ length: 200 }, (_, index) => 100_000 + index * 1_000)
  )

  assert.equal(result.linearGrowth50, true)
  assert.equal(result.linearGrowth200, true)
})

test('memory leak evaluation rejects invalid samples and invalid window contracts', () => {
  assert.throws(
    () => evaluateMemoryLeakSeries([100, Number.NaN]),
    /finite non-negative/
  )
  assert.throws(
    () => evaluateMemoryLeakSeries(stableSamples(), { shortWindowSize: 1 }),
    /window sizes/
  )
  assert.throws(
    () => evaluateMemoryLeakSeries(stableSamples(), { shortWindowSize: 60, longWindowSize: 50 }),
    /window sizes/
  )
})
