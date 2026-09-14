import { describe, expect, it } from 'vitest'
import type { BootInfo, IpcSendChannels } from '@shared/types/ipc'
import {
  PERFORMANCE_EVENT_CHANNEL,
  PERFORMANCE_TRACE_SCHEMA_VERSION,
  type PerformanceEvent
} from '@shared/types/performance'

describe('performance IPC contract', () => {
  it('uses a single typed renderer-to-main event channel', () => {
    const event: PerformanceEvent = {
      schemaVersion: PERFORMANCE_TRACE_SCHEMA_VERSION,
      name: 'app_shell_mounted',
      process: 'renderer',
      phase: 'startup',
      traceId: 'trace-test',
      timestampEpochMs: 1000
    }
    const args: IpcSendChannels[typeof PERFORMANCE_EVENT_CHANNEL] = [event]

    expect(PERFORMANCE_EVENT_CHANNEL).toBe('mt::performance-event')
    expect(args[0]).toEqual(event)
  })

  it('requires boot metadata needed to correlate process clocks', () => {
    const bootInfo: Pick<BootInfo, 'performance'> = {
      performance: {
        enabled: true,
        traceId: 'trace-test',
        mainTimeOriginEpochMs: 1000
      }
    }

    expect(bootInfo.performance.mainTimeOriginEpochMs).toBe(1000)
    expect(bootInfo.performance.traceId).toBe('trace-test')
  })
})
