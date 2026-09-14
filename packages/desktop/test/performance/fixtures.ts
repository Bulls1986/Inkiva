export type LargeDocumentFixtureKind =
  | 'small'
  | 'medium'
  | 'large'
  | 'long-paragraph'
  | 'huge-table'
  | 'deep-lists'
  | 'many-headings'
  | 'many-code-blocks'
  | 'many-images'
  | 'many-diagrams'

export type LargeDocumentFixture = {
  kind: LargeDocumentFixtureKind
  markdown: string
  bytes: number
  markers: string[]
}

const encoder = new TextEncoder()

const byteLength = (value: string): number => encoder.encode(value).byteLength

const repeatUntilBytes = (seed: string, targetBytes: number): string => {
  const chunks: string[] = []
  let currentBytes = 0
  while (currentBytes < targetBytes) {
    chunks.push(seed)
    currentBytes += byteLength(seed)
  }
  return chunks.join('')
}

const paragraph = (index: number): string =>
  `Paragraph ${index}: Inkiva keeps the writing surface responsive while the document grows. ` +
  'This deterministic sentence exercises ordinary Markdown text without relying on generated randomness.\n\n'

const buildSizeFixture = (kind: 'small' | 'medium' | 'large'): LargeDocumentFixture => {
  const targetBytes = { small: 100 * 1024, medium: 1024 * 1024, large: 5 * 1024 * 1024 }[kind]
  const header = '# Inkiva large-document performance fixture\n\n'
  const parts = [header]
  let currentBytes = byteLength(header)
  let index = 0
  while (currentBytes < targetBytes) {
    const section = `## Section ${index}\n\n`
    const body = paragraph(index)
    parts.push(section, body)
    currentBytes += byteLength(section) + byteLength(body)
    index += 1
  }

  return {
    kind,
    markdown: parts.join(''),
    bytes: currentBytes,
    markers: ['heading', 'paragraph']
  }
}

const buildExtremeFixture = (
  kind: Exclude<LargeDocumentFixtureKind, 'small' | 'medium' | 'large'>
): LargeDocumentFixture => {
  let markdown = '# Inkiva extreme document fixture\n\n'
  const markers: string[] = []

  if (kind === 'long-paragraph') {
    markdown += repeatUntilBytes(
      'A long paragraph remains a single block so layout and editing can be measured. ',
      256 * 1024
    )
    markdown += '\n'
    markers.push('long-paragraph')
  }

  if (kind === 'huge-table') {
    markdown += '| Column A | Column B | Column C |\n| --- | --- | --- |\n'
    for (let index = 0; index < 4000; index += 1) {
      markdown += `| row ${index} | stable value ${index} | ${index % 2 === 0 ? 'even' : 'odd'} |\n`
    }
    markers.push('table')
  }

  if (kind === 'deep-lists') {
    for (let index = 0; index < 80; index += 1) {
      markdown += `${'  '.repeat(index)}- nested list item ${index}\n`
    }
    markers.push('nested-list')
  }

  if (kind === 'many-headings') {
    for (let index = 0; index < 1000; index += 1) {
      markdown += `${'#'.repeat((index % 6) + 1)} heading ${index}\n\n${paragraph(index)}`
    }
    markers.push('headings')
  }

  if (kind === 'many-code-blocks') {
    for (let index = 0; index < 500; index += 1) {
      markdown += `\`\`\`ts\nconst value${index} = ${index}\nconsole.log(value${index})\n\`\`\`\n\n`
    }
    markers.push('code-blocks')
  }

  if (kind === 'many-images') {
    for (let index = 0; index < 300; index += 1) {
      markdown += `![fixture image ${index}](https://example.invalid/inkiva-${index}.png)\n\n`
    }
    markers.push('images')
  }

  if (kind === 'many-diagrams') {
    for (let index = 0; index < 100; index += 1) {
      markdown += `\`\`\`mermaid\nflowchart LR\n  A${index}[Start] --> B${index}{Review}\n  B${index} --> C${index}[Done]\n\`\`\`\n\n`
    }
    markers.push('diagrams')
  }

  return { kind, markdown, bytes: byteLength(markdown), markers }
}

export const createLargeDocumentFixture = (
  kind: LargeDocumentFixtureKind
): LargeDocumentFixture => {
  if (kind === 'small' || kind === 'medium' || kind === 'large') return buildSizeFixture(kind)
  return buildExtremeFixture(kind)
}

export const standardLargeDocumentFixtures = (): LargeDocumentFixture[] =>
  (['small', 'medium', 'large'] as const).map(createLargeDocumentFixture)

export const extremeLargeDocumentFixtures = (): LargeDocumentFixture[] =>
  (
    [
      'long-paragraph',
      'huge-table',
      'deep-lists',
      'many-headings',
      'many-code-blocks',
      'many-images',
      'many-diagrams'
    ] as const
  ).map(createLargeDocumentFixture)
