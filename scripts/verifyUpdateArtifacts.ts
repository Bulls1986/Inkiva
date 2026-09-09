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
  'SHA256SUMS.txt'
]

for (const filename of requiredFiles) {
  if (!fs.existsSync(path.join(dist, filename))) fail(`Missing release artifact: ${filename}`)
}

const latestYaml = fs.readFileSync(path.join(dist, 'latest.yml'), 'utf8')
if (!new RegExp(`^version:\\s*${version.replaceAll('.', '\\.')}\\s*$`, 'm').test(latestYaml)) {
  fail(`latest.yml does not describe version ${version}`)
}
if (!latestYaml.includes(`inkiva-win-x64-${version}-setup.exe`)) {
  fail('latest.yml does not point to the Windows NSIS installer')
}
if (!/^sha512:\s*\S+/m.test(latestYaml)) fail('latest.yml is missing sha512 metadata')

const checksums = fs.readFileSync(path.join(dist, 'SHA256SUMS.txt'), 'utf8')
for (const filename of requiredFiles.filter((file) => file !== 'SHA256SUMS.txt')) {
  if (!checksums.includes(filename)) fail(`SHA256SUMS.txt does not cover ${filename}`)
}

console.log(`Verified stable updater artifacts for ${tag}.`)
