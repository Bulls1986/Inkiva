import { describe, expect, it, vi } from 'vitest'
import {
  createMainPerformanceCoordinator,
  type MainPerformanceCoordinatorOptions
} from 'main_renderer/performance'
import type { MainPerformanceClock } from 'main_renderer/performance/recorder'
import type { PerformanceReportWriteResult } from 'main_renderer/performance/report-store'
import { PERFORMANCE_TRACE_SCHEMA_VERSION, type PerformanceEvent } from '@shared/types/performance'

class TestClock implements MainPerformanceClock {
  readonly timeOriginEpochMs = 1_700_000_000_000
  private currentNow = 100

  now(): number {
    return this.currentNow
  }

  advance(milliseconds: number): void {
    this.currentNow += milliseconds
  }
}

const createWriter = () => {
  const result: PerformanceReportWriteResult = {
    ok: true,
    status: 'written',
    written: true,
    files: ['/virtual/perf-results/startup.json']
  }
  return { write: vi.fn(async() => result) }
}

const createCoordinator = (overrides: Partial<MainPerformanceCoordinatorOptions> = {}) => {
  const clock = (overrides.clock ?? new TestClock()) as TestClock
  const writer = overrides.writer ?? createWriter()
  const coordinator = createMainPerformanceCoordinator({
    enabled: true,
    clock,
    traceId: 'trace-coordinator',
    writer,
    ...overrides
  })
  return { coordinator, clock, writer }
}

const rendererEvent = (overrides: Partial<PerformanceEvent> = {}): PerformanceEvent => ({
  schemaVersion: PERFORMANCE_TRACE_SCHEMA_VERSION,
  name: 'app_shell_mounted',
  process: 'renderer',
  phase: 'startup',
  traceId: 'trace-coordinator',
  timestampEpochMs: 1_700_000_000_140,
  ...overrides
})

describe('MainPerformanceCoordinator', () => {
  it('exposes a stable boot context and correlates main and renderer events', () => {
    const { coordinator, clock } = createCoordinator()

    const processEntry = coordinator.mark('process_entry', { phase: 'startup' })
    clock.advance(40)
    const rendererEntry = rendererEvent({ timestampEpochMs: 1_700_000_000_140 })
    expect(coordinator.recordRendererEvent(rendererEntry)).toBe(true)

    expect(coordinator.getBootInfo()).toEqual({
      enabled: true,
      traceId: 'trace-coordinator',
      mainTimeOriginEpochMs: 1_700_000_000_000
    })
    expect(coordinator.snapshot().traces).toHaveLength(1)
    expect(coordinator.snapshot().traces[0]?.events).toEqual([processEntry, rendererEntry])
  })

  it('rejects stale or malformed renderer events before they enter the report', () => {
    const { coordinator } = createCoordinator()

    expect(coordinator.recordRendererEvent(rendererEvent({ traceId: 'other-trace' }))).toBe(false)
    expect(coordinator.recordRendererEvent(rendererEvent({ process: 'main' }))).toBe(false)
    expect(
      coordinator.recordRendererEvent(
        rendererEvent({
          name: 'not-an-event' as PerformanceEvent['name']
        })
      )
    ).toBe(false)
    expect(coordinator.snapshot().traces[0]?.events).toEqual([])
  })

  it('bounds renderer event intake and rejects invalid optional fields', () => {
    const { coordinator } = createCoordinator({ maxRendererEvents: 1 })

    expect(
      coordinator.recordRendererEvent(
        rendererEvent({
          metadata: { nested: { ignored: true } } as unknown as PerformanceEvent['metadata']
        })
      )
    ).toBe(false)
    expect(
      coordinator.recordRendererEvent(
        rendererEvent({
          metadata: { payload: 'x'.repeat(10_000) } as PerformanceEvent['metadata']
        })
      )
    ).toBe(true)
    expect(coordinator.snapshot().traces[0]?.events[0]?.metadata?.payload).toHaveLength(1_024)

    expect(coordinator.recordRendererEvent(rendererEvent())).toBe(false)

    const { coordinator: invalidCoordinator } = createCoordinator()
    expect(invalidCoordinator.recordRendererEvent(rendererEvent({ durationMs: -1 }))).toBe(false)
  })

  it('flushes once through the injected report writer and remains side-effect free when disabled', async() => {
    const { coordinator, writer } = createCoordinator()
    coordinator.mark('process_entry', { phase: 'startup' })

    await expect(coordinator.flush()).resolves.toMatchObject({
      ok: true,
      status: 'written'
    })
    expect(writer.write).toHaveBeenCalledOnce()

    const disabledWriter = createWriter()
    const disabled = createMainPerformanceCoordinator({
      enabled: false,
      writer: disabledWriter,
      clock: new TestClock()
    })
    expect(disabled.mark('process_entry', { phase: 'startup' })).toBeUndefined()
    await expect(disabled.flush()).resolves.toMatchObject({
      ok: true,
      status: 'disabled'
    })
    expect(disabledWriter.write).not.toHaveBeenCalled()
  })
})
