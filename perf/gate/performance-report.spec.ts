import assert from 'node:assert/strict'
import test from 'node:test'

import { collectPerformanceReportSamples } from './performance-report.js'
import { PerformanceSampleCollector } from './runner.js'

test('performance report adapter keeps metric_sample values as raw series', () => {
  const collector = new PerformanceSampleCollector()
  const report = {
    traces: [{
      events: Array.from({ length: 20 }, (_, index) => ({
        name: 'metric_sample',
        metadata: {
          metric: 'core.input.latency',
          unit: 'ms',
          value: index + 1
        }
      }))
    }]
  }

  collectPerformanceReportSamples(report, collector)

  assert.deepEqual(collector.toMetrics()['core.input.latency'], {
    unit: 'ms',
    samples: Array.from({ length: 20 }, (_, index) => index + 1)
  })
})

test('performance report adapter rejects malformed metric samples', () => {
  const collector = new PerformanceSampleCollector()
  assert.throws(() => collectPerformanceReportSamples({
    traces: [{
      events: [{
        name: 'metric_sample',
        metadata: { metric: 'core.frame.duration', unit: 'bogus', value: 1 }
      }]
    }]
  }, collector))
})

test('performance report adapter ignores non-metric diagnostics', () => {
  const collector = new PerformanceSampleCollector()
  collectPerformanceReportSamples({
    traces: [{ events: [{ name: 'long_task', durationMs: 75 }] }]
  }, collector)
  assert.deepEqual(collector.metricNames(), [])
})
