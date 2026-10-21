import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { performance, monitorEventLoopDelay } from 'node:perf_hooks'

import { DocumentIntelligenceService } from '../../packages/desktop/src/main/documentIntelligence/documentIntelligenceService'

// Supplementary workstation observations, NOT the canonical Electron/reference gate.
// Keep populations stable across revisions: unopen sources, two links per source,
// one heading per source and one image reference per twenty sources.
const COUNTS = [1_000, 5_000, 20_000] as const
const SAMPLES = 5
const BATCH_SIZE = 64
const smoke = process.argv.includes('--smoke')
const populations = smoke ? COUNTS.slice(0, 1) : COUNTS
const repetitions = smoke ? 1 : SAMPLES

const filePath = (root: string, i: number): string => path.join(
  root, 'd' + String(Math.floor(i / 500)).padStart(3, '0'),
  'note-' + String(i).padStart(5, '0') + '.md'
)

const markdown = (i: number): string => {
  const groupStart = Math.floor(i / 500) * 500
  const peer = groupStart + ((i - groupStart + 1) % 500)
  return [
    '# Note ' + i,
    '',
    '[Peer](./note-' + String(peer).padStart(5, '0') + '.md)',
    '[Home](../d000/note-00000.md)',
    ...(i % 20 === 0 ? ['![Asset](../assets/asset-' + String(i).padStart(5, '0') + '.png)'] : []),
    '',
    'Unopened Markdown source ' + i
  ].join('\n') + '\n'
}

const prepare = async(root: string, count: number): Promise<string> => {
  const hash = createHash('sha256')
  await fs.mkdir(path.join(root, 'assets'), { recursive: true })
  for (let offset = 0; offset < count; offset += BATCH_SIZE) {
    const tasks = []
    for (let i = offset; i < Math.min(offset + BATCH_SIZE, count); i += 1) {
      const source = filePath(root, i)
      const content = markdown(i)
      hash.update(content)
      tasks.push(fs.mkdir(path.dirname(source), { recursive: true }).then(() =>
        fs.writeFile(source, content, 'utf8')))
      if (i % 20 === 0) {
        tasks.push(fs.writeFile(
          path.join(root, 'assets', 'asset-' + String(i).padStart(5, '0') + '.png'),
          Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex')
        ))
      }
    }
    await Promise.all(tasks)
  }
  return hash.digest('hex')
}

const cpuMs = (start: NodeJS.CpuUsage): number => {
  const delta = process.cpuUsage(start)
  return (delta.user + delta.system) / 1000
}

const run = async(root: string, count: number) => {
  const measurements = []
  for (let sample = 0; sample < repetitions; sample += 1) {
    global.gc?.()
    const service = new DocumentIntelligenceService({
      historyRootPath: path.join(root, '.history')
    })
    const eventLoop = monitorEventLoopDelay({ resolution: 10 })
    eventLoop.enable()
    const beforeCpu = process.cpuUsage()
    const started = performance.now()
    const result = await service.indexWorkspace(root, 11)
    const scanMs = performance.now() - started
    const scanCpuMs = cpuMs(beforeCpu)
    if (!result.complete || result.indexedFiles !== count) {
      throw new Error('Workspace scan not complete: ' + JSON.stringify(result))
    }

    const target = filePath(root, 0)
    const initialBacklinks = service.getBacklinks(target, 11).length
    if (initialBacklinks < count) {
      throw new Error('Backlinks are incomplete: ' + initialBacklinks + ' vs ' + count)
    }
    const first = filePath(root, count - 1)
    await fs.writeFile(first, markdown(count - 1) + '\nExternal edit ' + sample + '\n')
    const singleStart = performance.now()
    await service.refreshWorkspaceFile(first, 11)
    const singleRefreshMs = performance.now() - singleStart

    const burstPaths = Array.from({ length: BATCH_SIZE }, (_, i) => filePath(root, i))
    const burstStart = performance.now()
    await Promise.all(burstPaths.map((name) => service.refreshWorkspaceFile(name, 11)))
    const burstRefreshMs = performance.now() - burstStart
    const heapBeforeClose = process.memoryUsage().heapUsed
    service.closeScope(11)
    if (service.getBacklinks(target, 11).length !== 0) {
      throw new Error('A closed window still exposes workspace backlinks')
    }
    global.gc?.()
    const heapAfterClose = process.memoryUsage().heapUsed
    eventLoop.disable()
    measurements.push({
      sample,
      scanMs,
      scanCpuMs,
      indexedFiles: result.indexedFiles,
      initialBacklinks,
      singleRefreshMs,
      burstPaths: burstPaths.length,
      burstRefreshMs,
      eventLoopP99Ms: eventLoop.percentile(99) / 1e6,
      heapBeforeClose,
      heapAfterClose
    })
  }
  return measurements
}

const results: Record<string, unknown> = {}
for (const count of populations) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'inkiva-v06-13-'))
  try {
    const fixtureSha256 = await prepare(root, count)
    results[count] = { count, fixtureSha256, measurements: await run(root, count) }
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}
const report = {
  kind: 'v06-13-node-service-observation',
  qualification: 'non-reference; no native watcher or renderer measurement',
  smoke,
  machine: { platform: process.platform, arch: process.arch, node: process.version },
  gcEnabled: typeof global.gc === 'function',
  samplesPerPopulation: repetitions,
  results
}
const output = path.resolve('perf-results/v06-13/workspace-index', smoke ? 'smoke.json' : 'raw.json')
await fs.mkdir(path.dirname(output), { recursive: true })
await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ output, ...report }, null, 2))
