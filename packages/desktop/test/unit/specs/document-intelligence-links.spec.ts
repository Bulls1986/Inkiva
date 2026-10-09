import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

import {
  isStandardRelativeMarkdownDestination,
  parseNavigableMarkdownDestination,
  parseStandardRelativeMarkdownLinks
} from 'main_renderer/documentIntelligence/markdownLinks'
import {
  canonicalDocumentPath,
  createStandardMarkdownLink,
  MarkdownLinkIndex,
  relativeMarkdownLinkPath,
  resolveMarkdownLinkTarget
} from 'main_renderer/documentIntelligence/markdownLinkIndex'
import { createRenameRepairPlan } from 'main_renderer/documentIntelligence/renameRepair'

describe('standard Markdown link parser', () => {
  it('parses relative Markdown documents and preserves source offsets', () => {
    const markdown = [
      '---',
      'related: [hidden](./hidden.md)',
      '---',
      '',
      '[Design](<./docs/design.md#Overview> "Design title")',
      '[Guide](../guide.markdown)',
      '![Not a document link](./image.md)',
      '[External](https://example.com/external.md)',
      '[Absolute](/absolute.md)',
      '[Anchor](#only-a-fragment)',
      '`[Code](./code.md)`',
      '```markdown',
      '[Fenced](./fenced.md)',
      '```'
    ].join('\n')

    const links = parseStandardRelativeMarkdownLinks(markdown)

    expect(links).toHaveLength(2)
    const design = links.at(0)
    const guide = links.at(1)
    if (!design || !guide) throw new Error('expected two Markdown links')

    expect(design).toMatchObject({
      label: 'Design',
      destination: './docs/design.md#Overview',
      path: './docs/design.md',
      fragment: '#Overview',
      line: 5
    })
    expect(markdown.slice(design.start, design.end)).toBe(
      '[Design](<./docs/design.md#Overview> "Design title")'
    )
    expect(guide).toMatchObject({
      label: 'Guide',
      destination: '../guide.markdown',
      path: '../guide.markdown',
      fragment: '',
      line: 6
    })
  })

  it('splits encoded and escaped filenames and Unicode fragments', () => {
    const resolve = parseNavigableMarkdownDestination
    expect(resolve('./📘%23Notes.md#quick-start')).toEqual({ pathname: './📘#Notes.md', fragment: 'quick-start' })
    expect(resolve('./Guide\\#Notes.md')).toEqual({ pathname: './Guide#Notes.md', fragment: null })
    expect(resolve('./broken%ZZ.md#head')).toBeNull()
    expect(resolve('./valid.md%00')).toBeNull()
  })
  it('accepts balanced destinations and rejects non-document targets', () => {
    const links = parseStandardRelativeMarkdownLinks(
      '[Nested](./docs/(draft).md)\n[Escaped](./my\\ file.md)\n[Nope](./readme.txt)'
    )

    expect(links.map((link) => link.path)).toEqual(['./docs/(draft).md', './my file.md'])
    expect(isStandardRelativeMarkdownDestination('../README.MARKDOWN#intro')).toBe(true)
    expect(isStandardRelativeMarkdownDestination('https://example.com/readme.md')).toBe(false)
    expect(isStandardRelativeMarkdownDestination('/docs/readme.md')).toBe(false)
    expect(isStandardRelativeMarkdownDestination('#intro')).toBe(false)
  })
})

describe('MarkdownLinkIndex', () => {
  it('ranks fuzzy workspace Markdown suggestions without collapsing equal basenames', () => {
    const index = new MarkdownLinkIndex()
    const root = '/virtual/inkiva-docs'
    const source = path.join(root, 'current.md')
    const candidates = index.getLinkCandidates(source, [
      path.join(root, 'manual', 'README.md'),
      path.join(root, 'docs', 'README.md'),
      path.join(root, 'docs', 'reference.markdown'),
      path.join(root, 'docs', 'picture.png')
    ])
    expect(index.rankLinkCandidates(candidates, 'read').map(({ relativePath }) => relativePath))
      .toEqual(['./docs/README.md', './manual/README.md'])
    expect(index.rankLinkCandidates(candidates, 'dread').map(({ relativePath }) => relativePath))
      .toEqual(['./docs/README.md'])
    expect(index.rankLinkCandidates(candidates, 'not-found')).toEqual([])
  })

  it('keeps absent-target lookups bounded for a large workspace', () => {
    const index = new MarkdownLinkIndex()
    const root = '/virtual/inkiva-large-workspace'
    for (let file = 0; file < 12_000; file += 1) {
      index.updateDocument(path.join(root, `source-${file}.md`), '[Link](./target.md)')
    }

    const absentTarget = path.join(root, 'does-not-exist.md')
    for (let i = 0; i < 5; i += 1) {
      expect(index.getBacklinks(absentTarget)).toEqual([])
    }

    const start = performance.now()
    for (let i = 0; i < 64; i += 1) {
      expect(index.getBacklinks(absentTarget)).toEqual([])
    }
    // Query time must not grow with workspace-wide sources. This guard uses
    // a generous total budget to avoid depending on one scheduler tick.
    expect(performance.now() - start).toBeLessThan(150)
  })

  it('updates inverse backlinks correctly after repeated edits, removals and clear', () => {
    const root = '/virtual/inkiva-workspace'
    const sourceA = path.join(root, 'notes', 'a.md')
    const sourceB = path.join(root, 'b.md')
    const targetA = path.join(root, 'a.md')
    const targetB = path.join(root, 'other.md')
    const index = new MarkdownLinkIndex()

    index.updateDocument(sourceA, '[First](../a.md)\n[Second](../a.md)')
    index.updateDocument(sourceB, '[Third](./a.md)')
    // Paths sort before source offsets: b.md precedes notes/a.md.
    expect(index.getBacklinks(targetA).map(({ label }) => label)).toEqual([
      'Third', 'First', 'Second'
    ])

    index.updateDocument(sourceA, '[Moved](../other.md)')
    expect(index.getBacklinks(targetA).map(({ label }) => label)).toEqual(['Third'])
    expect(index.getBacklinks(targetB).map(({ label }) => label)).toEqual(['Moved'])

    index.removeDocument(sourceB)
    expect(index.getBacklinks(targetA)).toEqual([])
    expect(index.getBacklinks(targetB)).toHaveLength(1)

    index.clear()
    expect(index.getBacklinks(targetA)).toEqual([])
    expect(index.getBacklinks(targetB)).toEqual([])
    index.updateDocument(sourceB, '[Again](./a.md)')
    expect(index.getBacklinks(targetA).map(({ label }) => label)).toEqual(['Again'])
  })

  it('resolves links relative to each source and returns sorted backlinks', () => {
    const root = '/virtual/inkiva-docs'
    const target = canonicalDocumentPath(path.join(root, 'design.md'))
    const readme = canonicalDocumentPath(path.join(root, 'README.md'))
    const notes = canonicalDocumentPath(path.join(root, 'notes', 'index.md'))
    const index = new MarkdownLinkIndex()

    index.updateDocument(readme, '[Design](./design.md)')
    index.updateDocument(notes, '[Design](../design.md#overview)')

    expect(resolveMarkdownLinkTarget(notes, '../design.md')).toBe(target)
    const expectedBacklinks = [
      {
        sourcePath: readme,
        label: 'Design',
        destination: './design.md',
        fragment: '',
        line: 1,
        start: 0,
        end: '[Design](./design.md)'.length
      },
      {
        sourcePath: notes,
        label: 'Design',
        destination: '../design.md#overview',
        fragment: '#overview',
        line: 1,
        start: 0,
        end: '[Design](../design.md#overview)'.length
      }
    ].sort((left, right) =>
      left.sourcePath === right.sourcePath ? 0 : left.sourcePath < right.sourcePath ? -1 : 1
    )
    expect(index.getBacklinks(target)).toEqual(expectedBacklinks)
  })

  it('offers only Markdown candidates with stable relative paths', () => {
    const source = canonicalDocumentPath('/virtual/inkiva-docs/notes/current.md')
    const target = canonicalDocumentPath('/virtual/inkiva-docs/notes/target.md')
    const readmeInput = path.resolve('/virtual/inkiva-docs/README.md')
    const readme = canonicalDocumentPath(readmeInput)

    expect(relativeMarkdownLinkPath(source, target)).toBe('./target.md')
    expect(
      new MarkdownLinkIndex().getLinkCandidates(source, [
        target,
        target,
        readmeInput,
        '/virtual/inkiva-docs/image.png'
      ])
    ).toEqual([
      {
        pathname: readme,
        relativePath: '../README.md'
      },
      {
        pathname: target,
        relativePath: './target.md'
      }
    ])
    expect(createStandardMarkdownLink('Design', source, target, '#intro')).toBe(
      '[Design](./target.md#intro)'
    )
  })
})

describe('rename/move link repair planning', () => {
  it('plans only standard relative document-link changes and preserves titles/fragments', () => {
    const root = '/virtual/inkiva-docs'
    const fromPath = canonicalDocumentPath(path.join(root, 'notes', 'old.md'))
    const toPath = canonicalDocumentPath(path.join(root, 'archive', 'old.md'))
    const readmePath = canonicalDocumentPath(path.join(root, 'README.md'))
    const designPath = canonicalDocumentPath(path.join(root, 'notes', 'design.md'))
    const readme = '[Old](notes/old.md#top "Keep this title")\n![Image](notes/old.md)'
    const oldDocument = '[Design](./design.md)\n[Web](https://example.com/old.md)'

    const plan = createRenameRepairPlan({
      fromPath,
      toPath,
      documents: [
        { pathname: readmePath, markdown: readme },
        { pathname: fromPath, markdown: oldDocument },
        { pathname: designPath, markdown: '# Design' }
      ]
    })

    expect(plan.linkCount).toBe(2)
    expect(plan.changes).toEqual([
      {
        sourcePath: readmePath,
        sourcePathAfter: readmePath,
        before: readme,
        after: '[Old](archive/old.md#top "Keep this title")\n![Image](notes/old.md)',
        edits: [
          expect.objectContaining({
            replacement: 'archive/old.md#top'
          })
        ]
      },
      {
        sourcePath: fromPath,
        sourcePathAfter: toPath,
        before: oldDocument,
        after: '[Design](../notes/design.md)\n[Web](https://example.com/old.md)',
        edits: [
          expect.objectContaining({
            replacement: '../notes/design.md'
          })
        ]
      }
    ])
  })
})
