import { describe, expect, it, vi } from 'vitest'
import {
  PdfPreviewService,
  PdfPreviewError,
  type PdfPrintPage,
  type PdfPreviewServiceDeps
} from '../../../src/main/pdfPreview/pdfPreviewService'

// P1/P2/P3/P7 main-process half: one generated PDF must back both the preview
// bytes and the saved file, a single isolated print page must never run two
// print jobs at once, and stale/canceled/late results must never become the
// saved artifact.

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])
const KEY = { documentVersion: 'd1', settingsVersion: 's1', resourceVersion: 'r1' }

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

const defer = <T>(): Deferred<T> => {
  let resolveFn: ((value: T) => void) | undefined
  let rejectFn: ((error: unknown) => void) | undefined
  const promise = new Promise<T>((resolve, reject) => {
    resolveFn = resolve
    rejectFn = reject
  })
  return {
    promise,
    resolve: (value: T) => {
      resolveFn?.(value)
    },
    reject: (error: unknown) => {
      rejectFn?.(error)
    }
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

interface PageLog {
  events: string[]
  pages: PdfPrintPage[]
}

const createHarness = (options: {
  bytes?: Uint8Array
  printGate?: () => Promise<unknown>
  writeFile?: PdfPreviewServiceDeps['writeFile']
  showSaveDialog?: PdfPreviewServiceDeps['showSaveDialog']
  generationTimeoutMs?: number
  printOptions?: Record<string, unknown>[]
} = {}) => {
  const log: PageLog = { events: [], pages: [] }
  let idSeq = 0

  const deps: PdfPreviewServiceDeps = {
    createPrintPage: () => {
      idSeq += 1
      const id = 'page-' + idSeq
      log.events.push('create:' + id)
      let inFlight = 0
      let maxInFlight = 0
      const page: PdfPrintPage = {
        loadHtml: vi.fn(async() => {
          log.events.push('load:' + id)
        }),
        printToPdf: vi.fn(async(printOptions: Record<string, unknown>) => {
          inFlight += 1
          maxInFlight = Math.max(maxInFlight, inFlight)
          log.events.push('print:' + id)
          options.printOptions?.push(printOptions)
          try {
            if (options.printGate) await options.printGate()
            else await flush()
            return options.bytes ?? PDF_BYTES
          } finally {
            inFlight -= 1
          }
        }),
        destroy: vi.fn(async() => {
          log.events.push('destroy:' + id + '@' + maxInFlight)
        })
      }
      log.pages.push(page)
      return page
    },
    writeFile:
      options.writeFile ??
      (async() => {
        log.events.push('write')
      }),
    showSaveDialog:
      options.showSaveDialog ??
      (async() => ({ canceled: false, filePath: '/out/report.pdf' })),
    generationTimeoutMs: options.generationTimeoutMs ?? 2000,
    createPreviewId: () => 'preview-' + idSeq
  }

  const service = new PdfPreviewService(deps)
  return { service, log }
}

describe('PdfPreviewService generation', () => {
  it('keeps one artifact for preview reads and saves the same bytes to disk', async() => {
    const writes: Uint8Array[] = []
    const { service } = createHarness({
      writeFile: async(_path, data) => {
        writes.push(data)
      }
    })

    const preview = await service.generate({ ...KEY, html: '<p>hi</p>' })
    const previewBytes = service.read(preview.previewId)

    expect(previewBytes).toBeInstanceOf(Uint8Array)
    expect(Array.from(previewBytes!)).toEqual(Array.from(PDF_BYTES))

    const saved = await service.save({
      previewId: preview.previewId,
      ...KEY,
      defaultPath: '/out/report.pdf'
    })

    expect(saved).toMatchObject({ status: 'saved', filePath: '/out/report.pdf' })
    expect(writes).toHaveLength(1)
    expect(Array.from(writes[0]!)).toEqual(Array.from(PDF_BYTES))
    // Same artifact object identity: the save path must not re-render.
    expect(writes[0]).toBe(previewBytes)
  })

  it('asks for tagged output plus a document outline so bookmarks survive', async() => {
    const printOptions: Record<string, unknown>[] = []
    const { service } = createHarness({ printOptions })

    await service.generate({ ...KEY, html: '<p>hi</p>' })

    expect(printOptions).toHaveLength(1)
    expect(printOptions[0]).toMatchObject({
      generateTaggedPDF: true,
      generateDocumentOutline: true
    })
  })

  it('reports the artifact byte length without re-rendering', async() => {
    const { service, log } = createHarness()
    const preview = await service.generate({ ...KEY, html: '<p>hi</p>' })

    expect(preview.byteLength).toBe(PDF_BYTES.byteLength)
    expect(log.pages[0]!.printToPdf).toHaveBeenCalledTimes(1)
  })
})

describe('PdfPreviewService print-page isolation', () => {
  it('discards the superseded generation and only prints again after cleanup', async() => {
    const firstGate = defer<void>()
    let gateIndex = 0
    const { service, log } = createHarness({
      printGate: async() => {
        gateIndex += 1
        if (gateIndex === 1) await firstGate.promise
      }
    })

    const first = service.generate({ ...KEY, html: '<p>first</p>' })
    await flush()

    const second = service.generate({ ...KEY, html: '<p>second</p>' })
    await flush()

    firstGate.resolve()
    await expect(first).rejects.toMatchObject({ code: 'stale' })

    const preview = await second

    // Two isolated pages were created, the second only after the first had
    // been destroyed, and no page ever ran two print jobs concurrently.
    expect(log.pages).toHaveLength(2)
    const destroyAt = log.events.indexOf('destroy:page-1@1')
    const createSecondAt = log.events.indexOf('create:page-2')
    expect(destroyAt).toBeGreaterThanOrEqual(0)
    expect(createSecondAt).toBeGreaterThanOrEqual(0)
    expect(createSecondAt).toBeGreaterThan(destroyAt)
    expect(log.pages[0]!.printToPdf).toHaveBeenCalledTimes(1)
    expect(log.pages[1]!.printToPdf).toHaveBeenCalledTimes(1)
    expect(service.read(preview.previewId)).toBeInstanceOf(Uint8Array)
  })

  it('drops a late result that lands after the preview was canceled', async() => {
    const gate = defer<void>()
    const { service, log } = createHarness({ printGate: () => gate.promise })

    const pending = service.generate({ ...KEY, html: '<p>slow</p>' })
    await flush()
    service.cancel()

    gate.resolve()
    await expect(pending).rejects.toMatchObject({ code: 'stale' })

    expect(log.pages[0]!.destroy).toHaveBeenCalled()
    expect(service.read('preview-1')).toBeNull()
    await expect(
      service.save({ previewId: 'preview-1', ...KEY, defaultPath: '/out/report.pdf' })
    ).rejects.toMatchObject({ code: 'stale' })
  })

  it('fails a generation that exceeds its bounded timeout and cleans the page up', async() => {
    const { service, log } = createHarness({
      generationTimeoutMs: 20,
      printGate: () => new Promise(() => {})
    })

    await expect(service.generate({ ...KEY, html: '<p>hang</p>' })).rejects.toMatchObject({
      code: 'timeout'
    })

    expect(log.pages[0]!.destroy).toHaveBeenCalled()
  })

  it('finishes the generation even when the print page never reports destruction', async() => {
    // A hung teardown must not freeze the single print-page queue: the next
    // preview would otherwise wait behind it forever.
    const stuck: PdfPrintPage = {
      loadHtml: async() => {},
      printToPdf: async() => PDF_BYTES,
      destroy: () => new Promise<void>(() => {})
    }
    const service = new PdfPreviewService({
      createPrintPage: () => stuck,
      writeFile: async() => {},
      showSaveDialog: async() => ({ canceled: false, filePath: '/out/x.pdf' }),
      generationTimeoutMs: 2000,
      cleanupTimeoutMs: 20,
      createPreviewId: () => 'preview-stuck'
    })

    const outcome = await Promise.race([
      service.generate({ ...KEY, html: '<p>hi</p>' }),
      new Promise((resolve) => setTimeout(() => resolve('timed-out'), 400))
    ])

    expect(outcome).toMatchObject({ previewId: 'preview-stuck' })
    expect(service.read('preview-stuck')).toBeInstanceOf(Uint8Array)
  })

  it('cleans up the print page when generating the PDF fails', async() => {
    const { service, log } = createHarness()
    log.pages.length = 0
    const failing: PdfPrintPage = {
      loadHtml: async() => {},
      printToPdf: async() => {
        throw new Error('print exploded')
      },
      destroy: vi.fn(async() => {})
    }
    const serviceWithFailure = new PdfPreviewService({
      createPrintPage: () => failing,
      writeFile: async() => {},
      showSaveDialog: async() => ({ canceled: false, filePath: '/out/x.pdf' }),
      generationTimeoutMs: 2000,
      createPreviewId: () => 'preview-x'
    })

    await expect(
      serviceWithFailure.generate({ ...KEY, html: '<p>boom</p>' })
    ).rejects.toMatchObject({ code: 'generation-failed' })
    expect(failing.destroy).toHaveBeenCalledTimes(1)
    expect(serviceWithFailure.read('preview-x')).toBeNull()
  })
})

describe('PdfPreviewService save validity', () => {
  it('refuses to save when the document/settings/resources moved on', async() => {
    const { service } = createHarness()
    const preview = await service.generate({ ...KEY, html: '<p>hi</p>' })

    await expect(
      service.save({
        previewId: preview.previewId,
        ...KEY,
        settingsVersion: 's2',
        defaultPath: '/out/report.pdf'
      })
    ).rejects.toMatchObject({ code: 'stale' })
  })

  it('revalidates the artifact after the native save dialog returns', async() => {
    const dialog = defer<{ canceled: boolean; filePath?: string }>()
    const writeFile = vi.fn(async() => {})
    const { service } = createHarness({ showSaveDialog: () => dialog.promise, writeFile })

    const preview = await service.generate({ ...KEY, html: '<p>hi</p>' })
    const saving = service.save({
      previewId: preview.previewId,
      ...KEY,
      defaultPath: '/out/report.pdf'
    })
    await flush()

    // The document changed while the OS dialog was open.
    await service.generate({ ...KEY, settingsVersion: 's2', html: '<p>changed</p>' })
    dialog.resolve({ canceled: false, filePath: '/out/report.pdf' })

    await expect(saving).rejects.toMatchObject({ code: 'stale' })
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('keeps the artifact and allows a retry after a write failure', async() => {
    let attempt = 0
    const writeFile = vi.fn(async() => {
      attempt += 1
      if (attempt === 1) throw new Error('EACCES')
    })
    const { service } = createHarness({ writeFile })

    const preview = await service.generate({ ...KEY, html: '<p>hi</p>' })
    await expect(
      service.save({ previewId: preview.previewId, ...KEY, defaultPath: '/out/report.pdf' })
    ).rejects.toMatchObject({ code: 'save-failed' })

    expect(service.read(preview.previewId)).toBeInstanceOf(Uint8Array)

    const retry = await service.save({
      previewId: preview.previewId,
      ...KEY,
      defaultPath: '/out/report.pdf'
    })
    expect(retry).toMatchObject({ status: 'saved', filePath: '/out/report.pdf' })
    expect(writeFile).toHaveBeenCalledTimes(2)
  })

  it('treats a canceled save dialog as a no-op that keeps the preview', async() => {
    const { service } = createHarness({
      showSaveDialog: async() => ({ canceled: true })
    })
    const preview = await service.generate({ ...KEY, html: '<p>hi</p>' })

    const result = await service.save({
      previewId: preview.previewId,
      ...KEY,
      defaultPath: '/out/report.pdf'
    })

    expect(result).toEqual({ status: 'canceled' })
    expect(service.read(preview.previewId)).toBeInstanceOf(Uint8Array)
  })

  it('rejects an unknown preview id instead of writing something else', async() => {
    const writeFile = vi.fn(async() => {})
    const { service } = createHarness({ writeFile })

    await expect(
      service.save({ previewId: 'nope', ...KEY, defaultPath: '/out/report.pdf' })
    ).rejects.toBeInstanceOf(PdfPreviewError)
  })
})

describe('PdfPreviewService release', () => {
  it('drops the artifact so a released preview cannot be saved', async() => {
    const { service } = createHarness()
    const preview = await service.generate({ ...KEY, html: '<p>hi</p>' })

    service.release(preview.previewId)

    expect(service.read(preview.previewId)).toBeNull()
    await expect(
      service.save({ previewId: preview.previewId, ...KEY, defaultPath: '/out/report.pdf' })
    ).rejects.toMatchObject({ code: 'stale' })
  })
})
