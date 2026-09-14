const encoder = new TextEncoder()

/**
 * Documents above the supported WYSIWYG envelope use the bounded source
 * surface. The fallback keeps the complete text editable while CodeMirror
 * virtualizes its visible lines, so opening an extreme file never requires
 * mounting one Muya block per paragraph.
 */
export const EXTREME_DOCUMENT_DEGRADE_THRESHOLD_BYTES = 2 * 1024 * 1024

export const EXTREME_DOCUMENT_VIEWPORT_MARGIN = 20

/**
 * The secondary split pane must never turn an extreme document into a second
 * full Markdown render. Keep a readable source preview bounded instead.
 */
export const MAX_DEGRADED_PREVIEW_CHARS = 64 * 1024

export const getBoundedDocumentPreview = (
  markdown: string,
  maxChars = MAX_DEGRADED_PREVIEW_CHARS
): string => {
  const limit = Number.isFinite(maxChars) ? Math.max(0, Math.floor(maxChars)) : 0
  return markdown.length <= limit ? markdown : markdown.slice(0, limit)
}

export const getDocumentByteLength = (markdown: string): number =>
  encoder.encode(markdown).byteLength

export const shouldUseDegradedLargeDocumentMode = (markdown: string): boolean =>
  getDocumentByteLength(markdown) > EXTREME_DOCUMENT_DEGRADE_THRESHOLD_BYTES
