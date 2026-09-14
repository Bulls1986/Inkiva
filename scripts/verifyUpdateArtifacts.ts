import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const dist = path.resolve(root, process.env.UPDATE_ARTIFACTS_DIR ?? 'dist')
const tag = process.env.GITHUB_REF_NAME ?? process.argv[2]

const readJson = <T>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
const fail = (message: string): never => {
  console.error(`::error::${message}`)
  process.exit(1)
}

type UpdateFileEntry = {
  url: string
  sha512: string
  size?: number
}

type UpdateMetadata = {
  version: string
  files: UpdateFileEntry[]
  path?: string
  sha512?: string
}

const scalar = (value: string): string => value.trim().replace(/^['"]|['"]$/g, '')

const parseUpdateMetadata = (filename: string, source: string): UpdateMetadata => {
  const versionMatch = source.match(/^version:\s*(.+?)\s*$/m)
  if (!versionMatch) fail(`${filename} is missing a version`)

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
    if (!sha512) fail(`${filename} has a file entry without sha512 metadata`)
    files.push({ url: scalar(urlMatch[1]), sha512, ...(size === undefined ? {} : { size }) })
  }

  const pathMatch = source.match(/^path:\s*(.+?)\s*$/m)
  const sha512Match = source.match(/^sha512:\s*(.+?)\s*$/m)
  return {
    version: scalar(versionMatch[1]),
    files,
    ...(pathMatch ? { path: scalar(pathMatch[1]) } : {}),
    ...(sha512Match ? { sha512: scalar(sha512Match[1]) } : {})
  }
}

const hash = (
  filePath: string,
  algorithm: 'sha256' | 'sha512',
  encoding: 'hex' | 'base64'
): string => createHash(algorithm).update(fs.readFileSync(filePath)).digest(encoding)

const ensureArtifactName = (filename: string, metadataFilename: string): void => {
  if (path.basename(filename) !== filename) {
    fail(`${metadataFilename} contains an unsafe artifact path: ${filename}`)
  }
}

const verifyMetadata = ({
  dist,
  filename,
  expectedVersion,
  allowedFiles,
  requiredFiles
}: {
  dist: string
  filename: string
  expectedVersion: string
  allowedFiles: Set<string>
  requiredFiles: Set<string>
}): void => {
  const metadataPath = path.join(dist, filename)
  const metadata = parseUpdateMetadata(filename, fs.readFileSync(metadataPath, 'utf8'))
  if (metadata.version !== expectedVersion) {
    fail(`${filename} does not describe version ${expectedVersion}`)
  }
  if (metadata.files.length === 0) fail(`${filename} does not contain any update files`)
  if (!metadata.path || !metadata.sha512) {
    fail(`${filename} is missing top-level path/sha512 metadata`)
  }

  const seenFiles = new Set<string>()
  for (const entry of metadata.files) {
    ensureArtifactName(entry.url, filename)
    if (!allowedFiles.has(entry.url)) {
      fail(`${filename} references an unsupported artifact: ${entry.url}`)
    }
    if (seenFiles.has(entry.url)) { fail(`${filename} contains duplicate artifact metadata: ${entry.url}`) }
    seenFiles.add(entry.url)

    const artifactPath = path.join(dist, entry.url)
    if (!fs.existsSync(artifactPath)) fail(`${filename} references missing artifact: ${entry.url}`)
    const actualSha512 = hash(artifactPath, 'sha512', 'base64')
    if (entry.sha512 !== actualSha512) {
      fail(`${filename} has an invalid sha512 for ${entry.url}`)
    }
    if (entry.size !== undefined && entry.size !== fs.statSync(artifactPath).size) {
      fail(`${filename} has an invalid size for ${entry.url}`)
    }
  }

  for (const requiredFile of requiredFiles) {
    if (!seenFiles.has(requiredFile)) {
      fail(`${filename} does not describe required artifact: ${requiredFile}`)
    }
  }

  ensureArtifactName(metadata.path, filename)
  if (!allowedFiles.has(metadata.path)) { fail(`${filename} has an unsupported top-level path: ${metadata.path}`) }
  const topLevelPath = path.join(dist, metadata.path)
  if (!fs.existsSync(topLevelPath)) { fail(`${filename} references missing top-level artifact: ${metadata.path}`) }
  if (metadata.sha512 !== hash(topLevelPath, 'sha512', 'base64')) {
    fail(`${filename} has an invalid top-level sha512 for ${metadata.path}`)
  }
}

if (!tag || !tag.startsWith('v')) fail('GITHUB_REF_NAME must be a v-prefixed release tag')

const packageJson = readJson<{ version: string }>(path.join(root, 'packages/desktop/package.json'))
const version = tag.slice(1)
if (packageJson.version !== version) {
  fail(
    `Release tag ${tag} does not match packages/desktop/package.json version ${packageJson.version}`
  )
}

const builderConfig = fs.readFileSync(
  path.join(root, 'packages/desktop/electron-builder.yml'),
  'utf8'
)
for (const expected of [
  'provider: github',
  'owner: Bulls1986',
  'repo: Inkiva',
  'differentialPackage: true'
]) {
  if (!builderConfig.includes(expected)) fail(`electron-builder.yml is missing '${expected}'`)
}
if (/^linux:\s*$/m.test(builderConfig)) { fail('electron-builder.yml must not define a Linux release target') }

// Beta/RC releases intentionally have no production updater channel. They
// still get their normal release assets, but the stable Windows metadata
// contract is only meaningful for a stable version.
if (version.includes('-')) {
  console.log(`Skipping stable updater artifact checks for prerelease ${tag}.`)
  process.exit(0)
}

const requiredFiles = [
  `inkiva-win-x64-${version}-setup.exe`,
  `inkiva-win-x64-${version}-setup.exe.blockmap`,
  `inkiva-win-x64-${version}.zip`,
  `inkiva-mac-x64-${version}.dmg`,
  `inkiva-mac-x64-${version}.zip`,
  `inkiva-mac-arm64-${version}.dmg`,
  `inkiva-mac-arm64-${version}.zip`,
  'latest.yml',
  'latest-mac.yml',
  'SHA256SUMS.txt'
]

const unsupportedReleaseFile =
  /^(?:inkiva-linux-|inkiva-win-arm64-|latest-linux\.yml)|\.(?:AppImage|snap|deb|rpm|tar\.gz)$/
for (const filename of fs.readdirSync(dist)) {
  if (unsupportedReleaseFile.test(filename)) {
    fail(`Unsupported release artifact present: ${filename}`)
  }
}

for (const filename of requiredFiles) {
  if (!fs.existsSync(path.join(dist, filename))) fail(`Missing release artifact: ${filename}`)
}

verifyMetadata({
  dist,
  filename: 'latest.yml',
  expectedVersion: version,
  allowedFiles: new Set([`inkiva-win-x64-${version}-setup.exe`, `inkiva-win-x64-${version}.zip`]),
  requiredFiles: new Set([`inkiva-win-x64-${version}-setup.exe`])
})
verifyMetadata({
  dist,
  filename: 'latest-mac.yml',
  expectedVersion: version,
  allowedFiles: new Set([
    `inkiva-mac-x64-${version}.dmg`,
    `inkiva-mac-x64-${version}.zip`,
    `inkiva-mac-arm64-${version}.dmg`,
    `inkiva-mac-arm64-${version}.zip`
  ]),
  requiredFiles: new Set([`inkiva-mac-x64-${version}.zip`, `inkiva-mac-arm64-${version}.zip`])
})

const checksums = fs.readFileSync(path.join(dist, 'SHA256SUMS.txt'), 'utf8')
const checksumEntries = new Map<string, string>()
for (const line of checksums.split(/\r?\n/)) {
  if (!line.trim()) continue
  const match = line.match(/^([a-f0-9]{64})\s+(.+)$/i)
  if (!match) fail(`SHA256SUMS.txt contains a malformed line: ${line}`)
  const [, digest, filename] = match
  if (checksumEntries.has(filename)) fail(`SHA256SUMS.txt contains duplicate entry: ${filename}`)
  checksumEntries.set(filename, digest.toLowerCase())
}
for (const filename of requiredFiles.filter((file) => file !== 'SHA256SUMS.txt')) {
  const expectedDigest = checksumEntries.get(filename)
  if (!expectedDigest) fail(`SHA256SUMS.txt does not cover ${filename}`)
  const actualDigest = hash(path.join(dist, filename), 'sha256', 'hex')
  if (expectedDigest !== actualDigest) fail(`SHA256SUMS.txt has an invalid digest for ${filename}`)
}

console.log(`Verified stable updater artifacts for ${tag}.`)
