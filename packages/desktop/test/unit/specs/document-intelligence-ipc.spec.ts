import { describe, expect, it, vi } from 'vitest'
import path from 'node:path'

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
  indexWorkspace: vi.fn(async(rootPath) => ({
    rootPath,
    indexedFiles: 0,
    skippedFiles: 0,
    complete: true
  })),
  refreshWorkspaceFile: vi.fn(async() => undefined),
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
  moveHistoryPath: vi.fn(async() => 1),
  pruneHistory: vi.fn(async() => ({ deleted: 0, reclaimedBytes: 0 }))
})

describe('document intelligence IPC handlers', () => {
  it('routes link indexing through separate window owner scopes', async() => {
    const service = createService()
    const first = createDocumentIntelligenceHandlers(service, 11)
    const second = createDocumentIntelligenceHandlers(service, 22)
    const root = path.resolve('docs')

    await first.indexWorkspace(root)
    second.indexDocument(path.join(root, 'source.md'), '[B](./target.md)')
    first.getBacklinks(path.join(root, 'target.md'))
    second.getBacklinks(path.join(root, 'target.md'))

    expect(service.indexWorkspace).toHaveBeenCalledWith(root, 11)
    expect(service.indexDocument).toHaveBeenCalledWith(
      path.join(root, 'source.md'),
      '[B](./target.md)',
      22
    )
    expect(service.getBacklinks).toHaveBeenCalledWith(path.join(root, 'target.md'), 11)
    expect(service.getBacklinks).toHaveBeenCalledWith(path.join(root, 'target.md'), 22)
    await first.refreshWorkspaceFile(path.join(root, 'source.md'))
    expect(service.refreshWorkspaceFile).toHaveBeenCalledWith(
      path.join(root, 'source.md'),
      11
    )
  })

  it('validates untrusted IPC payloads before calling the service', async() => {
    const service = createService()
    const handlers = createDocumentIntelligenceHandlers(service)

    handlers.indexDocument('/docs/note.md', '# Note')
    const rootPath = path.resolve('docs')
    await handlers.indexWorkspace(rootPath)
    handlers.getLinkCandidates('/docs/note.md', ['/docs/other.md'])
    handlers.prepareRenameRepair({
      fromPath: '/docs',
      toPath: '/archive/docs',
      pathKind: 'directory',
      documents: []
    })
    await handlers.applyRenameRepair({ plan: emptyPlan, decision: 'keep' })
    await handlers.createSnapshot({
      filePath: '/docs/note.md',
      content: '# Note',
      reason: 'before-save',
      lineEnding: 'lf'
    })
    await handlers.moveHistoryPath({
      fromPath: '/docs',
      toPath: '/archive/docs',
      pathKind: 'directory'
    })

    expect(service.indexDocument).toHaveBeenCalledWith('/docs/note.md', '# Note')
    expect(service.indexWorkspace).toHaveBeenCalledWith(rootPath)
    expect(service.getLinkCandidates).toHaveBeenCalledWith('/docs/note.md', ['/docs/other.md'])
    expect(service.prepareRenameRepair).toHaveBeenCalledWith({
      fromPath: '/docs',
      toPath: '/archive/docs',
      pathKind: 'directory',
      documents: []
    })
    expect(service.applyRenameRepair).toHaveBeenCalledWith({ plan: emptyPlan, decision: 'keep' })
    expect(service.createSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'before-save',
        lineEnding: 'lf'
      })
    )
    expect(service.moveHistoryPath).toHaveBeenCalledWith({
      fromPath: '/docs',
      toPath: '/archive/docs',
      pathKind: 'directory'
    })

    expect(() => handlers.indexDocument('', '# Note')).toThrow(TypeError)
    expect(() => handlers.indexWorkspace('../relative')).toThrow('rootPath must be absolute')
    expect(() => handlers.getLinkCandidates('/docs/note.md', ['/docs/note.txt'])).not.toThrow()
    expect(() => handlers.applyRenameRepair({ plan: emptyPlan, decision: 'rewrite' })).toThrow(
      'decision must be update, keep, or cancel'
    )
    expect(() =>
      handlers.prepareRenameRepair({
        fromPath: '/docs',
        toPath: '/archive/docs',
        pathKind: 'workspace',
        documents: []
      })
    ).toThrow('pathKind must be file or directory')
    expect(() =>
      handlers.moveHistoryPath({
        fromPath: '/docs',
        toPath: '/archive/docs',
        pathKind: 'workspace'
      })
    ).toThrow('pathKind must be file or directory')
    expect(() =>
      handlers.createSnapshot({ filePath: '/docs/note.md', content: '# Note', reason: 'ai' })
    ).toThrow('reason is not supported')
  })
})
