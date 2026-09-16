import { scheduleEditorPerformanceMilestones } from './editorPerformanceMilestones'

export interface DegradedEditorPerformanceScheduleOptions {
  requestFrame: (callback: () => void) => void
  isCurrent: () => boolean
  hasEditorSurface: () => boolean
  markFirstScreen: () => void
  markInteractive: () => void
  markEditable: () => void
  notifyMainProcess?: () => void
  maxSurfaceWaitFrames?: number
}

/**
 * A degraded editor's wrapper can paint before its async CodeMirror child is
 * mounted. Use the normal ordered paint milestones, then wait for the actual
 * editable surface before notifying the main process.
 */
export const scheduleDegradedEditorPerformanceMilestones = ({
  requestFrame,
  isCurrent,
  hasEditorSurface,
  markFirstScreen,
  markInteractive,
  markEditable,
  notifyMainProcess,
  maxSurfaceWaitFrames = 120
}: DegradedEditorPerformanceScheduleOptions): void => {
  const waitForEditorSurface = (waitedFrames: number): void => {
    if (!isCurrent()) return
    if (hasEditorSurface()) {
      markEditable()
      notifyMainProcess?.()
      return
    }
    if (waitedFrames >= maxSurfaceWaitFrames) return
    requestFrame(() => waitForEditorSurface(waitedFrames + 1))
  }

  scheduleEditorPerformanceMilestones({
    requestFrame,
    isCurrent,
    markFirstScreen,
    markInteractive,
    markEditable: () => waitForEditorSurface(0)
  })
}
