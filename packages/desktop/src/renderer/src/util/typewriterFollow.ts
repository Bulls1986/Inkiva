export const TYPEWRITER_VIEWPORT_RATIO = 0.4

export interface TypewriterTargetInput {
  scrollTop: number
  caretViewportY: number
  viewportTop: number
  viewportHeight: number
}

export const getTypewriterTargetScrollTop = ({
  scrollTop,
  caretViewportY,
  viewportTop,
  viewportHeight
}: TypewriterTargetInput): number =>
  Math.max(
    0,
    scrollTop + (caretViewportY - viewportTop) - viewportHeight * TYPEWRITER_VIEWPORT_RATIO
  )

export const isTypewriterEditingInput = (inputType: string): boolean =>
  inputType.startsWith('insert') || inputType.startsWith('delete')

export interface TypewriterFollowController {
  setEnabled: (enabled: boolean) => void
  suspend: () => void
  resumeFromInput: () => void
  shouldFollow: () => boolean
}

export const createTypewriterFollowController = (
  initiallyEnabled = false
): TypewriterFollowController => {
  let enabled = initiallyEnabled
  let suspended = false

  return {
    setEnabled(value) {
      enabled = value
      suspended = false
    },
    suspend() {
      if (enabled) suspended = true
    },
    resumeFromInput() {
      if (enabled) suspended = false
    },
    shouldFollow() {
      return enabled && !suspended
    }
  }
}
