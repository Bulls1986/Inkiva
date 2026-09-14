import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EditorSnapshotScheduler,
  classifyEditorMutation,
  getEditorMutationPolicy
} from '@/components/editorWithTabs/editorHotPath'

describe('editor hot path mutation policy', () => {
  it('classifies an operation-level text edit without engine metadata as text-only', () => {
    expect(classifyEditorMutation({
      op: [0, 'text', { es: [['hello']] }],
      prevDoc: [{ name: 'paragraph', text: 'hello' }]
    })).toBe('text-only')
  })

  it('keeps ordinary text input off full TOC, document, and diagram consumers', () => {
    expect(getEditorMutationPolicy({
      mutationKind: 'text-only',
      tocChanged: false
    })).toEqual({
      kind: 'text-only',
      snapshot: 'deferred',
      refreshToc: false,
      renderDiagram: false
    })
  })

  it('promotes heading mutations to the structural consumer path', () => {
    expect(getEditorMutationPolicy({
      mutationKind: 'structural',
      tocChanged: true
    })).toEqual({
      kind: 'structural',
      snapshot: 'immediate',
      refreshToc: true,
      renderDiagram: false
    })
  })

  it('marks diagram mutations for the diagram consumer without changing the coordinator', () => {
    expect(getEditorMutationPolicy({
      mutationKind: 'diagram',
      tocChanged: false
    })).toEqual({
      kind: 'diagram',
      snapshot: 'deferred',
      refreshToc: false,
      renderDiagram: true
    })
  })
})

describe('EditorSnapshotScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not capture synchronously and coalesces text edits per document', () => {
    const scheduler = new EditorSnapshotScheduler({ delayMs: 50, maxWaitMs: 200 })
    const captures: string[] = []

    scheduler.request('doc-1', () => captures.push('first'))
    scheduler.request('doc-1', () => captures.push('latest'))

    expect(captures).toEqual([])
    vi.advanceTimersByTime(49)
    expect(captures).toEqual([])

    vi.advanceTimersByTime(1)
    expect(captures).toEqual(['latest'])

    scheduler.dispose()
  })

  it('flushes structural work immediately and only once', () => {
    const scheduler = new EditorSnapshotScheduler({ delayMs: 50, maxWaitMs: 200 })
    const capture = vi.fn()

    scheduler.request('doc-1', capture)
    scheduler.request('doc-1', capture, true)

    expect(capture).toHaveBeenCalledTimes(1)
    vi.runAllTimers()
    expect(capture).toHaveBeenCalledTimes(1)

    scheduler.dispose()
  })
})
