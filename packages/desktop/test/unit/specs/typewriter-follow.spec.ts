import { describe, expect, it } from 'vitest'
import {
  createTypewriterFollowController,
  getTypewriterTargetScrollTop,
  isTypewriterEditingInput,
  TYPEWRITER_VIEWPORT_RATIO
} from '@/util/typewriterFollow'

describe('typewriter follow policy', () => {
  it('suspends on newer navigation intent and resumes only after editor input', () => {
    const controller = createTypewriterFollowController()

    controller.setEnabled(true)
    expect(controller.shouldFollow()).toBe(true)

    controller.suspend()
    expect(controller.shouldFollow()).toBe(false)

    controller.resumeFromInput()
    expect(controller.shouldFollow()).toBe(true)

    controller.setEnabled(false)
    expect(controller.shouldFollow()).toBe(false)

    controller.resumeFromInput()
    expect(controller.shouldFollow()).toBe(false)
  })

  it('uses 40% of the visible editor height and clamps the top boundary', () => {
    expect(TYPEWRITER_VIEWPORT_RATIO).toBe(0.4)

    expect(
      getTypewriterTargetScrollTop({
        scrollTop: 500,
        caretViewportY: 260,
        viewportTop: 20,
        viewportHeight: 600
      })
    ).toBe(500)

    expect(
      getTypewriterTargetScrollTop({
        scrollTop: 20,
        caretViewportY: 30,
        viewportTop: 20,
        viewportHeight: 600
      })
    ).toBe(0)
  })

  it('resumes only for content-editing beforeinput operations', () => {
    expect(isTypewriterEditingInput('insertText')).toBe(true)
    expect(isTypewriterEditingInput('insertParagraph')).toBe(true)
    expect(isTypewriterEditingInput('insertCompositionText')).toBe(true)
    expect(isTypewriterEditingInput('deleteContentBackward')).toBe(true)

    expect(isTypewriterEditingInput('formatBold')).toBe(false)
    expect(isTypewriterEditingInput('historyUndo')).toBe(false)
    expect(isTypewriterEditingInput('')).toBe(false)
  })
})
