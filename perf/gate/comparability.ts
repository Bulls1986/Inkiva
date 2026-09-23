import type { PerformanceGateReport } from './contract.js'

export interface BenchmarkComparability {
  comparable: boolean
  reasons: string[]
}

const compareRecord = (
  left: Record<string, string>,
  right: Record<string, string>,
  prefix: string,
  reasons: string[]
): void => {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  for (const key of [...keys].sort()) {
    if (left[key] !== right[key]) {
      reasons.push(prefix + '.' + key + ' differs')
    }
  }
}

export const compareBenchmarkReportsForPooling = (
  left: PerformanceGateReport,
  right: PerformanceGateReport
): BenchmarkComparability => {
  const reasons: string[] = []

  if (left.productVersion !== right.productVersion) reasons.push('productVersion differs')
  if (left.suite !== right.suite) reasons.push('suite differs')
  if (left.level !== right.level) reasons.push('level differs')

  compareRecord(left.environment, right.environment, 'environment', reasons)

  if (left.provenance === undefined || right.provenance === undefined) {
    reasons.push('provenance is missing')
  } else {
    if (left.provenance.tree === undefined || right.provenance.tree === undefined) {
      reasons.push('provenance.tree is missing')
    } else if (left.provenance.tree !== right.provenance.tree) {
      reasons.push('provenance.tree differs')
    }
    if (left.provenance.nodeVersion !== right.provenance.nodeVersion) {
      reasons.push('provenance.nodeVersion differs')
    }
    if (left.provenance.electronVersion !== right.provenance.electronVersion) {
      reasons.push('provenance.electronVersion differs')
    }
    if (left.provenance.graphicsBackend !== right.provenance.graphicsBackend) {
      reasons.push('provenance.graphicsBackend differs')
    }
    if (left.provenance.runMode !== right.provenance.runMode) {
      reasons.push('provenance.runMode differs')
    }
    if (left.provenance.warmState !== right.provenance.warmState) {
      reasons.push('provenance.warmState differs')
    }

    compareRecord(
      left.provenance.fixtureHashes ?? {},
      right.provenance.fixtureHashes ?? {},
      'provenance.fixtureHashes',
      reasons
    )
  }

  return { comparable: reasons.length === 0, reasons }
}
