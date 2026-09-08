import type { NextConfig } from 'next'

import { fetchLatestPublishedReleaseTag } from './src/lib/release-version'

export default async function nextConfig(): Promise<NextConfig> {
  const releaseVersionLabel =
    process.env.INKIVA_RELEASE_VERSION_LABEL?.trim() ||
    (await fetchLatestPublishedReleaseTag({ token: process.env.GITHUB_TOKEN }))

  return {
    reactStrictMode: true,
    output: 'export',
    trailingSlash: true,
    env: {
      NEXT_PUBLIC_INKIVA_RELEASE_VERSION_LABEL: releaseVersionLabel
    },
    images: {
      unoptimized: true
    }
  }
}
