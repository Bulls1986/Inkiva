import {
  validateReferenceEnvironment,
  type GateLevel,
  type PerformanceGateEnvironment,
  type PerformanceGateProvenance
} from './contract.js'
import type { PerformanceGateReportMetadata } from './runner.js'

export const createPerformanceGateMetadata = (
  environment: unknown,
  level: GateLevel,
  productVersion: string,
  suite = 'inkiva-reference-gate',
  provenance?: PerformanceGateProvenance
): PerformanceGateReportMetadata => {
  validateReferenceEnvironment(environment)
  if (productVersion.trim() === '') {
    throw new Error('productVersion must be a non-empty string')
  }
  if (suite.trim() === '') {
    throw new Error('suite must be a non-empty string')
  }
  return {
    productVersion,
    suite,
    level,
    environment: environment as PerformanceGateEnvironment,
    ...(provenance === undefined ? {} : { provenance })
  }
}
