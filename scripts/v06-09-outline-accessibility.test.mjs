import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const file = new URL('../packages/desktop/src/renderer/src/components/sideBar/tocVirtualized.vue', import.meta.url)
const source = readFileSync(file, 'utf8')

test('V06-09 virtualized outline exposes tree/item roles and focusable keyboard contract', () => {
  assert.match(source, /role="tree"/)
  assert.match(source, /role="treeitem"/)
  assert.match(source, /:tabindex=/)
  assert.match(source, /@keydown="handleKeydown"/)
  assert.match(source, /preventScroll: true/)
})

test('V06-09 virtualized outline has keyboard traversal/activation and depth semantics', () => {
  assert.match(source, /:aria-level="row.depth \+ 1"/)
  assert.match(source, /aria-expanded/)
  for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter']) {
    assert.ok(source.includes(`event.key === '${key}'`), `Missing ${key} handling`)
  }
})
