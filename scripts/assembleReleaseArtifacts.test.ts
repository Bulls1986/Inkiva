import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))

const sha512 = (value: Buffer): string => createHash('sha512').update(value).digest('base64')

const macMetadata = (version: string, filename: string, content: Buffer): string => [
  `version: ${version}`,
  'files:',
  `  - url: ${filename}`,
  `    sha512: ${sha512(content)}`,
  `    size: ${content.length}`,
  `path: ${filename}`,
  `sha512: ${sha512(content)}`,
  'releaseDate: 2026-09-21T00:00:00.000Z',
  '',
].join('\n')

const makeArtifacts = async(version = '0.4.0'): Promise<{ source: string; output: string }> => {
  const root = await mkdtemp(path.join(tmpdir(), 'inkiva-release-assembly-'))
  const source = path.join(root, 'artifacts')
  const output = path.join(root, 'dist')
  const windows = path.join(source, 'inkiva-windows-x64')
  const macX64 = path.join(source, 'inkiva-macos-x64')
  const macArm64 = path.join(source, 'inkiva-macos-arm64')
  await Promise.all([windows, macX64, macArm64].map((directory) => mkdir(directory, { recursive: true })))

  const files = new Map<string, Buffer>([
    [`inkiva-win-x64-${version}-setup.exe`, Buffer.from('windows-installer')],
    [`inkiva-win-x64-${version}-setup.exe.blockmap`, Buffer.from('windows-blockmap')],
    [`inkiva-win-x64-${version}.zip`, Buffer.from('windows-zip')],
    [`inkiva-mac-x64-${version}.dmg`, Buffer.from('mac-x64-dmg')],
    [`inkiva-mac-x64-${version}.zip`, Buffer.from('mac-x64-zip')],
    [`inkiva-mac-arm64-${version}.dmg`, Buffer.from('mac-arm64-dmg')],
    [`inkiva-mac-arm64-${version}.zip`, Buffer.from('mac-arm64-zip')],
    ['latest.yml', Buffer.from('version: 0.4.0\n')],
  ])

  for (const [filename, fileContent] of files) {
    const directory = filename.startsWith('inkiva-mac-x64')
      ? macX64
      : filename.startsWith('inkiva-mac-arm64')
        ? macArm64
        : windows
    await writeFile(path.join(directory, filename), fileContent)
  }

  const x64Zip = files.get(`inkiva-mac-x64-${version}.zip`)!
  const armZip = files.get(`inkiva-mac-arm64-${version}.zip`)!
  await writeFile(
    path.join(macX64, 'latest-mac.yml'),
    macMetadata(version, `inkiva-mac-x64-${version}.zip`, x64Zip)
  )
  await writeFile(
    path.join(macArm64, 'latest-mac.yml'),
    macMetadata(version, `inkiva-mac-arm64-${version}.zip`, armZip)
  )

  return { source, output }
}

const runAssembler = (source: string, output: string) =>
  spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/assembleReleaseArtifacts.ts', source, output],
    { cwd: repositoryRoot, encoding: 'utf8' }
  )

test('assembles uploaded platform artifacts without rebuilding them', async() => {
  const { source, output } = await makeArtifacts()
  const root = path.dirname(source)
  try {
    const result = runAssembler(source, output)
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)

    const merged = await readFile(path.join(output, 'latest-mac.yml'), 'utf8')
    assert.match(merged, /inkiva-mac-x64-0\.4\.0\.zip/)
    assert.match(merged, /inkiva-mac-arm64-0\.4\.0\.zip/)

    const checksums = await readFile(path.join(output, 'SHA256SUMS.txt'), 'utf8')
    assert.match(checksums, /inkiva-win-x64-0\.4\.0-setup\.exe/)
    assert.match(checksums, /latest-mac\.yml/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('rejects conflicting updater metadata instead of publishing ambiguous artifacts', async() => {
  const { source, output } = await makeArtifacts()
  const root = path.dirname(source)
  try {
    const macArmMetadata = path.join(source, 'inkiva-macos-arm64', 'latest-mac.yml')
    const original = await readFile(macArmMetadata, 'utf8')
    await writeFile(
      macArmMetadata,
      `${original}\n  - url: inkiva-mac-x64-0.4.0.zip\n    sha512: conflicting\n`
    )
    const result = runAssembler(source, output)
    assert.notEqual(result.status, 0)
    assert.match(`${result.stdout}\n${result.stderr}`, /Conflicting macOS updater metadata/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
