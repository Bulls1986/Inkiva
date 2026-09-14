import fs from 'fs'
import path from 'path'

export interface CanonicalPath {
  /** Normalized path used when opening or displaying the document. */
  path: string
  /** Stable comparison key for the target platform. */
  key: string
}

const getPathApi = (platform: NodeJS.Platform): typeof path.posix | typeof path.win32 =>
  platform === 'win32' ? path.win32 : path.posix

/**
 * Normalize a path using the rules of the target operating system.
 *
 * `realpath` is intentionally best-effort: a recovery entry may point at a
 * deleted file, but the missing path still has to be stable enough to dedupe
 * repeated startup/open requests. Existing paths additionally collapse
 * symlink aliases when the process is running on the target platform.
 */
export const canonicalizePath = (
  pathname: string,
  platform: NodeJS.Platform = process.platform
): CanonicalPath => {
  if (typeof pathname !== 'string' || pathname.length === 0) {
    return { path: '', key: '' }
  }

  const pathApi = getPathApi(platform)
  let normalized = pathApi.normalize(pathApi.resolve(pathname))

  if (platform === process.platform) {
    try {
      normalized = pathApi.normalize(fs.realpathSync.native(normalized))
    } catch {
      // Missing recovery files and paths from a not-yet-mounted volume are
      // still valid inputs. Keep the lexical normalization in that case.
    }
  }

  if (platform === 'win32') {
    normalized = normalized.replace(/^([a-z]):/, (_, drive: string) => `${drive.toUpperCase()}:`)
  }

  const key = platform === 'win32' || platform === 'darwin' ? normalized.toLowerCase() : normalized
  return { path: normalized, key }
}

export const canonicalPathKey = (
  pathname: string,
  platform: NodeJS.Platform = process.platform
): string | null => {
  const { key } = canonicalizePath(pathname, platform)
  return key || null
}
