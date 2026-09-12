export type RepeatableExportType = 'pdf' | 'styledHtml'

export interface LastExportTarget {
  type: string
  filePath: string
}

export const isRepeatableExportType = (type: string): type is RepeatableExportType =>
  type === 'pdf' || type === 'styledHtml'

/**
 * Return a prior target only when it belongs to the same file-export mode.
 * Keeping this as a pure guard makes the repeat-export path explicit and
 * prevents a PDF target from being accidentally reused for HTML (or print).
 */
export const getReusableExportPath = (
  target: LastExportTarget | null | undefined,
  type: string
): string | undefined => {
  if (!target || !isRepeatableExportType(type) || target.type !== type || !target.filePath) {
    return undefined
  }

  return target.filePath
}
