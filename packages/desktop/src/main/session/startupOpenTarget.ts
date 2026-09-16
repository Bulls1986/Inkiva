import type { OpenRequest } from './openRequestCoordinator'
import { canonicalPathKey } from './pathCanonicalizer'

export interface StartupOpenTarget {
  openFolder: (pathname: string) => void
  openTabsFromPaths: (filePaths: string[]) => void
}

export function routeStartupOpenRequest(
  target: StartupOpenTarget,
  request: OpenRequest
): void {
  const filePaths: string[] = []
  const seenPaths = new Set<string>()

  for (const { isDir, path: pathname } of request.paths) {
    const key = canonicalPathKey(pathname) ?? pathname
    if (seenPaths.has(key)) continue
    seenPaths.add(key)

    if (isDir) target.openFolder(pathname)
    else filePaths.push(pathname)
  }

  if (filePaths.length) target.openTabsFromPaths(filePaths)
}
