import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  PerformanceReportStore,
  PerformanceReportWriter,
  type PerformanceReportFileSystem
} from 'main_renderer/performance/report-store'
import {
  PERFORMANCE_TRACE_SCHEMA_VERSION,
  type PerformanceEvent,
  type PerformanceTrace
} from '@shared/types/performance'

const outputDirectory = '/virtual/perf-results'

function createFileSystem() {
  const files = new Map<string, string>()
  const mkdir = vi.fn<PerformanceReportFileSystem['mkdir']>(async() => undefined)
  const writeFile = vi.fn<PerformanceReportFileSystem['writeFile']>(async(filePath, content) => {
    files.set(filePath, content)
  })

  return {
    files,
    mkdir,
    writeFile,
    fs: { mkdir, writeFile }
  }
}

function createEvent(
  phase: string,
  traceId = 'trace-1',
  timestampEpochMs = 1_000
): PerformanceEvent {
  return {
    schemaVersion: PERFORMANCE_TRACE_SCHEMA_VERSION,
    name: 'long_task',
    process: 'renderer',
    // The runtime writer must remain safe if a newer phase reaches it before
    // the shared contract is updated.
    phase: phase as PerformanceEvent['phase'],
    traceId,
    timestampEpochMs,
    durationMs: 1
  }
}

function createTrace(phases: string[]): PerformanceTrace {
  return {
    schemaVersion: PERFORMANCE_TRACE_SCHEMA_VERSION,
    traceId: 'trace-1',
    process: 'renderer',
    startedAtEpochMs: 900,
    timeOriginEpochMs: 800,
    events: phases.map((phase, index) => createEvent(phase, 'trace-1', 1_000 + index))
  }
}

function readReport(files: Map<string, string>, category: string) {
  const content = files.get(join(outputDirectory, `${category}.json`))
  expect(content).toBeDefined()
  return JSON.parse(content as string) as {
    schemaVersion: number
    generatedAtEpochMs: number
    traces: PerformanceTrace[]
  }
}

describe('PerformanceReportStore', () => {
  it('does not touch the filesystem unless enabled is explicitly true', async() => {
    const { fs, mkdir, writeFile } = createFileSystem()
    const store = new PerformanceReportStore({
      outputDirectory,
      fs
    })

    store.recordTrace(createTrace(['startup', 'editor']))

    await expect(store.flush()).resolves.toEqual({
      ok: true,
      status: 'disabled',
      written: false,
      files: []
    })
    expect(mkdir).not.toHaveBeenCalled()
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('writes valid, independently categorized JSON reports', async() => {
    const { files, fs, mkdir, writeFile } = createFileSystem()
    const store = new PerformanceReportStore({
      enabled: true,
      outputDirectory,
      fs,
      now: () => 12_345
    })

    store.recordTrace(
      createTrace([
        'startup',
        'document-open',
        'editor',
        'search',
        'diagram',
        'memory',
        'future-phase'
      ])
    )

    await expect(store.flush()).resolves.toMatchObject({
      ok: true,
      status: 'written',
      written: true
    })
    expect(mkdir).toHaveBeenCalledTimes(1)
    expect(mkdir).toHaveBeenCalledWith(outputDirectory, { recursive: true })
    expect(writeFile).toHaveBeenCalledTimes(4)

    const startup = readReport(files, 'startup')
    const editor = readReport(files, 'editor')
    const diagrams = readReport(files, 'diagrams')
    const memory = readReport(files, 'memory')

    for (const report of [startup, editor, diagrams, memory]) {
      expect(report.schemaVersion).toBe(PERFORMANCE_TRACE_SCHEMA_VERSION)
      expect(report.generatedAtEpochMs).toBe(12_345)
      expect(report.traces).toHaveLength(1)
      expect(report.traces[0].events).not.toHaveLength(0)
    }

    // Unknown phases are deliberately retained and safely assigned to startup.
    expect(startup.traces[0].events.map((event) => event.phase)).toEqual([
      'startup',
      'document-open',
      'future-phase'
    ])
    expect(editor.traces[0].events.map((event) => event.phase)).toEqual(['editor', 'search'])
    expect(diagrams.traces[0].events.map((event) => event.phase)).toEqual(['diagram'])
    expect(memory.traces[0].events.map((event) => event.phase)).toEqual(['memory'])
  })

  it('publishes complete JSON atomically with the default filesystem writer', async() => {
    const directory = await mkdtemp(join(tmpdir(), 'inkiva-perf-report-'))
    try {
      const writer = new PerformanceReportWriter({ enabled: true, outputDirectory: directory })
      const report = {
        schemaVersion: PERFORMANCE_TRACE_SCHEMA_VERSION,
        generatedAtEpochMs: 12_345,
        traces: [createTrace(['startup'])]
      }

      await expect(writer.write(report)).resolves.toMatchObject({
        ok: true,
        status: 'written',
        written: true
      })

      const files = await readdir(directory)
      expect(files).toEqual(['startup.json'])
      await expect(readFile(join(directory, 'startup.json'), 'utf8')).resolves.toSatisfy((content) => {
        expect(() => JSON.parse(content)).not.toThrow()
        return true
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('returns a directory error without hiding it or attempting a write', async() => {
    const { fs, mkdir, writeFile } = createFileSystem()
    const error = new Error('cannot create performance directory')
    mkdir.mockRejectedValue(error)
    const store = new PerformanceReportStore({
      enabled: true,
      outputDirectory,
      fs
    })
    store.recordTrace(createTrace(['startup']))

    const result = await store.flush()

    expect(result).toMatchObject({
      ok: false,
      status: 'error',
      operation: 'mkdir',
      directory: outputDirectory,
      error
    })
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('returns the write error and the affected category when a file fails', async() => {
    const { fs, files, writeFile } = createFileSystem()
    const error = new Error('cannot write performance report')
    writeFile.mockImplementation(async(filePath, content) => {
      if (filePath === join(outputDirectory, 'editor.json')) {
        throw error
      }
      files.set(filePath, content)
    })
    const store = new PerformanceReportStore({
      enabled: true,
      outputDirectory,
      fs
    })
    store.recordTrace(createTrace(['startup', 'editor']))

    const result = await store.flush()

    expect(result).toMatchObject({
      ok: false,
      status: 'error',
      operation: 'write',
      category: 'editor',
      filePath: join(outputDirectory, 'editor.json'),
      error
    })
    expect(files.has(join(outputDirectory, 'startup.json'))).toBe(true)
    expect(files.has(join(outputDirectory, 'editor.json'))).toBe(false)
  })

  it('does not duplicate writes on repeated flush and writes again after new data', async() => {
    const { fs, mkdir, writeFile } = createFileSystem()
    const store = new PerformanceReportStore({
      enabled: true,
      outputDirectory,
      fs,
      now: () => 12_345
    })
    store.recordTrace(createTrace(['startup']))

    await expect(store.flush()).resolves.toMatchObject({
      ok: true,
      status: 'written',
      written: true
    })
    await expect(store.flush()).resolves.toEqual({
      ok: true,
      status: 'unchanged',
      written: false,
      files: []
    })

    expect(mkdir).toHaveBeenCalledTimes(1)
    expect(writeFile).toHaveBeenCalledTimes(1)

    store.recordEvent(createEvent('memory'))
    await expect(store.flush()).resolves.toMatchObject({
      ok: true,
      status: 'written',
      written: true
    })
    expect(mkdir).toHaveBeenCalledTimes(2)
    expect(writeFile).toHaveBeenCalledTimes(3)
    expect(writeFile).toHaveBeenCalledWith(
      join(outputDirectory, 'startup.json'),
      expect.any(String),
      { encoding: 'utf8' }
    )
    expect(writeFile).toHaveBeenCalledWith(
      join(outputDirectory, 'memory.json'),
      expect.any(String),
      { encoding: 'utf8' }
    )
  })
})
