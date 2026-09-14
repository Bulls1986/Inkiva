import type { KeyedTocNode } from './tocKeys'

export interface VirtualTocRow {
  key: string
  label: unknown
  slug: unknown
  depth: number
  hasChildren: boolean
}

export interface VirtualTocRowModel {
  readonly totalRows: number
  getRows: (startIndex: number, endIndex: number) => VirtualTocRow[]
}

const assertRange = (startIndex: number, endIndex: number): void => {
  if (
    !Number.isInteger(startIndex) ||
    !Number.isInteger(endIndex) ||
    startIndex < 0 ||
    endIndex < startIndex
  ) {
    throw new Error('toc row range must be a non-negative ordered integer pair')
  }
}

const countVisibleTocRows = (
  nodes: readonly KeyedTocNode[],
  expandedKeys: ReadonlySet<string>
): number => {
  let count = 0

  const visit = (items: readonly KeyedTocNode[]): void => {
    for (const node of items) {
      count += 1
      if (node.children.length > 0 && expandedKeys.has(node.key)) {
        visit(node.children)
      }
    }
  }

  visit(nodes)
  return count
}

function * iterateTocRows(
  nodes: readonly KeyedTocNode[],
  expandedKeys: ReadonlySet<string>
): Generator<VirtualTocRow> {
  const visit = function * (
    items: readonly KeyedTocNode[],
    depth: number
  ): Generator<VirtualTocRow> {
    for (const node of items) {
      yield {
        key: node.key,
        label: node.label,
        slug: node.slug,
        depth,
        hasChildren: node.children.length > 0
      }
      if (node.children.length > 0 && expandedKeys.has(node.key)) {
        yield * visit(node.children, depth + 1)
      }
    }
  }

  yield * visit(nodes, 0)
}

export const countTocRows = (
  nodes: readonly KeyedTocNode[],
  expandedKeys: ReadonlySet<string>
): number => countVisibleTocRows(nodes, expandedKeys)

export const createTocRowModel = (
  nodes: readonly KeyedTocNode[],
  expandedKeys: ReadonlySet<string>
): VirtualTocRowModel => {
  const totalRows = countVisibleTocRows(nodes, expandedKeys)
  const iterator = iterateTocRows(nodes, expandedKeys)
  const materializedRows: VirtualTocRow[] = []
  let exhausted = false

  const materializeUntil = (endIndex: number): void => {
    const target = Math.min(endIndex, totalRows)
    while (!exhausted && materializedRows.length < target) {
      const next = iterator.next()
      if (next.done) {
        exhausted = true
      } else {
        materializedRows.push(next.value)
      }
    }
  }

  return {
    totalRows,
    getRows: (startIndex, endIndex) => {
      assertRange(startIndex, endIndex)
      materializeUntil(endIndex)
      return materializedRows.slice(startIndex, endIndex)
    }
  }
}

export const flattenTocRows = (
  nodes: readonly KeyedTocNode[],
  expandedKeys: ReadonlySet<string>
): VirtualTocRow[] => {
  const model = createTocRowModel(nodes, expandedKeys)
  return model.getRows(0, model.totalRows)
}
