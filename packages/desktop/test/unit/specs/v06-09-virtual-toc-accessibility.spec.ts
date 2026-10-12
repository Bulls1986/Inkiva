import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

// The desktop unit runner cannot compile .vue SFCs (no @vitejs/plugin-vue).
// This source contract closes the virtual TOC keyboard accessibility gap;
// the real Electron spec exercises the actual user actions end to end.
const virtualToc = fs.readFileSync(
  'src/renderer/src/components/sideBar/tocVirtualized.vue',
  'utf8'
)

describe('V06-09 virtual TOC keyboard and semantic accessibility contract', () => {
  it('exposes a navigable tree with one focusable item and an owned keyboard handler', () => {
    expect(virtualToc).toContain('role="tree"')
    expect(virtualToc).toContain('role="treeitem"')
    expect(virtualToc).toContain(':tabindex="')
    expect(virtualToc).toContain('@keydown="handleKeydown"')
    expect(virtualToc).toContain('preventScroll: true')
  })

  it('includes logical tree hierarchy, expansion state and active heading semantics', () => {
    expect(virtualToc).toContain(':aria-level="row.depth + 1"')
    expect(virtualToc).toContain('aria-expanded')
    expect(virtualToc).toContain('aria-current')
    expect(virtualToc).toContain('event.key === \'ArrowDown\'')
    expect(virtualToc).toContain('event.key === \'ArrowUp\'')
    expect(virtualToc).toContain('event.key === \'Enter\'')
    expect(virtualToc).toContain('event.key === \'ArrowLeft\'')
    expect(virtualToc).toContain('event.key === \'ArrowRight\'')
  })
})
