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
    expect(virtualToc).toContain('tabindex="0"')
    expect(virtualToc).toContain(':aria-activedescendant="')
    expect(virtualToc).toContain('@keydown="handleKeydown"')
  })

  it('keeps a stable keyboard receiver while a deep virtual row remounts', () => {
    // Linux E2E found rapid Home -> End -> Enter could miss Enter while
    // the formerly focused row was removed from the virtual window.
    expect(virtualToc).toContain(':id="`toc-virtual-$' + '{row.key}`"')
    expect(virtualToc).toContain(':data-focused="row.key === keyboardTargetKey"')
    expect(virtualToc).toContain('event.target !== viewport.value')
    expect(virtualToc).toContain('focusedKey.value = row.key')
  })

  it('does not let delayed editor-active notifications override keyboard-owned TOC scroll', () => {
    expect(virtualToc).toContain('if (document.activeElement === viewport.value) return')
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
