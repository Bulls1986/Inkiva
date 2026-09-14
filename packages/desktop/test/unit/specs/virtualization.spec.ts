import assert from 'node:assert/strict'
import { it } from 'vitest'
import { calculateVirtualWindow } from '@/util/virtualization'
import { flattenTocRows } from '@/util/tocVirtualization'
import { flattenTreeRows } from '@/util/treeVirtualization'

type TestFile = {
  id: string
  pathname: string
  name: string
  isDirectory: false
  isFile: true
  isMarkdown: boolean
}

type TestFolder = {
  id: string
  pathname: string
  name: string
  isDirectory: true
  isFile: false
  isMarkdown: false
  folders: TestFolder[]
  files: TestFile[]
}

const folder = (pathname: string, children: TestFolder[] = []): TestFolder => ({
  id: pathname,
  pathname,
  name: pathname.split('/').at(-1) ?? pathname,
  isDirectory: true as const,
  isFile: false as const,
  isMarkdown: false as const,
  folders: children,
  files: []
})

const file = (pathname: string): TestFile => ({
  id: pathname,
  pathname,
  name: pathname.split('/').at(-1) ?? pathname,
  isDirectory: false as const,
  isFile: true as const,
  isMarkdown: true
})

it('virtual windows cap rendered rows to viewport times three and 300 max', () => {
  const window = calculateVirtualWindow(100_000, 30, 50_000, 3_000)

  assert.ok(window.endIndex - window.startIndex <= 300)
  assert.equal(window.totalHeight, 3_000_000)
  assert.equal(window.offsetTop, window.startIndex * 30)
  assert.equal(calculateVirtualWindow(10, 30, 0, 300).endIndex, 10)
  assert.throws(() => calculateVirtualWindow(10, 0, 0, 300))
  assert.throws(() => calculateVirtualWindow(10, 30, -1, 300))
})

it('tree flattening includes only visible descendants and preserves folder-first order', () => {
  const root = {
    ...folder('workspace'),
    folders: [folder('workspace/docs', [folder('workspace/docs/nested')])],
    files: [file('workspace/readme.md')]
  }

  const expanded = flattenTreeRows(root, new Set())
  assert.deepEqual(
    expanded.map((row) => [row.kind, row.node.pathname, row.depth]),
    [
      ['folder', 'workspace/docs', 0],
      ['folder', 'workspace/docs/nested', 1],
      ['file', 'workspace/readme.md', 0]
    ]
  )

  const collapsed = flattenTreeRows(root, new Set(['workspace/docs']))
  assert.deepEqual(
    collapsed.map((row) => row.node.pathname),
    ['workspace/docs', 'workspace/readme.md']
  )
})

it('toc flattening keeps hierarchy while allowing collapsed branches', () => {
  const rows = flattenTocRows(
    [
      {
        key: 'a',
        label: 'A',
        slug: 'a',
        children: [
          {
            key: 'a-1',
            label: 'A.1',
            slug: 'a-1',
            children: []
          }
        ]
      },
      {
        key: 'b',
        label: 'B',
        slug: 'b',
        children: []
      }
    ],
    new Set(['a'])
  )

  assert.deepEqual(
    rows.map((row) => [row.key, row.depth]),
    [
      ['a', 0],
      ['a-1', 1],
      ['b', 0]
    ]
  )
})
