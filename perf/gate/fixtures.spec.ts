import assert from 'node:assert/strict'
import test from 'node:test'

import {
  HEADING_STORM_COUNTS,
  MARKDOWN_DOCUMENT_SPECS,
  REQUIRED_MARKDOWN_FEATURES,
  WORKSPACE_NODE_COUNTS,
  countBlocks,
  countHeadings,
  createAllHeadingStormFixtures,
  createAllMarkdownFixtures,
  createAllWorkspaceFixtures,
  createMarkdownFixture,
  createWorkspaceFixture,
  virtualizedRowBudget,
} from './fixtures.js'

const fence = String.fromCharCode(96).repeat(3)

const featurePatterns: Record<(typeof REQUIRED_MARKDOWN_FEATURES)[number], RegExp> = {
  heading: /^#\s+/m,
  list: /^-\s+/m,
  table: /^\|.+\|$/m,
  'code-block': new RegExp(fence + 'ts'),
  quote: /^>\s+/m,
  link: /\[[^\]]+\]\([^)]+)/,
  image: /!\[[^\]]*\]\([^)]+)/,
  diagram: new RegExp(fence + 'mermaid'),
  'inline-format': /\*\*.+\*\*|\*[^*]+\*/,
}

test('document fixtures match exact character targets and required structures', () => {
  const fixtures = createAllMarkdownFixtures()
  assert.equal(fixtures.length, Object.keys(MARKDOWN_DOCUMENT_SPECS).length)

  for (const fixture of fixtures) {
    const specification = MARKDOWN_DOCUMENT_SPECS[fixture.tier]
    assert.equal(fixture.actualChars, specification.targetChars)
    assert.equal(fixture.markdown.length, specification.targetChars)
    assert.ok(fixture.headingCount >= specification.minimumHeadings)
    assert.equal(fixture.headingCount, countHeadings(fixture.markdown))
    assert.equal(fixture.blockCount, countBlocks(fixture.markdown))
    for (const feature of REQUIRED_MARKDOWN_FEATURES) {
      assert.match(fixture.markdown, featurePatterns[feature], fixture.tier + ' lacks ' + feature)
    }
  }

  const regular = createMarkdownFixture('regular')
  assert.ok(regular.headingCount <= 200)
  assert.ok(regular.blockCount <= 500)

  const fiftyK = createMarkdownFixture('50k')
  assert.ok(fiftyK.headingCount >= 300)
  assert.ok(fiftyK.blockCount >= 500)
})

test('document fixtures are deterministic across repeated generation', () => {
  const first = createMarkdownFixture('500k')
  const second = createMarkdownFixture('500k')
  assert.equal(first.actualChars, second.actualChars)
  assert.equal(first.headingCount, second.headingCount)
  assert.equal(first.blockCount, second.blockCount)
  assert.equal(first.markdown, second.markdown)
})

test('heading storm fixtures contain exactly the requested heading count', () => {
  const fixtures = createAllHeadingStormFixtures()
  assert.deepEqual(
    fixtures.map((fixture) => fixture.headingCount),
    [...HEADING_STORM_COUNTS],
  )
  for (const fixture of fixtures) {
    assert.equal(countHeadings(fixture.markdown), fixture.headingCount)
    assert.ok(fixture.blockCount >= fixture.headingCount)
    assert.ok(fixture.actualChars > fixture.headingCount)
  }
})

test('workspace fixtures contain exact node counts without duplicate paths', () => {
  const fixtures = createAllWorkspaceFixtures()
  assert.deepEqual(
    fixtures.map((fixture) => fixture.targetNodes),
    [...WORKSPACE_NODE_COUNTS],
  )
  for (const fixture of fixtures) {
    assert.equal(fixture.actualNodes, fixture.targetNodes)
    assert.equal(fixture.nodes.length, fixture.targetNodes)
    assert.equal(fixture.fileCount + fixture.directoryCount, fixture.targetNodes)
    assert.ok(fixture.fileCount > 0)
    assert.ok(fixture.directoryCount > 0)
    assert.equal(new Set(fixture.nodes.map((node) => node.path)).size, fixture.targetNodes)
  }
})

test('workspace fixtures keep rendering bounded to a viewport multiplier', () => {
  assert.equal(virtualizedRowBudget(1), 3)
  assert.equal(virtualizedRowBudget(50), 150)
  assert.equal(virtualizedRowBudget(100), 300)
  assert.equal(virtualizedRowBudget(1000), 300)
  assert.throws(() => virtualizedRowBudget(0))
  assert.throws(() => virtualizedRowBudget(1.5))
})

test('large workspace generation remains deterministic', () => {
  const first = createWorkspaceFixture(100000)
  const second = createWorkspaceFixture(100000)
  assert.equal(first.fileCount, second.fileCount)
  assert.equal(first.directoryCount, second.directoryCount)
  assert.deepEqual(first.nodes.slice(0, 5), second.nodes.slice(0, 5))
  assert.deepEqual(first.nodes.slice(-5), second.nodes.slice(-5))
})
