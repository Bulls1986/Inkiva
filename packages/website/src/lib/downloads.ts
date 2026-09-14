export const DOWNLOAD = {
  releases: 'https://github.com/Bulls1986/Inkiva/releases',
  repo: 'https://github.com/Bulls1986/Inkiva',
  contributing: 'https://github.com/Bulls1986/Inkiva/blob/develop/.github/CONTRIBUTING.md',
  issues: 'https://github.com/Bulls1986/Inkiva/issues'
} as const

export const DOWNLOAD_TARGETS = [
  {
    id: 'windows-x64',
    label: 'Windows x64',
    detail: 'Installer and portable zip',
    href: DOWNLOAD.releases
  },
  {
    id: 'macos-x64',
    label: 'macOS Intel',
    detail: 'DMG and zip for Intel Macs',
    href: DOWNLOAD.releases
  },
  {
    id: 'macos-arm64',
    label: 'macOS Apple Silicon',
    detail: 'DMG and zip for Apple silicon',
    href: DOWNLOAD.releases
  }
] as const
