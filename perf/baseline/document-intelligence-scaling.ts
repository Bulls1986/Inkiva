import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

import { MarkdownLinkIndex } from '../../packages/desktop/src/main/documentIntelligence/markdownLinkIndex'

const COUNTS = [1000, 5000, 10000] as const
const SAMPLE_COUNT = 10

const percentile = (values: readonly number[], q: number): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const position = q * (sorted.length - 1)
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  const weight = position - lower
  return sorted[lower] + (sorted[upper] - sorted[lower]) * weight
}

const stats = (values: readonly number[]) => ({
  count: values.length,
  min: Math.min(...values),
  p50: percentile(values, 0.5),
  p95: percentile(values, 0.95),
  p99: percentile(values, 0.99),
  max: Math.max(...values),
  avg: values.reduce((sum, value) => sum + value, 0) / values.length
})

const snapshotMemory = () => {
  const memory = process.memoryUsage()
  return {
    rss: memory.rss,
    heapUsed: memory.heapUsed,
    heapTotal: memory.heapTotal,
    external: memory.external
  }
}

const cpuMs = (before: NodeJS.CpuUsage) => {
  const delta = process.cpuUsage(before)
  return (delta.user + delta.system) / 1000
}

const markdownFor = (index: number, count: number): string => {
  const next = (index + 1) % count
  return [
    '# Note ' + index,
    '',
    '[Target](./target.md)',
    '',
    '[Next](./note-' + String(next).padStart(5, '0') + '.md)',
    '',
    'body ' + index + ' '.repeat(8)
  ].join('\n')
}

const pathnameFor = (root: string, index: number) =>
  path.join(root, 'note-' + String(index).padStart(5, '0') + '.md')

const runSample = (count: number) => {
  global.gc?.()
  const root = path.resolve('perf-results', 'baseline-01', 'di-virtual-' + count)
  const target = path.join(root, 'target.md')
  const beforeMemory = snapshotMemory()
  const index = new MarkdownLinkIndex()

  const initialCpu = process.cpuUsage()
  const initialStarted = performance.now()
  for (let i = 0; i < count; i += 1) {
    index.updateDocument(pathnameFor(root, i), markdownFor(i, count))
  }
  index.updateDocument(target, '# Target\n')
  const initialIndexMs = performance.now() - initialStarted
  const initialCpuMs = cpuMs(initialCpu)
  const afterIndexMemory = snapshotMemory()

  const incrementalCount = Math.max(1, Math.floor(count * 0.01))
  const incrementalCpu = process.cpuUsage()
  const incrementalStarted = performance.now()
  for (let i = 0; i < incrementalCount; i += 1) {
    index.updateDocument(
      pathnameFor(root, i),
      markdownFor(i, count) + '\n\nincremental ' + i + '\n'
    )
  }
  const incrementalMs = performance.now() - incrementalStarted
  const incrementalCpuMs = cpuMs(incrementalCpu)

  const backlinkCpu = process.cpuUsage()
  const backlinkStarted = performance.now()
  const backlinks = index.getBacklinks(target)
  const backlinkRefreshMs = performance.now() - backlinkStarted
  const backlinkCpuMs = cpuMs(backlinkCpu)

  const beforeClearMemory = snapshotMemory()
  index.clear()
  global.gc?.()
  const afterClearMemory = snapshotMemory()

  return {
    initialIndexMs,
    initialCpuMs,
    incrementalCount,
    incrementalMs,
    incrementalCpuMs,
    backlinkRefreshMs,
    backlinkCpuMs,
    backlinkCount: backlinks.length,
    memory: {
      before: beforeMemory,
      afterIndex: afterIndexMemory,
      beforeClear: beforeClearMemory,
      afterClear: afterClearMemory,
      rssGrowthBytes: afterIndexMemory.rss - beforeMemory.rss,
      heapGrowthBytes: afterIndexMemory.heapUsed - beforeMemory.heapUsed,
      rssRetainedAfterClearBytes: afterClearMemory.rss - beforeMemory.rss,
      heapRetainedAfterClearBytes: afterClearMemory.heapUsed - beforeMemory.heapUsed
    }
  }
}

const raw: Record<string, unknown> = {}
const summary: Record<string, unknown> = {}

for (const count of COUNTS) {
  // One warmup removes import/JIT cold noise from the measured distribution.
  runSample(count)
  const samples = Array.from({ length: SAMPLE_COUNT }, () => runSample(count))
  raw[String(count)] = samples

  const values = <K extends keyof (typeof samples)[number]>(key: K) =>
    samples.map((sample) => sample[key] as number)

  summary[String(count)] = {
    samples: SAMPLE_COUNT,
    initialIndexMs: stats(values('initialIndexMs')),
    initialCpuMs: stats(values('initialCpuMs')),
    incrementalUpdateMs: stats(values('incrementalMs')),
    incrementalCpuMs: stats(values('incrementalCpuMs')),
    backlinkRefreshMs: stats(values('backlinkRefreshMs')),
    backlinkCpuMs: stats(values('backlinkCpuMs')),
    backlinkCount: stats(values('backlinkCount')),
    rssGrowthBytes: stats(samples.map((sample) => sample.memory.rssGrowthBytes)),
    heapGrowthBytes: stats(samples.map((sample) => sample.memory.heapGrowthBytes)),
    rssRetainedAfterClearBytes: stats(
      samples.map((sample) => sample.memory.rssRetainedAfterClearBytes)
    ),
    heapRetainedAfterClearBytes: stats(
      samples.map((sample) => sample.memory.heapRetainedAfterClearBytes)
    )
  }
}

const outputDir = path.resolve('perf-results', 'baseline-01', 'document-intelligence')
fs.mkdirSync(outputDir, { recursive: true })
fs.writeFileSync(path.join(outputDir, 'raw.json'), JSON.stringify(raw, null, 2) + '\n')
fs.writeFileSync(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify(summary, null, 2))
