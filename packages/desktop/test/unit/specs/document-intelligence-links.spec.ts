import { describe, expect, it } from 'vitest'
import path from 'node:path'

import {
  isStandardRelativeMarkdownDestination,
  parseStandardRelativeMarkdownLinks
} from 'main_renderer/documentIntelligence/markdownLinks'
import {
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
  it('resolves links relative to each source and returns sorted backlinks', () => {
    const root = '/virtual/inkiva-docs'
    const target = path.join(root, 'design.md')
    const readme = path.join(root, 'README.md')
    const notes = path.join(root, 'notes', 'index.md')
    const index = new MarkdownLinkIndex()

    index.updateDocument(readme, '[Design](./design.md)')
    index.updateDocument(notes, '[Design](../design.md#overview)')

    expect(resolveMarkdownLinkTarget(notes, '../design.md')).toBe(target)
    expect(index.getBacklinks(target)).toEqual([
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
    ])
  })

  it('offers only Markdown candidates with stable relative paths', () => {
    const source = '/virtual/inkiva-docs/notes/current.md'
    const target = '/virtual/inkiva-docs/notes/target.md'

    expect(relativeMarkdownLinkPath(source, target)).toBe('./target.md')
    expect(
      new MarkdownLinkIndex().getLinkCandidates(source, [
        target,
        target,
        '/virtual/inkiva-docs/README.md',
        '/virtual/inkiva-docs/image.png'
      ])
    ).toEqual([
      {
        pathname: '/virtual/inkiva-docs/README.md',
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
    const fromPath = path.join(root, 'notes', 'old.md')
    const toPath = path.join(root, 'archive', 'old.md')
    const readmePath = path.join(root, 'README.md')
    const designPath = path.join(root, 'notes', 'design.md')
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
