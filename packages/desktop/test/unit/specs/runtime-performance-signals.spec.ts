import { describe, expect, it } from 'vitest'
import {
  EventLoopLagTracker,
  LayoutPerformanceTracker,
  MemoryGrowthTracker,
  ScrollFpsTracker
} from '@/services/performance/runtimeSignals'

describe('MemoryGrowthTracker', () => {
  it('waits for a complete 50-sample window and detects sustained growth', () => {
    const tracker = new MemoryGrowthTracker()
    let snapshot = tracker.observe(100)

    for (let index = 1; index < 50; index += 1) {
      snapshot = tracker.observe(100 + index)
    }

    expect(snapshot.ready).toBe(true)
    expect(snapshot.growthRatio).toBeCloseTo(0.49, 8)
    expect(snapshot.linearGrowth).toBe(true)
  })

  it('uses a rolling window and resets cleanly', () => {
    const tracker = new MemoryGrowthTracker({ windowSize: 4, linearGrowthRatio: 0.1 })
    tracker.observe(100)
    tracker.observe(101)
    tracker.observe(102)
    expect(tracker.observe(103).ready).toBe(true)
    expect(tracker.observe(102).linearGrowth).toBe(false)

    tracker.reset()
    expect(tracker.observe(100).ready).toBe(false)
  })
})

describe('EventLoopLagTracker', () => {
  it('returns scheduling lag after establishing the expected deadline', () => {
    const tracker = new EventLoopLagTracker(10)

    expect(tracker.observe(100)).toBeUndefined()
    expect(tracker.observe(110)).toBe(0)
    expect(tracker.observe(135)).toBe(15)

    tracker.reset()
    expect(tracker.observe(200)).toBeUndefined()
  })
})

describe('ScrollFpsTracker', () => {
  it('computes FPS from frame timestamps and ignores duplicate timestamps', () => {
    const tracker = new ScrollFpsTracker()
    tracker.begin(0)
    tracker.frame(16.6667)
    tracker.frame(16.6667)
    tracker.frame(33.3334)

    expect(tracker.end()).toBeCloseTo(60, 3)
  })

  it('normalizes sub-frame timestamp noise at a 60Hz boundary', () => {
    const tracker = new ScrollFpsTracker()
    tracker.begin(0)
    for (let index = 1; index <= 60; index += 1) {
      tracker.frame(index * 16.668)
    }

    expect(tracker.end(1_000.08)).toBe(60)
  })
})

describe('LayoutPerformanceTracker', () => {
  it('counts a layout read after a write as forced reflow evidence', () => {
    const tracker = new LayoutPerformanceTracker()

    tracker.markLayoutRead()
    expect(tracker.consumeForcedReflows()).toBe(0)

    tracker.markDomWrite()
    tracker.markLayoutRead()
    tracker.markLayoutRead()
    expect(tracker.consumeForcedReflows()).toBe(1)
    expect(tracker.consumeForcedReflows()).toBe(0)
  })
})
