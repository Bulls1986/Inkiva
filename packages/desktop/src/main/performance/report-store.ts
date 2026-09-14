import { mkdir as createDirectory, writeFile as writeTextFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  PERFORMANCE_TRACE_SCHEMA_VERSION,
  type PerformanceEvent,
  type PerformanceReport,
  type PerformanceTrace
} from '@shared/types/performance'

export const PERFORMANCE_REPORT_CATEGORIES = ['startup', 'editor', 'diagrams', 'memory'] as const

export type PerformanceReportCategory = (typeof PERFORMANCE_REPORT_CATEGORIES)[number]

/**
 * The shared contract currently narrows phase to its known catalog. Keeping
 * the input phase as a string here lets the writer safely handle a newer
 * producer before the shared contract has been updated.
 */
export type PerformanceEventInput = Omit<PerformanceEvent, 'phase'> & {
  phase: string
}

export type PerformanceTraceInput = Omit<PerformanceTrace, 'events'> & {
  events: PerformanceEventInput[]
}

export type PerformanceReportInput = Omit<PerformanceReport, 'traces'> & {
  traces: PerformanceTraceInput[]
}

export type PerformanceReportMkdir = (
  directory: string,
  options: { recursive: true }
) => Promise<unknown>

export type PerformanceReportWriteFile = (
  filePath: string,
  content: string,
  options: { encoding: 'utf8' }
) => Promise<void>

export interface PerformanceReportFileSystem {
  mkdir: PerformanceReportMkdir
  writeFile: PerformanceReportWriteFile
}

export interface PerformanceReportWriterOptions {
  enabled?: boolean
  outputDirectory?: string
  fs?: Partial<PerformanceReportFileSystem>
  mkdir?: PerformanceReportMkdir
  writeFile?: PerformanceReportWriteFile
}

export type PerformanceReportWriteResult =
  | {
    ok: true
    status: 'disabled' | 'empty'
    written: false
    files: []
  }
  | {
    ok: true
    status: 'written'
    written: true
    files: string[]
  }
  | {
    ok: false
    status: 'error'
    written: false
    operation: 'mkdir' | 'serialize' | 'write'
    directory?: string
    category?: PerformanceReportCategory
    filePath?: string
    files: string[]
    error: unknown
  }

export type PerformanceReportFlushResult =
  | PerformanceReportWriteResult
  | {
    ok: true
    status: 'unchanged'
    written: false
    files: []
  }

export interface PerformanceReportStoreOptions extends PerformanceReportWriterOptions {
  now?: () => number
  writer?: Pick<PerformanceReportWriter, 'write'>
}

const defaultFileSystem: PerformanceReportFileSystem = {
  mkdir: async(directory, options) => {
    await createDirectory(directory, options)
  },
  writeFile: async(filePath, content, options) => {
    await writeTextFile(filePath, content, options)
  }
}

const disabledResult = (): PerformanceReportWriteResult => ({
  ok: true,
  status: 'disabled',
  written: false,
  files: []
})

const emptyResult = (): PerformanceReportWriteResult => ({
  ok: true,
  status: 'empty',
  written: false,
  files: []
})

const unchangedResult = (): PerformanceReportFlushResult => ({
  ok: true,
  status: 'unchanged',
  written: false,
  files: []
})

/**
 * Maps the shared event phases to the four on-disk report categories.
 * Unknown phases intentionally fall back to startup so a newer producer
 * cannot make report capture fail.
 */
export const performanceReportCategoryForPhase = (phase: string): PerformanceReportCategory => {
  switch (phase) {
    case 'startup':
    case 'document-open':
      return 'startup'
    case 'editor':
    case 'search':
    case 'autosave':
      return 'editor'
    case 'diagram':
    case 'diagrams':
      return 'diagrams'
    case 'memory':
      return 'memory'
    default:
      return 'startup'
  }
}

const cloneEvent = (event: PerformanceEventInput): PerformanceEventInput => ({
  ...event,
  ...(event.metadata === undefined ? {} : { metadata: { ...event.metadata } })
})

const cloneTrace = (trace: PerformanceTraceInput): PerformanceTraceInput => ({
  ...trace,
  events: Array.isArray(trace.events) ? trace.events.map(cloneEvent) : []
})

interface CategorizedReport {
  category: PerformanceReportCategory
  report: PerformanceReportInput
}

const categorizeReport = (report: PerformanceReportInput): CategorizedReport[] => {
  const grouped = new Map<PerformanceReportCategory, Map<string, PerformanceTraceInput>>()

  for (const category of PERFORMANCE_REPORT_CATEGORIES) {
    grouped.set(category, new Map())
  }

  const traces = Array.isArray(report.traces) ? report.traces : []
  for (const trace of traces) {
    const events = Array.isArray(trace.events) ? trace.events : []
    for (const event of events) {
      const category = performanceReportCategoryForPhase(event.phase)
      const categoryTraces = grouped.get(category) as Map<string, PerformanceTraceInput>
      let categoryTrace = categoryTraces.get(trace.traceId)

      if (!categoryTrace) {
        categoryTrace = {
          ...trace,
          events: []
        }
        categoryTraces.set(trace.traceId, categoryTrace)
      }

      categoryTrace.events.push(cloneEvent(event))
    }
  }

  return PERFORMANCE_REPORT_CATEGORIES.flatMap((category) => {
    const tracesForCategory = Array.from(
      (grouped.get(category) as Map<string, PerformanceTraceInput>).values()
    )

    if (tracesForCategory.length === 0) {
      return []
    }

    return [
      {
        category,
        report: {
          schemaVersion: PERFORMANCE_TRACE_SCHEMA_VERSION,
          generatedAtEpochMs: report.generatedAtEpochMs,
          traces: tracesForCategory
        }
      }
    ]
  })
}

export class PerformanceReportWriter {
  private readonly enabled: boolean
  private readonly outputDirectory: string
  private readonly mkdir: PerformanceReportMkdir
  private readonly writeFile: PerformanceReportWriteFile

  constructor(options: PerformanceReportWriterOptions = {}) {
    const injectedFileSystem = options.fs ?? {}

    this.enabled = options.enabled === true
    this.outputDirectory = options.outputDirectory ?? join(process.cwd(), 'perf-results')
    this.mkdir = options.mkdir ?? injectedFileSystem.mkdir ?? defaultFileSystem.mkdir
    this.writeFile =
      options.writeFile ?? injectedFileSystem.writeFile ?? defaultFileSystem.writeFile
  }

  async write(report: PerformanceReportInput): Promise<PerformanceReportWriteResult> {
    if (!this.enabled) {
      return disabledResult()
    }

    let categorizedReports: CategorizedReport[]
    try {
      categorizedReports = categorizeReport(report)
    } catch (error) {
      return {
        ok: false,
        status: 'error',
        written: false,
        operation: 'serialize',
        files: [],
        error
      }
    }

    if (categorizedReports.length === 0) {
      return emptyResult()
    }

    try {
      await this.mkdir(this.outputDirectory, { recursive: true })
    } catch (error) {
      return {
        ok: false,
        status: 'error',
        written: false,
        operation: 'mkdir',
        directory: this.outputDirectory,
        files: [],
        error
      }
    }

    const writtenFiles: string[] = []
    for (const { category, report: categoryReport } of categorizedReports) {
      const filePath = join(this.outputDirectory, `${category}.json`)
      let content: string

      try {
        // One JSON.stringify call produces the complete document passed to
        // writeFile. No streaming or partial report writes are used.
        content = `${JSON.stringify(categoryReport, null, 2)}\n`
      } catch (error) {
        return {
          ok: false,
          status: 'error',
          written: false,
          operation: 'serialize',
          category,
          filePath,
          files: writtenFiles,
          error
        }
      }

      try {
        await this.writeFile(filePath, content, { encoding: 'utf8' })
      } catch (error) {
        return {
          ok: false,
          status: 'error',
          written: false,
          operation: 'write',
          category,
          filePath,
          files: writtenFiles,
          error
        }
      }

      writtenFiles.push(filePath)
    }

    return {
      ok: true,
      status: 'written',
      written: true,
      files: writtenFiles
    }
  }
}

export class PerformanceReportStore {
  private readonly enabled: boolean
  private readonly now: () => number
  private readonly writer: Pick<PerformanceReportWriter, 'write'>
  private readonly traces = new Map<string, PerformanceTraceInput>()
  private revision = 0
  private flushedRevision = -1
  private flushPromise: Promise<PerformanceReportFlushResult> | undefined

  constructor(options: PerformanceReportStoreOptions = {}) {
    this.enabled = options.enabled === true
    this.now = options.now ?? Date.now
    this.writer =
      options.writer ??
      new PerformanceReportWriter({
        ...options,
        enabled: this.enabled
      })
  }

  recordTrace(trace: PerformanceTraceInput): void {
    this.traces.set(trace.traceId, cloneTrace(trace))
    this.revision += 1
  }

  addTrace(trace: PerformanceTraceInput): void {
    this.recordTrace(trace)
  }

  recordEvent(event: PerformanceEventInput): void {
    const currentTrace = this.traces.get(event.traceId)
    if (currentTrace) {
      currentTrace.events.push(cloneEvent(event))
    } else {
      this.traces.set(event.traceId, {
        schemaVersion: PERFORMANCE_TRACE_SCHEMA_VERSION,
        traceId: event.traceId,
        process: event.process,
        startedAtEpochMs: event.timestampEpochMs,
        timeOriginEpochMs: event.timestampEpochMs,
        events: [cloneEvent(event)]
      })
    }
    this.revision += 1
  }

  addEvent(event: PerformanceEventInput): void {
    this.recordEvent(event)
  }

  snapshot(): PerformanceReportInput {
    return {
      schemaVersion: PERFORMANCE_TRACE_SCHEMA_VERSION,
      generatedAtEpochMs: this.now(),
      traces: Array.from(this.traces.values(), cloneTrace)
    }
  }

  flush(): Promise<PerformanceReportFlushResult> {
    if (!this.enabled) {
      return Promise.resolve(disabledResult())
    }

    if (this.flushPromise) {
      return this.flushPromise
    }

    if (this.revision === this.flushedRevision) {
      return Promise.resolve(unchangedResult())
    }

    const revisionBeingFlushed = this.revision
    const report = this.snapshot()

    if (report.traces.every((trace) => trace.events.length === 0)) {
      this.flushedRevision = revisionBeingFlushed
      return Promise.resolve(emptyResult())
    }

    const writePromise = Promise.resolve()
      .then(() => this.writer.write(report))
      .catch(
        (error): PerformanceReportWriteResult => ({
          ok: false,
          status: 'error',
          written: false,
          operation: 'write',
          files: [],
          error
        })
      )
      .then((result) => {
        if (result.ok && (result.status === 'written' || result.status === 'empty')) {
          // If events arrived during the write, only the captured revision is
          // marked flushed. The next explicit flush will include the new data.
          this.flushedRevision = revisionBeingFlushed
        }
        return result
      })

    this.flushPromise = writePromise.finally(() => {
      this.flushPromise = undefined
    })

    return this.flushPromise
  }
}

export const writePerformanceReports = (
  report: PerformanceReportInput,
  options: PerformanceReportWriterOptions = {}
): Promise<PerformanceReportWriteResult> => new PerformanceReportWriter(options).write(report)
