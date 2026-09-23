import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

type UpdateFileEntry = {
  url: string
  sha512: string
  size?: number
}

type UpdateMetadata = {
  version: string
  files: UpdateFileEntry[]
  releaseDate?: string
}

const sourceRoot = path.resolve(process.argv[2] ?? 'artifact-downloads')
const outputRoot = path.resolve(process.argv[3] ?? 'dist')

const scalar = (value: string): string => value.trim().replace(/^['"]|['"]$/g, '')

const walk = (directory: string): string[] =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(entryPath) : [entryPath]
  })

const parseMetadata = (filename: string, source: string): UpdateMetadata => {
  const versionMatch = source.match(/^version:\s*(.+?)\s*$/m)
  if (!versionMatch) throw new Error(`${filename} is missing a version`)

  const lines = source.split(/\r?\n/)
  const files: UpdateFileEntry[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const urlMatch = lines[index].match(/^\s*-\s+url:\s*(.+?)\s*$/)
    if (!urlMatch) continue

    let sha512: string | undefined
    let size: number | undefined
    for (let next = index + 1; next < lines.length; next += 1) {
      if (/^\s*-\s+url:\s*/.test(lines[next])) break
      const shaMatch = lines[next].match(/^\s+sha512:\s*(.+?)\s*$/)
      if (shaMatch) sha512 = scalar(shaMatch[1])
      const sizeMatch = lines[next].match(/^\s+size:\s*(\d+)\s*$/)
      if (sizeMatch) size = Number(sizeMatch[1])
    }
    if (!sha512) throw new Error(`${filename} has a file entry without sha512 metadata`)
    files.push({ url: scalar(urlMatch[1]), sha512, ...(size === undefined ? {} : { size }) })
  }
  if (!files.length) throw new Error(`${filename} has no file entries`)

  return {
    version: scalar(versionMatch[1]),
    files,
    releaseDate: source.match(/^releaseDate:\s*(.+?)\s*$/m)?.[1]
  }
}

if (!fs.existsSync(sourceRoot)) throw new Error(`Artifact source directory not found: ${sourceRoot}`)

fs.rmSync(outputRoot, { recursive: true, force: true })
fs.mkdirSync(outputRoot, { recursive: true })

const sourceFiles = walk(sourceRoot)
const metadataFiles = sourceFiles.filter((filename) => path.basename(filename) === 'latest-mac.yml')
if (metadataFiles.length !== 2) {
  throw new Error(`Expected exactly two macOS updater metadata files, found ${metadataFiles.length}`)
}

const copied = new Set<string>()
for (const filename of sourceFiles) {
  const basename = path.basename(filename)
  if (basename === 'latest-mac.yml') continue
  if (copied.has(basename)) throw new Error(`Duplicate release artifact filename: ${basename}`)
  fs.copyFileSync(filename, path.join(outputRoot, basename))
  copied.add(basename)
}

const metadata = metadataFiles.map((filename) =>
  parseMetadata(filename, fs.readFileSync(filename, 'utf8'))
)
const version = metadata[0].version
if (metadata.some((item) => item.version !== version)) {
  throw new Error('macOS updater metadata files describe different versions')
}

const entriesByUrl = new Map<string, UpdateFileEntry>()
for (const item of metadata) {
  for (const entry of item.files) {
    const existing = entriesByUrl.get(entry.url)
    if (existing && (existing.sha512 !== entry.sha512 || existing.size !== entry.size)) {
      throw new Error(`Conflicting macOS updater metadata for ${entry.url}`)
    }
    entriesByUrl.set(entry.url, entry)
  }
}

for (const required of [`inkiva-mac-x64-${version}.zip`, `inkiva-mac-arm64-${version}.zip`]) {
  if (!entriesByUrl.has(required)) throw new Error(`Merged metadata is missing ${required}`)
}

const entries = [...entriesByUrl.values()].sort((left, right) => {
  const leftIsZip = left.url.endsWith('.zip')
  const rightIsZip = right.url.endsWith('.zip')
  if (leftIsZip !== rightIsZip) return leftIsZip ? -1 : 1
  return left.url.localeCompare(right.url)
})
const first = entries[0]
const mergedMetadata = [
  `version: ${version}`,
  'files:',
  ...entries.flatMap(({ url, sha512, size }) => [
    `  - url: ${url}`,
    `    sha512: ${sha512}`,
    ...(size === undefined ? [] : [`    size: ${size}`]),
  ]),
  `path: ${first.url}`,
  `sha512: ${first.sha512}`,
  ...(metadata[0].releaseDate ? [`releaseDate: ${scalar(metadata[0].releaseDate)}`] : []),
  '',
].join('\n')
fs.writeFileSync(path.join(outputRoot, 'latest-mac.yml'), mergedMetadata)

const checksumFiles = fs
  .readdirSync(outputRoot)
  .filter((filename) => filename !== 'SHA256SUMS.txt')
  // Match the previous `LC_ALL=C sort` release contract for ASCII artifact names.
  .sort()
const checksums = checksumFiles
  .map((filename) => {
    const digest = createHash('sha256').update(fs.readFileSync(path.join(outputRoot, filename))).digest('hex')
    return `${digest}  ${filename}`
  })
  .join('\n')
fs.writeFileSync(path.join(outputRoot, 'SHA256SUMS.txt'), `${checksums}\n`)

console.log(`Assembled ${checksumFiles.length} release artifacts for ${version}.`)
