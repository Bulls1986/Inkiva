import { describe, expect, it, vi } from 'vitest'
import { scheduleEditorPerformanceMilestones } from '../../../src/renderer/src/components/editorWithTabs/editorPerformanceMilestones'

type FrameCallback = () => void

describe('editor performance milestone scheduling', () => {
  it('records screen, interactive, and editable only across ordered paint frames', () => {
    const frames: FrameCallback[] = []
    const requestFrame = (callback: FrameCallback): void => {
      frames.push(callback)
    }
    const callbacks = {
      firstScreen: vi.fn(),
      interactive: vi.fn(),
      editable: vi.fn(),
      notify: vi.fn()
    }

    scheduleEditorPerformanceMilestones({
      requestFrame,
      isCurrent: () => true,
      markFirstScreen: callbacks.firstScreen,
      markInteractive: callbacks.interactive,
      markEditable: callbacks.editable,
      notifyMainProcess: callbacks.notify
    })

    expect(frames).toHaveLength(1)
    expect(callbacks.firstScreen).not.toHaveBeenCalled()
    flushFrame(frames)
    expect(frames).toHaveLength(1)
    expect(callbacks.firstScreen).not.toHaveBeenCalled()
    flushFrame(frames)
    expect(callbacks.firstScreen).toHaveBeenCalledOnce()
    expect(callbacks.interactive).not.toHaveBeenCalled()
    expect(callbacks.editable).not.toHaveBeenCalled()
    flushFrame(frames)
    expect(callbacks.interactive).toHaveBeenCalledOnce()
    expect(callbacks.editable).not.toHaveBeenCalled()
    flushFrame(frames)
    expect(callbacks.editable).toHaveBeenCalledOnce()
    expect(callbacks.notify).toHaveBeenCalledOnce()
  })

  it('cancels stale milestone callbacks after a newer document operation begins', () => {
    const frames: FrameCallback[] = []
    let current = true
    const callbacks = {
      firstScreen: vi.fn(),
      interactive: vi.fn(),
      editable: vi.fn(),
      notify: vi.fn()
    }

    scheduleEditorPerformanceMilestones({
      requestFrame: (callback) => frames.push(callback),
      isCurrent: () => current,
      markFirstScreen: callbacks.firstScreen,
      markInteractive: callbacks.interactive,
      markEditable: callbacks.editable,
      notifyMainProcess: callbacks.notify
    })

    current = false
    while (frames.length > 0) flushFrame(frames)

    expect(callbacks.firstScreen).not.toHaveBeenCalled()
    expect(callbacks.interactive).not.toHaveBeenCalled()
    expect(callbacks.editable).not.toHaveBeenCalled()
    expect(callbacks.notify).not.toHaveBeenCalled()
  })
})

const flushFrame = (frames: FrameCallback[]): void => {
  const callback = frames.shift()
  if (!callback) throw new Error('expected a queued animation frame')
  callback()
}
