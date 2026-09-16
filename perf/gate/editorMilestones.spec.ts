import { describe, expect, it } from 'vitest'
import { measureEditorMilestones } from './editorMilestones.js'

describe('editor performance milestones', () => {
  it('keeps first-screen and editable timings as distinct real milestones', () => {
    expect(
      measureEditorMilestones({
        openStartAt: 100,
        firstScreenAt: 124.5,
        editableAt: 151.25
      })
    ).toEqual({
      firstScreenMs: 24.5,
      editableMs: 51.25
    })
  })

  it('rejects missing or non-monotonic milestone timestamps', () => {
    expect(() =>
      measureEditorMilestones({
        openStartAt: Number.NaN,
        firstScreenAt: 124,
        editableAt: 151
      })
    ).toThrow('finite timestamps')

    expect(() =>
      measureEditorMilestones({
        openStartAt: 100,
        firstScreenAt: 99,
        editableAt: 151
      })
    ).toThrow('precedes open start')

    expect(() =>
      measureEditorMilestones({
        openStartAt: 100,
        firstScreenAt: 124,
        editableAt: 124
      })
    ).toThrow('must follow first-screen')
  })
})
