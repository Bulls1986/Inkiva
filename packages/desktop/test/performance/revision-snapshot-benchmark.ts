import { performance } from 'node:perf_hooks'
import { DocumentRevisionSnapshotCache } from '../../src/renderer/src/services/documentRevisionSnapshot'

interface BenchmarkResult {
  chars: number
  noCacheMsPerOp: number
  cacheMissMs: number
  cacheHitMsPerOp: number
  cacheHitSpeedupVsNoCache: number
}

let checksumSink = 0

const buildDocument = (chars: number): string => {
  const line = '## Revision snapshot benchmark\nThe quick brown fox jumps over the lazy dog.\n'
  return line.repeat(Math.ceil(chars / line.length)).slice(0, chars)
}

// This deliberately models the unavoidable O(document) traversal performed by
// serialization without claiming to benchmark Muya's complete renderer. It is
// a local cache-path benchmark only.
const fullDocumentTraversal = (source: string): string => {
  let checksum = 2166136261
  for (let i = 0; i < source.length; i += 1) {
    checksum ^= source.charCodeAt(i)
    checksum = Math.imul(checksum, 16777619)
  }
  checksumSink ^= checksum >>> 0
  return source
}

const measure = (iterations: number, run: () => void): number => {
  const started = performance.now()
  for (let i = 0; i < iterations; i += 1) run()
  return (performance.now() - started) / iterations
}

const runCase = (chars: number): BenchmarkResult => {
  const source = buildDocument(chars)
  const noCacheMsPerOp = measure(10, () => {
    fullDocumentTraversal(source)
  })

  const cache = new DocumentRevisionSnapshotCache({ maxCost: chars * 4 })
  const revision = cache.advanceContentRevision('benchmark.md')
  const missStarted = performance.now()
  cache.getMarkdown('benchmark.md', revision, () => fullDocumentTraversal(source))
  const cacheMissMs = performance.now() - missStarted

  const cacheHitMsPerOp = measure(10_000, () => {
    cache.getMarkdown('benchmark.md', revision, () => {
      throw new Error('cache-hit benchmark unexpectedly recomputed Markdown')
    })
  })

  return {
    chars,
    noCacheMsPerOp,
    cacheMissMs,
    cacheHitMsPerOp,
    cacheHitSpeedupVsNoCache: noCacheMsPerOp / Math.max(cacheHitMsPerOp, Number.EPSILON)
  }
}

const results = [50_000, 500_000, 1_000_000].map(runCase)
console.log(
  JSON.stringify({ benchmark: 'revision-snapshot-local-cache', results, checksumSink }, null, 2)
)
