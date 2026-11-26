import type { PdfPreviewVersionSnapshot, PdfResourceSnapshot } from '@/services/pdfPreviewSession'

/**
 * Version snapshots that decide whether a preview is still the current one.
 *
 * They are intentionally cheap and deterministic: they are recomputed on every
 * settings change and again right before saving, so a preview that no longer
 * matches the document, the export settings or the referenced resources can
 * never be written.
 */

// FNV-1a: short, dependency-free, good enough for "did this change?".
export const hashString = (value: string): string => {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}

const IMG_SRC_REG = /<img\b[^>]*?\ssrc="([^"]*)"/gi

export const computeSettingsVersion = (options: Record<string, unknown>): string => {
  const { reuseLastPath: _reuseLastPath, ...rest } = options
  return hashString(JSON.stringify(rest))
}

/**
 * Resource snapshot for the generated HTML: referenced images plus the export
 * CSS that was inlined into it. A missing/added image or a theme change makes
 * the old preview stale (P2/P7).
 */
export const computeResourceVersion = (html: string, extraCss: string): string => {
  const sources: string[] = []
  IMG_SRC_REG.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = IMG_SRC_REG.exec(html)) !== null) {
    sources.push(match[1] ?? '')
  }
  return hashString(sources.join('\n') + '\n' + extraCss)
}

/**
 * Local images the exported HTML embeds as absolute `file://` URLs. These are the
 * resources whose on-disk change must invalidate a generated preview.
 */
export const extractLocalImagePaths = (html: string): string[] => {
  const paths: string[] = []
  IMG_SRC_REG.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = IMG_SRC_REG.exec(html)) !== null) {
    const src = match[1] ?? ''
    if (!src.toLowerCase().startsWith('file://')) continue
    let path = decodeURI(src.slice('file://'.length))
    // `file:///E:/x.png` keeps a leading slash in front of a Windows drive.
    if (/^\/[a-zA-Z]:[\\/]/.test(path)) path = path.slice(1)
    if (!paths.includes(path)) paths.push(path)
  }
  return paths
}

/**
 * Content identity of every referenced image, including the ones that cannot be
 * read right now. A missing image is recorded with `hash: null` on purpose: if it
 * appears later the pagination changes, so the old preview must go stale instead
 * of silently keeping a PDF that was laid out without it (P2/P7).
 *
 * The hash is SHA-256 of the bytes. Size and mtime are not identity — a
 * replacement can keep both and still render different pages.
 */
export const collectResourceSnapshots = async(
  paths: string[],
  read: (path: string) => Promise<{ hash: string } | null>
): Promise<PdfResourceSnapshot[]> => {
  const snapshots: PdfResourceSnapshot[] = []
  for (const path of paths) {
    const current = await read(path)
    snapshots.push({ path, hash: current?.hash ?? null })
  }
  return snapshots
}

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

/**
 * Hash a local file's bytes through the preload bridge. Returns null when the
 * file is missing or unreadable, which the snapshot records as "was not usable".
 */
export const readResourceHash = async(
  path: string,
  readFile: (path: string) => Promise<unknown>
): Promise<{ hash: string } | null> => {
  try {
    const data = await readFile(path)
    const bytes =
      data instanceof Uint8Array
        ? data
        : typeof data === 'string'
          ? new TextEncoder().encode(data)
          : new Uint8Array(data as ArrayBufferLike)
    const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource)
    return { hash: toHex(digest) }
  } catch {
    return null
  }
}

export const buildVersionSnapshot = (input: {
  documentVersion: string | number
  settingsOptions: Record<string, unknown>
  html: string
  extraCss: string
}): PdfPreviewVersionSnapshot => ({
  documentVersion: String(input.documentVersion),
  settingsVersion: computeSettingsVersion(input.settingsOptions),
  resourceVersion: computeResourceVersion(input.html, input.extraCss)
})
