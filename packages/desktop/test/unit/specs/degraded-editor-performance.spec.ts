import { describe, expect, it, vi } from 'vitest'
import {
  scheduleDegradedEditorPerformanceMilestones
} from '@/components/editorWithTabs/degradedEditorPerformance'

type Frame = () => void

describe('degraded editor performance milestones', () => {
  it('does not mark editable until the bounded source surface is mounted', () => {
    const frames: Frame[] = []
    let hasSurface = false
    const events: string[] = []
    const notify = vi.fn()

    scheduleDegradedEditorPerformanceMilestones({
      requestFrame: (callback) => frames.push(callback),
      isCurrent: () => true,
      hasEditorSurface: () => hasSurface,
      markFirstScreen: () => events.push('screen'),
      markInteractive: () => events.push('interactive'),
      markEditable: () => events.push('editable'),
      notifyMainProcess: notify
    })

    flushFrame(frames)
    flushFrame(frames)
    expect(events).toEqual(['screen'])
    flushFrame(frames)
    expect(events).toEqual(['screen', 'interactive'])
    flushFrame(frames)
    expect(events).toEqual(['screen', 'interactive'])
    expect(notify).not.toHaveBeenCalled()

    hasSurface = true
    flushFrame(frames)
    expect(events).toEqual(['screen', 'interactive', 'editable'])
    expect(notify).toHaveBeenCalledOnce()
  })

  it('stops waiting when the degraded operation becomes stale', () => {
    const frames: Frame[] = []
    let current = true
    const editable = vi.fn()

    scheduleDegradedEditorPerformanceMilestones({
      requestFrame: (callback) => frames.push(callback),
      isCurrent: () => current,
      hasEditorSurface: () => false,
      markFirstScreen: vi.fn(),
      markInteractive: vi.fn(),
      markEditable: editable,
      maxSurfaceWaitFrames: 4
    })

    flushFrame(frames)
    flushFrame(frames)
    flushFrame(frames)
    flushFrame(frames)
    current = false
    while (frames.length > 0) flushFrame(frames)

    expect(editable).not.toHaveBeenCalled()
  })
})

const flushFrame = (frames: Frame[]): void => {
  const callback = frames.shift()
  if (!callback) throw new Error('expected a queued animation frame')
  callback()
}
