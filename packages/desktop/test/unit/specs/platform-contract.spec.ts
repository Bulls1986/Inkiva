import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const desktopRoot = path.resolve(__dirname, '../../../')
const repositoryRoot = path.resolve(desktopRoot, '../..')

const readRepoFile = (relativePath: string): string =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8')

const withoutCommentOnlyLines = (source: string): string =>
  source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n')

describe('official platform and release contract', () => {
  it('keeps desktop packaging and scripts limited to official targets', () => {
    const builder = readRepoFile('packages/desktop/electron-builder.yml')
    const rootPackage = JSON.parse(readRepoFile('package.json')) as {
      scripts: Record<string, string>
    }
    const desktopPackage = JSON.parse(readRepoFile('packages/desktop/package.json')) as {
      scripts: Record<string, string>
    }

    expect(builder).toMatch(/^win:\s*$/m)
    expect(builder).toMatch(/^mac:\s*$/m)
    expect(builder).toMatch(/^\s+- target: 'nsis'$/m)
    expect(builder).toMatch(/^\s+- target: 'zip'$/m)
    expect(builder).toMatch(/artifactName: 'inkiva-win-\$\{arch\}-\$\{version\}\.\$\{ext\}'/)
    expect(builder).toMatch(/artifactName: 'inkiva-mac-\$\{arch\}-\$\{version\}\.\$\{ext\}'/)
    expect(builder).not.toMatch(/^linux:\s*$/m)
    expect(builder).not.toMatch(/inkiva-linux|AppImage|snap|tar\.gz/)

    for (const scripts of [rootPackage.scripts, desktopPackage.scripts]) {
      expect(scripts['build:win:arm64']).toBeUndefined()
      expect(scripts['build:linux']).toBeUndefined()
    }
    expect(rootPackage.scripts['test:release']).toBe(
      'node --import tsx --test scripts/verifyUpdateArtifacts.test.ts'
    )
  })

  it('builds only Windows x64 and both macOS architectures', () => {
    const workflows = [
      readRepoFile('.github/workflows/build.yml'),
      readRepoFile('.github/workflows/release.yml')
    ]

    for (const workflow of workflows) {
      const active = withoutCommentOnlyLines(workflow)
      expect(active).toMatch(/name: windows-x64/)
      expect(active).toMatch(/name: macos-x64/)
      expect(active).toMatch(/name: macos-arm64/)
      expect(active).not.toMatch(/^\s+platform: linux\s*$/m)
      expect(active).not.toMatch(/build:linux/)
      expect(active).not.toMatch(/dist\/\*\.(?:AppImage|snap|deb|rpm|tar\.gz)/)
      expect(active).not.toMatch(/name: (?:linux|win-arm64)/)
    }

    const releaseWorkflow = readRepoFile('.github/workflows/release.yml')
    expect(releaseWorkflow).toMatch(/path: artifact-downloads/)
    expect(releaseWorkflow).toMatch(/find artifact-downloads -type f ! -name 'latest-mac\.yml'/)
    expect(releaseWorkflow).toMatch(/dist\/\*\.blockmap/)
    expect(releaseWorkflow).toMatch(/dist\/\*\.yml/)
    expect(releaseWorkflow).toMatch(/latest-mac\.yml/)
    expect(releaseWorkflow).toMatch(/Merge macOS updater metadata/)
    expect(releaseWorkflow).toMatch(/Expected exactly two macOS updater metadata files/)
    expect(releaseWorkflow).toMatch(/inkiva-mac-x64-\$\{version\}\.zip/)
    expect(releaseWorkflow).toMatch(/inkiva-mac-arm64-\$\{version\}\.zip/)
  })

  it('retains the Ubuntu host for the desktop E2E workflow', () => {
    const e2eWorkflow = readRepoFile('.github/workflows/e2e.yml')
    expect(e2eWorkflow).toMatch(/runs-on: ubuntu-24\.04/)
    expect(e2eWorkflow).toMatch(/xvfb-run --auto-servernum pnpm test:e2e/)
  })
})
