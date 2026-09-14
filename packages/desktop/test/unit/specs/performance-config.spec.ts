import { describe, expect, it } from 'vitest'
import { resolvePerformanceCaptureConfig } from 'main_renderer/performance/config'

describe('performance capture configuration', () => {
  it('does not capture in a normal production process by default', () => {
    expect(resolvePerformanceCaptureConfig({ NODE_ENV: 'production' })).toEqual({
      enabled: false,
      reportDirectory: null,
      sampleIntervalMs: 1000
    })
  })

  it('enables capture explicitly in production without requiring telemetry', () => {
    expect(
      resolvePerformanceCaptureConfig({
        NODE_ENV: 'production',
        INKIVA_PERF_CAPTURE: 'true',
        INKIVA_PERF_REPORT_DIR: '/tmp/inkiva-perf'
      })
    ).toEqual({
      enabled: true,
      reportDirectory: '/tmp/inkiva-perf',
      sampleIntervalMs: 1000
    })
  })

  it('enables development and explicit performance capture, with an opt-out', () => {
    expect(resolvePerformanceCaptureConfig({ NODE_ENV: 'development' }).enabled).toBe(true)
    expect(resolvePerformanceCaptureConfig({ PERF_TESTING: 'true' }).enabled).toBe(false)
    expect(
      resolvePerformanceCaptureConfig({
        PERF_TESTING: 'true',
        INKIVA_PERF_CAPTURE: 'true'
      }).enabled
    ).toBe(true)
    expect(
      resolvePerformanceCaptureConfig({
        NODE_ENV: 'development',
        PERF_TESTING: 'true',
        INKIVA_PERF_CAPTURE: 'false',
        INKIVA_PERF_REPORT_DIR: '/tmp/should-not-write'
      })
    ).toEqual({
      enabled: false,
      reportDirectory: null,
      sampleIntervalMs: 1000
    })
  })

  it('clamps an explicit sampling interval to the supported floor', () => {
    expect(
      resolvePerformanceCaptureConfig({
        INKIVA_PERF_CAPTURE: 'true',
        INKIVA_PERF_SAMPLE_INTERVAL_MS: '100'
      }).sampleIntervalMs
    ).toBe(250)
    expect(
      resolvePerformanceCaptureConfig({
        INKIVA_PERF_CAPTURE: 'true',
        INKIVA_PERF_SAMPLE_INTERVAL_MS: '400'
      }).sampleIntervalMs
    ).toBe(400)
  })

  it('ignores blank report directories and does not invent a path', () => {
    expect(
      resolvePerformanceCaptureConfig({
        INKIVA_PERF_CAPTURE: 'true',
        INKIVA_PERF_REPORT_DIR: '   '
      })
    ).toEqual({
      enabled: true,
      reportDirectory: null,
      sampleIntervalMs: 1000
    })
  })
})
