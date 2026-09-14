import type { LargeGateLevel } from './large-scenarios.js'

export const LARGE_GATE_SAMPLE_COUNT = 20 as const

export interface LargeGateCollectionContract {
  level: LargeGateLevel
  rawFile: string
  baselineFile: string | null
  minimumSamples: number
}

export const parseLargeGateLevels = (value: string | undefined): LargeGateLevel[] => {
  if (value === undefined || value.trim() === '') return ['P1', 'P2']

  const levels = new Set<LargeGateLevel>()
  for (const token of value.split(',')) {
    const level = token.trim()
    if (level !== 'P1' && level !== 'P2' && level !== 'P3') {
      throw new Error('large gate level is unknown: ' + level + '; expected P1, P2, or P3')
    }
    levels.add(level)
  }

  return (['P1', 'P2', 'P3'] as const).filter((level) => levels.has(level))
}

export const getLargeGateCollectionContract = (
  level: LargeGateLevel
): LargeGateCollectionContract => ({
  level,
  rawFile: level + '.raw.json',
  baselineFile: level === 'P2' ? 'P0.report.json' : null,
  minimumSamples: LARGE_GATE_SAMPLE_COUNT
})
