import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const version = '0.4.1'
const windowsInstaller = `inkiva-win-x64-${version}-setup.exe`
const macIntelZip = `inkiva-mac-x64-${version}.zip`
const macArmZip = `inkiva-mac-arm64-${version}.zip`

const releaseArtifacts = [
  windowsInstaller,
  `${windowsInstaller}.blockmap`,
  `inkiva-win-x64-${version}.zip`,
  `inkiva-mac-x64-${version}.dmg`,
  macIntelZip,
  `inkiva-mac-arm64-${version}.dmg`,
  macArmZip
]

const sha512 = (value: Buffer): string => createHash('sha512').update(value).digest('base64')
const sha256 = (value: Buffer): string => createHash('sha256').update(value).digest('hex')

const fixtureContent = (files: Map<string, Buffer>, filename: string): Buffer => {
  const content = files.get(filename)
  assert.ok(content, `missing fixture content for ${filename}`)
  return content
}

const metadata = (entries: Array<{ filename: string; digest: string; size: number }>): string => {
  const first = entries[0]
  return [
    `version: ${version}`,
    'files:',
    ...entries.flatMap(({ filename, digest, size }) => [
      `  - url: ${filename}`,
      `    sha512: ${digest}`,
      `    size: ${size}`
    ]),
    `path: ${first.filename}`,
    `sha512: ${first.digest}`,
    'releaseDate: 2026-09-14T00:00:00.000Z',
    ''
  ].join('\n')
}

const makeFixture = async(
  options: {
    includeMacMetadata?: boolean
    includeMacArmEntry?: boolean
    includeLinuxArtifact?: boolean
    corruptMetadata?: 'windows' | 'mac'
    corruptChecksum?: boolean
  } = {}
): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), 'inkiva-artifacts-'))
  const files = new Map<string, Buffer>()

  for (const filename of releaseArtifacts) {
    const content = Buffer.from(`fixture:${filename}\n`)
    files.set(filename, content)
    await writeFile(path.join(directory, filename), content)
  }

  if (options.includeLinuxArtifact) {
    const filename = `inkiva-linux-${version}.AppImage`
    const content = Buffer.from(`fixture:${filename}\n`)
    files.set(filename, content)
    await writeFile(path.join(directory, filename), content)
  }

  const windowsEntry = {
    filename: windowsInstaller,
    digest: sha512(fixtureContent(files, windowsInstaller)),
    size: fixtureContent(files, windowsInstaller).length
  }
  if (options.corruptMetadata === 'windows') windowsEntry.digest = 'invalid-windows-sha512'
  const latestYaml = metadata([windowsEntry])
  await writeFile(path.join(directory, 'latest.yml'), latestYaml)
  files.set('latest.yml', Buffer.from(latestYaml))

  if (options.includeMacMetadata !== false) {
    const macEntries = [
      {
        filename: macIntelZip,
        digest: sha512(fixtureContent(files, macIntelZip)),
        size: fixtureContent(files, macIntelZip).length
      }
    ]
    if (options.includeMacArmEntry !== false) {
      macEntries.push({
        filename: macArmZip,
        digest: sha512(fixtureContent(files, macArmZip)),
        size: fixtureContent(files, macArmZip).length
      })
    }
    if (options.corruptMetadata === 'mac') { macEntries[macEntries.length - 1].digest = 'invalid-mac-sha512' }
    const latestMacYaml = metadata(macEntries)
    await writeFile(path.join(directory, 'latest-mac.yml'), latestMacYaml)
    files.set('latest-mac.yml', Buffer.from(latestMacYaml))
  }

  const checksumFiles = (await readdir(directory)).sort()
  const checksumLines = await Promise.all(
    checksumFiles.map(async(filename) => {
      const content = await readFile(path.join(directory, filename))
      const digest =
        options.corruptChecksum && filename === windowsInstaller ? '0'.repeat(64) : sha256(content)
      return `${digest}  ${filename}`
    })
  )
  await writeFile(path.join(directory, 'SHA256SUMS.txt'), `${checksumLines.join('\n')}\n`)

  return directory
}

const runVerifier = (directory: string) =>
  spawnSync(process.execPath, ['--import', 'tsx', 'scripts/verifyUpdateArtifacts.ts'], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      GITHUB_REF_NAME: `v${version}`,
      UPDATE_ARTIFACTS_DIR: directory
    },
    encoding: 'utf8'
  })

const assertRejected = (result: ReturnType<typeof runVerifier>, expected: RegExp): void => {
  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(`${result.stdout}\n${result.stderr}`, expected)
}

test('accepts a complete Windows and dual-architecture macOS artifact set', async() => {
  const directory = await makeFixture()
  try {
    const result = runVerifier(directory)
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('requires latest-mac.yml for a stable release', async() => {
  const directory = await makeFixture({ includeMacMetadata: false })
  try {
    assertRejected(runVerifier(directory), /latest-mac\.yml/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('requires both official macOS architecture entries in latest-mac.yml', async() => {
  const directory = await makeFixture({ includeMacArmEntry: false })
  try {
    assertRejected(runVerifier(directory), /mac-arm64|macOS.*architecture|latest-mac\.yml/i)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('verifies SHA-512 metadata against the bytes of each updater artifact', async() => {
  const directory = await makeFixture({ corruptMetadata: 'windows' })
  try {
    assertRejected(runVerifier(directory), /sha512|checksum/i)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('verifies the generated SHA256SUMS.txt values', async() => {
  const directory = await makeFixture({ corruptChecksum: true })
  try {
    assertRejected(runVerifier(directory), /SHA256SUMS|checksum/i)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('rejects unsupported Linux release artifacts', async() => {
  const directory = await makeFixture({ includeLinuxArtifact: true })
  try {
    assertRejected(runVerifier(directory), /Linux|unsupported/i)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
