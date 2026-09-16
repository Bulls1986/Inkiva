import { describe, expect, it } from 'vitest'
import {
  PERFORMANCE_EVENT_NAMES,
  PERFORMANCE_TRACE_SCHEMA_VERSION,
  isPerformanceEventName,
  normalizePerformanceEvent
} from '@shared/types/performance'

describe('performance trace contract', () => {
  it('contains the startup and editor lifecycle events required by PERF-01', () => {
    expect(PERFORMANCE_EVENT_NAMES).toEqual(
      expect.arrayContaining([
        'process_entry',
        'electron_ready',
        'create_window_start',
        'browser_window_created',
        'load_url_start',
        'renderer_bootstrap_start',
        'initial_state_received',
        'theme_applied',
        'app_shell_mounted',
        'editor_shell_mounted',
        'document_open_start',
        'muya_init_start',
        'muya_init_end',
        'first_editor_interactive',
        'document_editable',
        'long_task',
        'metric_sample'
      ])
    )
  })

  it('accepts only names from the versioned event catalog', () => {
    expect(isPerformanceEventName('process_entry')).toBe(true)
    expect(isPerformanceEventName('long_task')).toBe(true)
    expect(isPerformanceEventName('metric_sample')).toBe(true)
    expect(isPerformanceEventName('not-a-performance-event')).toBe(false)
    expect(PERFORMANCE_TRACE_SCHEMA_VERSION).toBe(1)
  })

  it('normalizes untrusted event payloads into a bounded JSON-safe shape', () => {
    const event = normalizePerformanceEvent(
      {
        schemaVersion: PERFORMANCE_TRACE_SCHEMA_VERSION,
        name: 'long_task',
        process: 'renderer',
        phase: 'editor',
        traceId: 'trace-contract',
        timestampEpochMs: 100,
        durationMs: 10,
        metadata: {
          source: 'unit-test',
          oversized: 'x'.repeat(10_000),
          nested: { ignored: true }
        }
      },
      { expectedProcess: 'renderer', expectedTraceId: 'trace-contract' }
    )

    expect(event?.metadata).toEqual({
      source: 'unit-test',
      oversized: 'x'.repeat(1_024)
    })
    expect(JSON.stringify(event).length).toBeLessThan(16_384)

    expect(
      normalizePerformanceEvent(
        {
          schemaVersion: PERFORMANCE_TRACE_SCHEMA_VERSION,
          name: 'long_task',
          process: 'renderer',
          phase: 'editor',
          traceId: 'trace-contract',
          timestampEpochMs: 100,
          metadata: { nested: { ignored: true } }
        },
        { expectedProcess: 'renderer', expectedTraceId: 'trace-contract' }
      )
    ).toBeUndefined()
  })
})
