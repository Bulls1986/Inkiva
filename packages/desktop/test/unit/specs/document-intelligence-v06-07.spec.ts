import { describe, expect, it, vi } from 'vitest'
import { DocumentIntelligenceCoordinator } from '@/services/documentIntelligence'
import type { BrokenMarkdownLinksResult } from '@shared/types/documentIntelligence'

const empty = (rootPath: string | null): BrokenMarkdownLinksResult => ({
  rootPath, findings: [], checkedTargets: 0, complete: true, stale: false
})
const tick = async(): Promise<void> => {
  for (let i = 0; i < 12; i += 1) await vi.advanceTimersByTimeAsync(1)
}

describe('V06-07 diagnostic sidebar state / LINK-AC13', () => {
  it('exposes a workspace report, refreshes after open-document edits and never claims partial scope clean', async() => {
    vi.useFakeTimers()
    try {
      const finding = {
        sourcePath: '/docs/source.md',
        targetPath: '/docs/missing.md',
        label: 'Missing',
        destination: './missing.md',
        fragment: '',
        line: 1,
        column: 0,
        start: 0,
        end: 23,
        revision: 1,
        status: 'missing-file' as const,
        reason: 'ENOENT'
      }
      const getBrokenMarkdownLinks = vi.fn()
        .mockResolvedValueOnce({ ...empty('/docs'), findings: [finding] })
        .mockResolvedValueOnce(empty('/docs'))
      const api = {
        indexWorkspace: vi.fn(async(rootPath: string | null) =>
          ({ rootPath, indexedFiles: 2, skippedFiles: 0, complete: true })),
        refreshWorkspaceFile: vi.fn(async() => undefined),
        indexDocument: vi.fn(async() => undefined),
        removeDocument: vi.fn(async() => undefined),
        getBacklinks: vi.fn(async() => []),
        getBrokenMarkdownLinks,
        listSnapshots: vi.fn(async() => []),
        createSnapshot: vi.fn(async() => ({
          id: '1',
          filePath: '/docs/source.md',
          createdAt: 1,
          reason: 'manual' as const,
          size: 0
        })),
        getSnapshot: vi.fn(async() => null),
        restoreSnapshot: vi.fn(async() => { throw new Error('not used') }),
        moveHistoryPath: vi.fn(async() => 0)
      }
      const coordinator = new DocumentIntelligenceCoordinator({ api, indexDelayMs: 5 })
      const opening = coordinator.indexWorkspace('/docs')
      await tick()
      await opening
      expect(coordinator.getState().brokenLinks?.findings).toEqual([finding])
      coordinator.updateDocuments([{
        id: 'source',
        pathname: '/docs/source.md',
        markdown: '[Fixed](./valid.md)',
        isSaved: false
      }], 'source')
      await vi.advanceTimersByTimeAsync(10)
      await tick()
      expect(coordinator.getState().brokenLinks?.findings).toEqual([])
      expect(getBrokenMarkdownLinks).toHaveBeenCalledTimes(2)
      coordinator.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not publish an in-flight diagnostic response after workspace replacement', async() => {
    vi.useFakeTimers()
    try {
      let release!: (result: BrokenMarkdownLinksResult) => void
      const oldScan = new Promise<BrokenMarkdownLinksResult>((resolve) => { release = resolve })
      const api = {
        indexWorkspace: vi.fn(async(rootPath: string | null) =>
          ({ rootPath, indexedFiles: 1, skippedFiles: 0, complete: true })),
        refreshWorkspaceFile: vi.fn(async() => undefined),
        indexDocument: vi.fn(async() => undefined),
        removeDocument: vi.fn(async() => undefined),
        getBacklinks: vi.fn(async() => []),
        getBrokenMarkdownLinks: vi.fn()
          .mockImplementationOnce(() => oldScan)
          .mockImplementation(() => Promise.resolve(empty('/next'))),
        listSnapshots: vi.fn(async() => []),
        createSnapshot: vi.fn(async() => ({
          id: '1',
          filePath: '/docs/source.md',
          createdAt: 1,
          reason: 'manual' as const,
          size: 0
        })),
        getSnapshot: vi.fn(async() => null),
        restoreSnapshot: vi.fn(async() => { throw new Error('not used') }),
        moveHistoryPath: vi.fn(async() => 0)
      }
      const coordinator = new DocumentIntelligenceCoordinator({ api })
      const old = coordinator.indexWorkspace('/docs')
      await tick()
      const next = coordinator.indexWorkspace('/next')
      await tick()
      release(empty('/docs'))
      await tick()
      await Promise.all([old, next])
      expect(coordinator.getState().brokenLinks?.rootPath).toBe('/next')
      coordinator.dispose()
    } finally {
      vi.useRealTimers()
    }
  })
})
