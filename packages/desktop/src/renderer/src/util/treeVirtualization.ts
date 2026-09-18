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

export interface VirtualTreeRowModel {
  readonly totalRows: number
  getRows: (startIndex: number, endIndex: number) => VirtualTreeRow[]
  findRowIndex: (pathname: string) => number | undefined
}

const isFolderCollapsed = (
  folder: TreeFolderNode,
  collapsedPaths: ReadonlySet<string>,
  expandedPaths: ReadonlySet<string>
): boolean =>
  collapsedPaths.has(folder.pathname) ||
  (folder.isCollapsed === true && !expandedPaths.has(folder.pathname))

const assertRange = (startIndex: number, endIndex: number): void => {
  if (
    !Number.isInteger(startIndex) ||
    !Number.isInteger(endIndex) ||
    startIndex < 0 ||
    endIndex < startIndex
  ) {
    throw new Error('tree row range must be a non-negative ordered integer pair')
  }
}

const countVisibleTreeRows = (
  root: TreeNode,
  collapsedPaths: ReadonlySet<string>,
  expandedPaths: ReadonlySet<string>
): number => {
  let count = 0

  const visitFolder = (folder: TreeFolderNode): void => {
    count += 1
    if (isFolderCollapsed(folder, collapsedPaths, expandedPaths)) return
    for (const child of folder.folders) visitFolder(child)
    count += folder.files.length
  }

  for (const folder of root.folders) visitFolder(folder)
  count += root.files.length
  return count
}

function * iterateTreeRows(
  root: TreeNode,
  collapsedPaths: ReadonlySet<string>,
  expandedPaths: ReadonlySet<string>
): Generator<VirtualTreeRow> {
  const visitFolder = function * (
    folder: TreeFolderNode,
    depth: number
  ): Generator<VirtualTreeRow> {
    yield {
      kind: 'folder',
      key: 'folder:' + folder.pathname,
      depth,
      node: folder
    }
    if (isFolderCollapsed(folder, collapsedPaths, expandedPaths)) return

    for (const child of folder.folders) yield * visitFolder(child, depth + 1)
    for (const file of folder.files) {
      yield {
        kind: 'file',
        key: 'file:' + file.pathname,
        depth,
        node: file
      }
    }
  }

  for (const folder of root.folders) yield * visitFolder(folder, 0)
  for (const file of root.files) {
    yield {
      kind: 'file',
      key: 'file:' + file.pathname,
      depth: 0,
      node: file
    }
  }
}

export const countTreeRows = (
  root: TreeNode,
  collapsedPaths: ReadonlySet<string> = new Set(),
  expandedPaths: ReadonlySet<string> = new Set()
): number => countVisibleTreeRows(root, collapsedPaths, expandedPaths)

export const createTreeRowModel = (
  root: TreeNode,
  collapsedPaths: ReadonlySet<string> = new Set(),
  expandedPaths: ReadonlySet<string> = new Set()
): VirtualTreeRowModel => {
  const totalRows = countVisibleTreeRows(root, collapsedPaths, expandedPaths)
  const iterator = iterateTreeRows(root, collapsedPaths, expandedPaths)
  const materializedRows: VirtualTreeRow[] = []
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
    },
    findRowIndex: (pathname) => {
      if (!pathname) return undefined
      let index = 0
      while (index < totalRows) {
        materializeUntil(index + 1)
        const row = materializedRows[index]
        if (!row) return undefined
        if (row.node.pathname === pathname) return index
        index += 1
      }
      return undefined
    }
  }
}

export const flattenTreeRows = (
  root: TreeNode,
  collapsedPaths: ReadonlySet<string> = new Set(),
  expandedPaths: ReadonlySet<string> = new Set()
): VirtualTreeRow[] => {
  const model = createTreeRowModel(root, collapsedPaths, expandedPaths)
  return model.getRows(0, model.totalRows)
}

export const hasMoreThanTreeRows = (
  root: TreeNode,
  limit: number,
  collapsedPaths: ReadonlySet<string> = new Set(),
  expandedPaths: ReadonlySet<string> = new Set()
): boolean => {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('limit must be a positive integer')
  let count = 0

  const visitFolder = (folder: TreeFolderNode): boolean => {
    count += 1
    if (count > limit) return true
    if (isFolderCollapsed(folder, collapsedPaths, expandedPaths)) return false
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
