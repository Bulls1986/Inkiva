import { describe, expect, it, vi } from 'vitest'

import {
  createDocumentIntelligenceHandlers,
  type DocumentIntelligenceHandlerService
} from 'main_renderer/documentIntelligence/ipcHandlers'

const emptyPlan = {
  fromPath: '/docs/old.md',
  toPath: '/docs/new.md',
  changes: [],
  affectedFiles: [],
  linkCount: 0
}

const createService = (): DocumentIntelligenceHandlerService => ({
  indexDocument: vi.fn(),
  removeDocument: vi.fn(),
  getBacklinks: vi.fn(() => []),
  getLinkCandidates: vi.fn(() => []),
  prepareRenameRepair: vi.fn(() => emptyPlan),
  applyRenameRepair: vi.fn(async() => ({ decision: 'keep' as const, updatedPaths: [] })),
  createSnapshot: vi.fn(async() => ({
    id: 'snapshot-1',
    filePath: '/docs/note.md',
    createdAt: 1,
    reason: 'manual' as const,
    size: 0
  })),
  listSnapshots: vi.fn(async() => []),
  getSnapshot: vi.fn(async() => null),
  deleteSnapshot: vi.fn(async() => false),
  restoreSnapshot: vi.fn(async() => ({
    id: 'snapshot-1',
    filePath: '/docs/note.md',
    createdAt: 1,
    reason: 'manual' as const,
    size: 0,
    content: ''
  })),
  pruneHistory: vi.fn(async() => ({ deleted: 0, reclaimedBytes: 0 }))
})

describe('document intelligence IPC handlers', () => {
  it('validates untrusted IPC payloads before calling the service', async() => {
    const service = createService()
    const handlers = createDocumentIntelligenceHandlers(service)

    handlers.indexDocument('/docs/note.md', '# Note')
    handlers.getLinkCandidates('/docs/note.md', ['/docs/other.md'])
    handlers.prepareRenameRepair({
      fromPath: '/docs/old.md',
      toPath: '/docs/new.md',
      documents: []
    })
    await handlers.applyRenameRepair({ plan: emptyPlan, decision: 'keep' })
    await handlers.createSnapshot({
      filePath: '/docs/note.md',
      content: '# Note',
      reason: 'before-save',
      lineEnding: 'lf'
    })

    expect(service.indexDocument).toHaveBeenCalledWith('/docs/note.md', '# Note')
    expect(service.getLinkCandidates).toHaveBeenCalledWith('/docs/note.md', ['/docs/other.md'])
    expect(service.prepareRenameRepair).toHaveBeenCalled()
    expect(service.applyRenameRepair).toHaveBeenCalledWith({ plan: emptyPlan, decision: 'keep' })
    expect(service.createSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'before-save',
        lineEnding: 'lf'
      })
    )

    expect(() => handlers.indexDocument('', '# Note')).toThrow(TypeError)
    expect(() => handlers.getLinkCandidates('/docs/note.md', ['/docs/note.txt'])).not.toThrow()
    expect(() => handlers.applyRenameRepair({ plan: emptyPlan, decision: 'rewrite' })).toThrow(
      'decision must be update, keep, or cancel'
    )
    expect(() =>
      handlers.createSnapshot({ filePath: '/docs/note.md', content: '# Note', reason: 'ai' })
    ).toThrow('reason is not supported')
  })
})
