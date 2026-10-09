import assert from 'node:assert/strict'
import test from 'node:test'

import { selectEditorMilestoneTimestamps } from './editorMilestones.ts'

const milestone = (operationId, start) => ({
  operationId,
  openStartAt: start,
  firstScreenAt: start + 18,
  editableAt: start + 34
})

test('selects the awaited trace operation over a newer unrelated editor root', () => {
  const target = milestone('document-mt-0', 100)
  const unrelated = milestone('document-mt-1', 150)
  assert.deepEqual(
    selectEditorMilestoneTimestamps([target, unrelated], 90, 'document-mt-0'),
    target
  )
})

test('fails closed when only stale or unrelated trace operation roots exist', () => {
  assert.equal(
    selectEditorMilestoneTimestamps([milestone('document-mt-1', 150)], 90, 'document-mt-0'),
    null
  )
  assert.equal(
    selectEditorMilestoneTimestamps([
      { openStartAt: 160, firstScreenAt: 178, editableAt: 194 }
    ], 90, 'document-mt-0'),
    null
  )
})

test('keeps timestamp-only selection for callers without expected trace identity', () => {
  assert.deepEqual(
    selectEditorMilestoneTimestamps([milestone('document-mt-0', 100)], 90),
    milestone('document-mt-0', 100)
  )
})
