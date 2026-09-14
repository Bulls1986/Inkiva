import type {
  TreeFileNode,
  TreeFolderNode,
  TreeNode
} from '../components/sideBar/types'

export interface VirtualTreeFolderRow {
  kind: 'folder'
  key: string
  depth: number
  node: TreeFolderNode
}

export interface VirtualTreeFileRow {
  kind: 'file'
  key: string
  depth: number
  node: TreeFileNode
}

export type VirtualTreeRow = VirtualTreeFolderRow | VirtualTreeFileRow

export const flattenTreeRows = (
  root: TreeNode,
  collapsedPaths: ReadonlySet<string> = new Set()
): VirtualTreeRow[] => {
  const rows: VirtualTreeRow[] = []

  const visitFolder = (folder: TreeFolderNode, depth: number): void => {
    rows.push({
      kind: 'folder',
      key: 'folder:' + folder.pathname,
      depth,
      node: folder
    })
    if (folder.isCollapsed === true || collapsedPaths.has(folder.pathname)) return

    for (const child of folder.folders) visitFolder(child, depth + 1)
    for (const file of folder.files) {
      rows.push({
        kind: 'file',
        key: 'file:' + file.pathname,
        depth,
        node: file
      })
    }
  }

  for (const folder of root.folders) visitFolder(folder, 0)
  for (const file of root.files) {
    rows.push({
      kind: 'file',
      key: 'file:' + file.pathname,
      depth: 0,
      node: file
    })
  }

  return rows
}

export const hasMoreThanTreeRows = (root: TreeNode, limit: number): boolean => {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('limit must be a positive integer')
  let count = 0

  const visitFolder = (folder: TreeFolderNode): boolean => {
    count += 1
    if (count > limit) return true
    if (folder.isCollapsed === true) return false
    for (const child of folder.folders) {
      if (visitFolder(child)) return true
    }
    for (const file of folder.files) {
      count += 1
      if (count > limit) return true
    }
    return false
  }

  for (const folder of root.folders) {
    if (visitFolder(folder)) return true
  }
  for (const file of root.files) {
    count += 1
    if (count > limit) return true
  }
  return false
}
