import { describe, expect, it } from 'vitest'
import {
  createLargeDocumentFixture,
  extremeLargeDocumentFixtures,
  standardLargeDocumentFixtures
} from '../../performance/fixtures'

describe('PERF-04 large-document fixtures', () => {
  it('provides deterministic size tiers with representative Markdown markers', () => {
    const fixtures = standardLargeDocumentFixtures()
    expect(fixtures.map(({ kind }) => kind)).toEqual(['small', 'medium', 'large'])
    expect(fixtures.map(({ bytes }) => bytes)).toEqual(
      fixtures.map(({ markdown }) => new TextEncoder().encode(markdown).byteLength)
    )
    expect(fixtures[0].bytes).toBeGreaterThanOrEqual(100 * 1024)
    expect(fixtures[1].bytes).toBeGreaterThanOrEqual(1024 * 1024)
    expect(fixtures[2].bytes).toBeGreaterThanOrEqual(5 * 1024 * 1024)
    for (const fixture of fixtures) {
      expect(fixture.markdown).toContain('# Inkiva large-document performance fixture')
      expect(fixture.markers).toEqual(expect.arrayContaining(['heading', 'paragraph']))
    }
  })

  it('covers the extreme structures without external fixture files', () => {
    const fixtures = extremeLargeDocumentFixtures()
    expect(fixtures.map(({ kind }) => kind)).toEqual([
      'long-paragraph',
      'huge-table',
      'deep-lists',
      'many-headings',
      'many-code-blocks',
      'many-images',
      'many-diagrams'
    ])
    for (const fixture of fixtures) {
      expect(fixture.bytes).toBeGreaterThan(0)
      expect(fixture.markers).toHaveLength(1)
      expect(fixture.markdown).toContain(
        fixture.markers[0] === 'table' ? '| Column A |' : '# Inkiva extreme'
      )
    }
  })

  it('keeps fixture output stable for a repeated request', () => {
    const mediumA = createLargeDocumentFixture('medium')
    const mediumB = createLargeDocumentFixture('medium')
    expect(mediumA.bytes).toBe(mediumB.bytes)
    expect(mediumA.markdown).toBe(mediumB.markdown)

    const diagramsA = createLargeDocumentFixture('many-diagrams')
    const diagramsB = createLargeDocumentFixture('many-diagrams')
    expect(diagramsA).toEqual(diagramsB)
  })
})
