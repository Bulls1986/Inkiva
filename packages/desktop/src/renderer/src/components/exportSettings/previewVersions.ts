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

/** Identity of each existing image at generation time; missing files are skipped. */
export const collectResourceSnapshots = async(
  paths: string[],
  stat: (path: string) => Promise<{ mtimeMs: number, size: number } | null>
): Promise<PdfResourceSnapshot[]> => {
  const snapshots: PdfResourceSnapshot[] = []
  for (const path of paths) {
    const current = await stat(path)
    if (current) snapshots.push({ path, mtimeMs: current.mtimeMs, size: current.size })
  }
  return snapshots
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
