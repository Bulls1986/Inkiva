export const MARKDOWN_DOCUMENT_SPECS = {
  regular: { targetChars: 30000, minimumHeadings: 100 },
  '50k': { targetChars: 50000, minimumHeadings: 300 },
  '100k': { targetChars: 100000, minimumHeadings: 500 },
  '500k': { targetChars: 500000, minimumHeadings: 2000 },
  '1m': { targetChars: 1000000, minimumHeadings: 5000 },
} as const

export type MarkdownDocumentTier = keyof typeof MARKDOWN_DOCUMENT_SPECS

export const HEADING_STORM_COUNTS = [500, 2000, 5000, 10000] as const
export type HeadingStormCount = (typeof HEADING_STORM_COUNTS)[number]

export const WORKSPACE_NODE_COUNTS = [1000, 10000, 50000, 100000] as const
export type WorkspaceNodeCount = (typeof WORKSPACE_NODE_COUNTS)[number]

export const MAX_VIRTUALIZED_ROWS = 300 as const
export const VIRTUALIZED_ROW_MULTIPLIER = 3 as const

export const REQUIRED_MARKDOWN_FEATURES = [
  'heading',
  'list',
  'table',
  'code-block',
  'quote',
  'link',
  'image',
  'diagram',
  'inline-format',
] as const
export type MarkdownFeature = (typeof REQUIRED_MARKDOWN_FEATURES)[number]

export interface MarkdownFixture {
  id: string
  tier: MarkdownDocumentTier
  targetChars: number
  actualChars: number
  markdown: string
  headingCount: number
  blockCount: number
  features: readonly MarkdownFeature[]
}

export interface HeadingStormFixture {
  id: string
  headingCount: HeadingStormCount
  markdown: string
  actualChars: number
  blockCount: number
}

export interface WorkspaceNode {
  kind: 'file' | 'directory'
  path: string
  parentPath: string
}

export interface WorkspaceFixture {
  id: string
  targetNodes: WorkspaceNodeCount
  actualNodes: number
  fileCount: number
  directoryCount: number
  nodes: WorkspaceNode[]
}

const fence = String.fromCharCode(96).repeat(3)
const inlineCode = String.fromCharCode(96) + 'inline code' + String.fromCharCode(96)

const mixedSeed = [
  '# Inkiva performance fixture',
  '',
  'This fixture contains **bold**, *emphasis*, and ' +
    inlineCode +
    ' for inline-format coverage.',
  '',
  '- A deterministic list item',
  '- A second deterministic list item',
  '',
  '> A deterministic quote block.',
  '',
  '| Column A | Column B |',
  '| --- | --- |',
  '| stable | value |',
  '',
  '[A stable link](https://example.invalid/inkiva-fixture)',
  '',
  '![A placeholder image](fixture-image.png)',
  '',
  fence + 'ts',
  'const stableFixture = true',
  fence,
  '',
  fence + 'mermaid',
  'flowchart LR',
  '  Start --> Review --> Done',
  fence,
  '',
].join('\n')

const exactLength = (value: string, targetChars: number): string => {
  if (value.length > targetChars) {
    throw new Error(
      'fixture seed exceeded target of ' + targetChars + ' characters: ' + value.length,
    )
  }
  return value + 'x'.repeat(targetChars - value.length)
}

export const countHeadings = (markdown: string): number =>
  (markdown.match(/^#{1,6}\s+.+$/gm) ?? []).length

export const countBlocks = (markdown: string): number =>
  markdown
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0).length

const buildSection = (index: number): string =>
  [
    '## Section ' + index,
    '',
    'Section ' +
      index +
      ' keeps the editor workload deterministic while exercising links, inline format, and ordinary text.',
    '',
  ].join('\n')

export const createMarkdownFixture = (tier: MarkdownDocumentTier): MarkdownFixture => {
  const specification = MARKDOWN_DOCUMENT_SPECS[tier]
  const parts = [mixedSeed]
  for (let index = 0; index < specification.minimumHeadings; index += 1) {
    parts.push(buildSection(index))
  }
  const markdown = exactLength(parts.join(''), specification.targetChars)
  return {
    id: 'markdown-' + tier,
    tier,
    targetChars: specification.targetChars,
    actualChars: markdown.length,
    markdown,
    headingCount: countHeadings(markdown),
    blockCount: countBlocks(markdown),
    features: REQUIRED_MARKDOWN_FEATURES,
  }
}

export const createAllMarkdownFixtures = (): MarkdownFixture[] =>
  (Object.keys(MARKDOWN_DOCUMENT_SPECS) as MarkdownDocumentTier[]).map(createMarkdownFixture)

export const createHeadingStormFixture = (
  headingCount: HeadingStormCount,
): HeadingStormFixture => {
  const parts: string[] = []
  for (let index = 0; index < headingCount; index += 1) {
    parts.push(
      [
        '## Heading ' + index,
        '',
        'Heading storm paragraph ' + index + ' remains deterministic.',
        '',
      ].join('\n'),
    )
  }
  const markdown = parts.join('')
  return {
    id: 'heading-storm-' + headingCount,
    headingCount,
    markdown,
    actualChars: markdown.length,
    blockCount: countBlocks(markdown),
  }
}

export const createAllHeadingStormFixtures = (): HeadingStormFixture[] =>
  HEADING_STORM_COUNTS.map(createHeadingStormFixture)

export const createWorkspaceFixture = (targetNodes: WorkspaceNodeCount): WorkspaceFixture => {
  const directoryCount = Math.max(1, Math.floor(targetNodes / 100))
  const fileCount = targetNodes - directoryCount
  const directories: WorkspaceNode[] = []
  const files: WorkspaceNode[] = []

  for (let index = 0; index < directoryCount; index += 1) {
    const path = 'workspace/dir-' + String(index).padStart(5, '0')
    directories.push({ kind: 'directory', path, parentPath: 'workspace' })
  }
  for (let index = 0; index < fileCount; index += 1) {
    const directoryIndex = index % directoryCount
    const parentPath =
      'workspace/dir-' + String(directoryIndex).padStart(5, '0')
    files.push({
      kind: 'file',
      path: parentPath + '/note-' + String(index).padStart(7, '0') + '.md',
      parentPath,
    })
  }

  const nodes = [...directories, ...files]
  return {
    id: 'workspace-' + targetNodes,
    targetNodes,
    actualNodes: nodes.length,
    fileCount,
    directoryCount,
    nodes,
  }
}

export const createAllWorkspaceFixtures = (): WorkspaceFixture[] =>
  WORKSPACE_NODE_COUNTS.map(createWorkspaceFixture)

export const virtualizedRowBudget = (viewportRows: number): number => {
  if (!Number.isInteger(viewportRows) || viewportRows < 1) {
    throw new Error('viewportRows must be a positive integer')
  }
  return Math.min(MAX_VIRTUALIZED_ROWS, viewportRows * VIRTUALIZED_ROW_MULTIPLIER)
}
