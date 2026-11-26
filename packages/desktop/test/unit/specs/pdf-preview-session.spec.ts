import { describe, expect, it, vi } from 'vitest'
import {
  PdfPreviewSession,
  type PdfPreviewSessionDeps,
  type PdfPreviewVersionSnapshot
} from '@/services/pdfPreviewSession'
import type { PdfPreviewGenerateResponse, PdfPreviewSaveResponse } from '@shared/types/pdfPreview'

// Renderer half of P1-P3: the preview shown to the user and the file that gets
// saved come from one artifact, and any document/settings/resource change makes
// the old preview unsavable until it is generated again.

const VERSIONS: PdfPreviewVersionSnapshot = {
  documentVersion: 'doc-1',
  settingsVersion: 'set-1',
  resourceVersion: 'res-1'
}

const bytes = (): Uint8Array => new Uint8Array([0x25, 0x50, 0x44, 0x46])

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

const defer = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

const createSession = (overrides: Partial<PdfPreviewSessionDeps> = {}) => {
  const deps: PdfPreviewSessionDeps = {
    generate: vi.fn(async(): Promise<PdfPreviewGenerateResponse> => ({
      ok: true,
      previewId: 'preview-1',
      byteLength: 5
    })),
    read: vi.fn(async() => bytes()),
    save: vi.fn(async(): Promise<PdfPreviewSaveResponse> => ({
      ok: true,
      status: 'saved',
      filePath: '/out/report.pdf',
      byteLength: 5
    })),
    cancel: vi.fn(),
    release: vi.fn(),
    openDocument: vi.fn(async() => ({
      numPages: 3,
      destroy: vi.fn(async() => {})
    })),
    ...overrides
  }
  const session = new PdfPreviewSession(deps)
  return { session, deps }
}

const request = (versions: PdfPreviewVersionSnapshot = VERSIONS) => ({
  html: '<p>hi</p>',
  pageOptions: { pageSize: 'A4' },
  versions
})

describe('PdfPreviewSession generation', () => {
  it('reports real page metrics for the generated artifact', async() => {
    const { session, deps } = createSession()

    await session.requestPreview(request())

    expect(session.state.status).toBe('ready')
    expect(session.state.previewId).toBe('preview-1')
    expect(session.state.pageCount).toBe(3)
    expect(session.state.currentPage).toBe(1)
    expect(deps.generate).toHaveBeenCalledTimes(1)
    expect(deps.read).toHaveBeenCalledWith('preview-1')
  })

  it('sends the artifact version snapshot it rendered', async() => {
    const { session, deps } = createSession()
    await session.requestPreview(request())

    await session.save({ defaultPath: '/out/report.pdf' })

    expect(deps.save).toHaveBeenCalledWith(
      expect.objectContaining({
        previewId: 'preview-1',
        documentVersion: 'doc-1',
        settingsVersion: 'set-1',
        resourceVersion: 'res-1'
      })
    )
  })

  it('surfaces a generation failure and keeps no preview', async() => {
    const { session } = createSession({
      generate: vi.fn(async(): Promise<PdfPreviewGenerateResponse> => ({
        ok: false,
        code: 'generation-failed',
        message: 'print exploded'
      }))
    })

    await session.requestPreview(request())

    expect(session.state.status).toBe('failed')
    expect(session.state.error).toContain('print exploded')
    expect(session.state.previewId).toBeNull()
  })

  it('discards a late generation result that lost its turn', async() => {
    const gate = defer<PdfPreviewGenerateResponse>()
    const { session, deps } = createSession({ generate: () => gate.promise })

    const pending = session.requestPreview(request())
    await flush()
    session.invalidate('settings')
    expect(session.state.status).toBe('stale')
    expect(deps.cancel).toHaveBeenCalled()

    gate.resolve({ ok: true, previewId: 'late-preview', byteLength: 5 })
    await pending

    expect(session.state.status).toBe('stale')
    expect(session.state.previewId).toBeNull()
    expect(deps.release).toHaveBeenCalledWith('late-preview')
  })
})

describe('PdfPreviewSession staleness', () => {
  it('marks a ready preview stale when settings change', async() => {
    const { session } = createSession()
    await session.requestPreview(request())

    session.invalidate('settings')

    expect(session.state.status).toBe('stale')
  })

  it('refuses to save a stale preview', async() => {
    const { session, deps } = createSession()
    await session.requestPreview(request())
    session.invalidate('settings')

    const result = await session.save({ defaultPath: '/out/report.pdf' })

    expect(result).toBe('blocked')
    expect(deps.save).not.toHaveBeenCalled()
  })

  it('rejects a stale generation when the document changed mid-flight', async() => {
    const gate = defer<PdfPreviewGenerateResponse>()
    const { session, deps } = createSession({ generate: () => gate.promise })

    const pending = session.requestPreview(request())
    await flush()
    session.invalidate('document')
    gate.resolve({ ok: true, previewId: 'doc-race', byteLength: 5 })
    await pending

    expect(deps.release).toHaveBeenCalledWith('doc-race')
    expect(await session.save({ defaultPath: '/out/report.pdf' })).toBe('blocked')
  })
})

describe('PdfPreviewSession saving', () => {
  it('keeps the preview when the save dialog is canceled', async() => {
    const { session } = createSession({
      save: vi.fn(async(): Promise<PdfPreviewSaveResponse> => ({ ok: true, status: 'canceled' }))
    })
    await session.requestPreview(request())

    const result = await session.save({ defaultPath: '/out/report.pdf' })

    expect(result).toBe('canceled')
    expect(session.state.status).toBe('ready')
    expect(session.state.previewId).toBe('preview-1')
  })

  it('keeps the same preview and warning after a write failure, then retries', async() => {
    const save = vi
      .fn<() => Promise<PdfPreviewSaveResponse>>()
      .mockResolvedValueOnce({ ok: false, code: 'save-failed', message: 'EACCES' })
      .mockResolvedValueOnce({
        ok: true,
        status: 'saved',
        filePath: '/out/report.pdf',
        byteLength: 5
      })
    const { session } = createSession({ save })
    await session.requestPreview(request())

    expect(await session.save({ defaultPath: '/out/report.pdf' })).toBe('failed')
    expect(session.state.status).toBe('ready')
    expect(session.state.error).toContain('EACCES')

    expect(await session.save({ defaultPath: '/out/report.pdf' })).toBe('saved')
    expect(save).toHaveBeenCalledTimes(2)
  })
})

describe('PdfPreviewSession paging and teardown', () => {
  it('does not let a passive teardown interrupt a running generation', async () => {
    const gate = defer<PdfPreviewGenerateResponse>()
    const { session } = createSession({ generate: () => gate.promise })

    const pending = session.requestPreview(request())
    await flush()
    session.teardown()
    expect(session.state.status).toBe('generating')

    gate.resolve({ ok: true, previewId: 'preview-1', byteLength: 5 })
    await pending
    expect(session.state.status).toBe('ready')
  })

  it('starts a new generation even while the previous teardown is still pending', async () => {
    // Reproduced from the Electron E2E: closing the dialog awaited the PDF.js
    // teardown, and that late continuation reset the session to 'idle' after a
    // fresh generation had already started, so the preview silently never came.
    const slowDestroy = defer<void>()
    const secondGenerate = defer<PdfPreviewGenerateResponse>()
    let generateCalls = 0
    let openCalls = 0
    const { session } = createSession({
      generate: vi.fn(async(): Promise<PdfPreviewGenerateResponse> => {
        generateCalls += 1
        if (generateCalls === 1) {
          return { ok: true, previewId: 'preview-1', byteLength: 5 }
        }
        return await secondGenerate.promise
      }),
      openDocument: vi.fn(async() => {
        openCalls += 1
        return {
          numPages: 2,
          destroy: openCalls === 1 ? () => slowDestroy.promise : async() => {}
        }
      })
    })

    await session.requestPreview(request())
    expect(session.state.status).toBe('ready')

    session.close()
    const regenerating = session.requestPreview(request())

    // The new generation starts synchronously, without waiting for the old
    // PDF.js document to finish tearing down.
    expect(session.state.status).toBe('generating')
    slowDestroy.resolve()

    secondGenerate.resolve({ ok: true, previewId: 'preview-2', byteLength: 5 })
    await regenerating
    expect(session.state.status).toBe('ready')
    expect(session.state.previewId).toBe('preview-2')
  })


  it('clamps page navigation to the real page count', async() => {
    const { session } = createSession()
    await session.requestPreview(request())

    session.setPage(0)
    expect(session.state.currentPage).toBe(1)
    session.setPage(2)
    expect(session.state.currentPage).toBe(2)
    session.setPage(99)
    expect(session.state.currentPage).toBe(3)
  })

  it('cancels generation and releases the artifact on close', async() => {
    const gate = defer<PdfPreviewGenerateResponse>()
    const destroy = vi.fn(async() => {})
    const { session, deps } = createSession({
      generate: () => gate.promise,
      openDocument: vi.fn(async() => ({ numPages: 2, destroy }))
    })

    const pending = session.requestPreview(request())
    await flush()
    session.cancel()
    expect(deps.cancel).toHaveBeenCalled()
    expect(session.state.status).toBe('idle')

    gate.resolve({ ok: true, previewId: 'canceled-preview', byteLength: 5 })
    await pending
    expect(deps.release).toHaveBeenCalledWith('canceled-preview')

    await session.requestPreview(request())
    const currentPreviewId = session.state.previewId
    await session.close()
    expect(currentPreviewId).toBeTruthy()
    expect(deps.release).toHaveBeenCalledWith(currentPreviewId)
    expect(destroy).toHaveBeenCalled()
    expect(session.state.status).toBe('idle')
  })
})
