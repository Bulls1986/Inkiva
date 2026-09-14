import type { KeyedTocNode } from './tocKeys'

export interface VirtualTocRow {
  key: string
  label: unknown
  slug: unknown
  depth: number
  hasChildren: boolean
}

export const flattenTocRows = (
  nodes: readonly KeyedTocNode[],
  expandedKeys: ReadonlySet<string>
): VirtualTocRow[] => {
  const rows: VirtualTocRow[] = []

  const visit = (items: readonly KeyedTocNode[], depth: number): void => {
    for (const node of items) {
      rows.push({
        key: node.key,
        label: node.label,
        slug: node.slug,
        depth,
        hasChildren: node.children.length > 0
      })
      if (node.children.length > 0 && expandedKeys.has(node.key)) {
        visit(node.children, depth + 1)
      }
    }
  }

  visit(nodes, 0)
  return rows
}
