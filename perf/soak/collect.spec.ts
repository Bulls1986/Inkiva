import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { collectSoakReport } from './collect'

const withInputDirectory = (callback: (directory: string) => void): void => {
  const directory = mkdtempSync(join(tmpdir(), 'inkiva-perf-soak-'))
  try {
    callback(directory)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test('normalizes desktop trace and PERF-04 reports into median metrics', () => {
  withInputDirectory((directory) => {
    writeFileSync(
      join(directory, 'perf-04-large-document.json'),
      JSON.stringify({
        schemaVersion: 1,
        metrics: [
          {
            kind: 'small',
            openMs: 100,
            operations: [{ name: 'typing', durationMs: 20, longTasksOver50Ms: [{ duration: 60 }] }]
          }
        ]
      })
    )
    writeFileSync(
      join(directory, 'startup.json'),
      JSON.stringify({
        schemaVersion: 1,
        traces: [
          {
            events: [
              { name: 'app_shell_mounted', process: 'renderer', elapsedMs: 10 },
              { name: 'app_shell_mounted', process: 'renderer', elapsedMs: 30 }
            ]
          }
        ]
      })
    )

    const report = collectSoakReport('desktop', directory)

    assert.deepEqual(report.metrics, [
      { name: 'desktop.perf-04.small.open', unit: 'ms', value: 100 },
      { name: 'desktop.perf-04.small.typing', unit: 'ms', value: 20 },
      {
        name: 'desktop.perf-04.small.typing.long-tasks-over-50ms',
        unit: 'count',
        value: 1
      },
      { name: 'desktop.trace.renderer.app_shell_mounted.elapsedMs', unit: 'ms', value: 20 }
    ])
  })
})

test('accepts a Muya canonical report and preserves the schema contract', () => {
  withInputDirectory((directory) => {
    const inputPath = join(directory, 'muya-perf.json')
    writeFileSync(
      inputPath,
      JSON.stringify({
        schemaVersion: 1,
        suite: 'muya',
        generatedAt: '2026-09-14T00:00:00.000Z',
        metrics: [{ name: 'muya.perf.set-content.10000', unit: 'ms', value: 42 }]
      })
    )

    const report = collectSoakReport('muya', directory)

    assert.equal(report.schemaVersion, 1)
    assert.equal(report.suite, 'muya')
    assert.deepEqual(report.metrics, [
      { name: 'muya.perf.set-content.10000', unit: 'ms', value: 42 }
    ])
  })
})


test('fails closed when the input path does not yield metrics', () => {
  withInputDirectory((directory) => {
    assert.throws(
      () => collectSoakReport('desktop', join(directory, 'missing')),
      /no performance metrics/
    )
    writeFileSync(join(directory, 'ignored.txt'), 'not a report')
    assert.throws(() => collectSoakReport('desktop', directory), /no performance metrics/)
  })
})
