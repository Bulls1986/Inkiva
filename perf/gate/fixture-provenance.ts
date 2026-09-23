import {
  createHeadingStormFixture,
  createMarkdownFixture,
  type HeadingStormCount,
  type MarkdownDocumentTier
} from './fixtures.js'
import { getLargeGateScenario, type LargeGateLevel } from './large-scenarios.js'
import type { GateLevel } from './contract.js'

const markdownTiers = new Set<MarkdownDocumentTier>(['regular', '50k', '100k', '500k', '1m'])
const headingCounts = new Set<HeadingStormCount>([500, 2000, 5000, 10000])

const knownFixtureHash = (fixtureId: string): string | undefined => {
  const markdown = fixtureId.match(/^(regular|50k|100k|500k|1m)-markdown$/)
  if (markdown) {
    const tier = markdown[1] as MarkdownDocumentTier
    if (markdownTiers.has(tier)) return createMarkdownFixture(tier).contentHash
  }

  const tabs = fixtureId.match(/^8x(50k|100k)-tabs$/)
  if (tabs) {
    const tier = tabs[1] as MarkdownDocumentTier
    if (markdownTiers.has(tier)) return createMarkdownFixture(tier).contentHash
  }

  const heading = fixtureId.match(/^(\d+)k-heading-storm$/)
  if (heading) {
    const count = Number(heading[1]) * 1000
    if (headingCounts.has(count as HeadingStormCount)) {
      return createHeadingStormFixture(count as HeadingStormCount).contentHash
    }
  }

  return undefined
}

export const getFastFixtureHashes = (): Record<string, string> => ({
  '50k-markdown': createMarkdownFixture('50k').contentHash,
  'regular-markdown': createMarkdownFixture('regular').contentHash
})

export const getReferenceFixtureHashes = (level: GateLevel): Record<string, string> => {
  if (level === 'P0') {
    return { 'regular-markdown': createMarkdownFixture('regular').contentHash }
  }

  const fixtureHashes: Record<string, string> = {}
  for (const fixtureId of getLargeGateScenario(level as LargeGateLevel).fixtures) {
    const hash = knownFixtureHash(fixtureId)
    if (hash !== undefined) fixtureHashes[fixtureId] = hash
  }
  return fixtureHashes
}
