import rootPackage from '../../../../package.json'

const releaseVersionLabel = process.env.NEXT_PUBLIC_INKIVA_RELEASE_VERSION_LABEL?.trim()

if (!releaseVersionLabel) {
  throw new Error('NEXT_PUBLIC_INKIVA_RELEASE_VERSION_LABEL is required for the website build')
}

export const INKIVA_SOURCE_VERSION = rootPackage.version
export const INKIVA_RELEASE_VERSION_LABEL = releaseVersionLabel
export const INKIVA_RELEASE_VERSION = releaseVersionLabel.replace(/^v/, '')

// Backward-compatible aliases for existing website components.
export const INKIVA_VERSION = INKIVA_RELEASE_VERSION
export const INKIVA_VERSION_LABEL = INKIVA_RELEASE_VERSION_LABEL
