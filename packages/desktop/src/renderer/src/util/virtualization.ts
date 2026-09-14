export const MAX_VIRTUALIZED_ROWS = 300 as const

export interface VirtualWindow {
  startIndex: number
  endIndex: number
  offsetTop: number
  totalHeight: number
}

const assertFiniteNonNegative = (value: number, label: string): void => {
  if (!Number.isFinite(value) || value < 0) throw new Error(label + ' must be finite and non-negative')
}

export const calculateVirtualWindow = (
  totalRows: number,
  rowHeight: number,
  scrollTop: number,
  viewportHeight: number,
  maxRenderedRows = MAX_VIRTUALIZED_ROWS
): VirtualWindow => {
  if (!Number.isInteger(totalRows) || totalRows < 0) {
    throw new Error('totalRows must be a non-negative integer')
  }
  if (!Number.isFinite(rowHeight) || rowHeight <= 0) {
    throw new Error('rowHeight must be a positive number')
  }
  assertFiniteNonNegative(scrollTop, 'scrollTop')
  assertFiniteNonNegative(viewportHeight, 'viewportHeight')
  if (!Number.isInteger(maxRenderedRows) || maxRenderedRows < 1) {
    throw new Error('maxRenderedRows must be a positive integer')
  }

  const totalHeight = totalRows * rowHeight
  if (totalRows === 0) {
    return { startIndex: 0, endIndex: 0, offsetTop: 0, totalHeight }
  }

  const visibleRows = Math.max(1, Math.ceil(viewportHeight / rowHeight))
  const rowBudget = Math.min(
    totalRows,
    maxRenderedRows,
    Math.max(visibleRows, visibleRows * 3)
  )
  const overscan = Math.max(0, Math.floor((rowBudget - visibleRows) / 2))
  const requestedStart = Math.floor(scrollTop / rowHeight) - overscan
  const maxStart = Math.max(0, totalRows - rowBudget)
  const startIndex = Math.min(maxStart, Math.max(0, requestedStart))
  const endIndex = Math.min(totalRows, startIndex + rowBudget)

  return {
    startIndex,
    endIndex,
    offsetTop: startIndex * rowHeight,
    totalHeight
  }
}
