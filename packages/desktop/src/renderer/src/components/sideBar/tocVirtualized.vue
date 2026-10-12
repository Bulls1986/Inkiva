<template>
  <div
    ref="viewport"
    class="el-tree toc-virtualized-tree"
    role="tree"
    aria-label="Document outline"
    tabindex="0"
    :aria-activedescendant="keyboardTargetKey ? `toc-virtual-${keyboardTargetKey}` : undefined"
    @scroll="handleScroll"
    @keydown="handleKeydown"
  >
    <div
      class="toc-virtual-spacer"
      :style="{ height: `${windowState.totalHeight}px` }"
    >
      <div
        class="toc-virtual-window"
        :style="{ transform: `translateY(${windowState.offsetTop}px)` }"
      >
        <div
          v-for="row in visibleRows"
          :key="row.key"
          class="el-tree-node"
          :data-key="row.key"
          :id="`toc-virtual-${row.key}`"
          :data-focused="row.key === keyboardTargetKey"
          role="treeitem"
          :aria-level="row.depth + 1"
          :aria-expanded="row.hasChildren ? isExpanded(row.key) : undefined"
          :aria-current="row.slug === activeTocSlug ? 'location' : undefined"
          :aria-label="String(row.label)"
          tabindex="-1"
        >
          <div
            class="el-tree-node__content"
            :style="{ paddingLeft: `${row.depth * 10 + 8}px` }"
            @click="emit('node-click', { slug: row.slug })"
          >
            <button
              v-if="row.hasChildren"
              type="button"
              tabindex="-1"
              class="toc-virtual-toggle"
              :aria-expanded="isExpanded(row.key)"
              :aria-label="isExpanded(row.key) ? 'Collapse heading' : 'Expand heading'"
              @click.stop="toggle(row.key)"
            >
              <el-icon
                :size="12"
                :class="{ fold: !isExpanded(row.key) }"
              >
                <ArrowRight />
              </el-icon>
            </button>
            <span
              class="el-tree-node__label toc-node-label"
              :class="{ 'is-active': row.slug === activeTocSlug }"
              :aria-current="row.slug === activeTocSlug ? 'location' : undefined"
              data-testid="toc-node-label"
            >
              {{ row.label }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, onBeforeUnmount, watch } from 'vue'
import { calculateVirtualWindow } from '@/util/virtualization'
import { createTocRowModel, type VirtualTocRow } from '@/util/tocVirtualization'
import type { KeyedTocNode } from '@/util/tocKeys'
import { ArrowRight } from '@element-plus/icons-vue'

const props = defineProps<{
  nodes: readonly KeyedTocNode[]
  expandedKeys: readonly string[]
  activeTocSlug: unknown
  wordWrap: boolean
}>()

const emit = defineEmits<{
  (event: 'node-click', data: { slug: unknown }): void
  (event: 'node-expand', data: { key: string }): void
  (event: 'node-collapse', data: { key: string }): void
}>()

const ROW_HEIGHT = 34
const DEFAULT_VIEWPORT_HEIGHT = 600
const viewport = ref<HTMLDivElement | null>(null)
const scrollTop = ref(0)
const viewportHeight = ref(DEFAULT_VIEWPORT_HEIGHT)

const expanded = computed(() => new Set(props.expandedKeys))
const rowModel = computed(() => createTocRowModel(props.nodes, expanded.value))
const windowState = computed(() =>
  calculateVirtualWindow(
    rowModel.value.totalRows,
    ROW_HEIGHT,
    scrollTop.value,
    viewportHeight.value
  )
)
const visibleRows = computed<VirtualTocRow[]>(() =>
  rowModel.value.getRows(windowState.value.startIndex, windowState.value.endIndex)
)

// Only user keyboard interaction materializes the full logical outline.
// Muya owns the editor viewport; this component scrolls its own TOC only.
const keyboardRows = computed(() => {
  const model = rowModel.value
  return model.getRows(0, model.totalRows)
})
const focusedKey = ref<string | null>(null)
const keyboardTargetKey = computed(() => focusedKey.value ?? visibleRows.value[0]?.key ?? null)
const indexOfKey = (key: string): number =>
  keyboardRows.value.findIndex((row) => row.key === key)

const revealOutlineRow = (index: number): void => {
  const el = viewport.value
  if (!el || index < 0) return
  const height = el.clientHeight || viewportHeight.value
  const top = index * ROW_HEIGHT
  const bottom = top + ROW_HEIGHT
  if (top < el.scrollTop) el.scrollTop = top
  else if (bottom > el.scrollTop + height) el.scrollTop = bottom - height
  scrollTop.value = el.scrollTop
}

// The tree is the stable focus owner; its virtual rows are DOM projections.
// Keep the logical active descendant even while a distant row is remounted.
// No deferred focus writer can steal focus from a newer editor/user action.
const focusRow = (index: number): void => {
  const row = keyboardRows.value[index]
  if (!row) return
  focusedKey.value = row.key
  revealOutlineRow(index)
}

const handleKeydown = (event: KeyboardEvent): void => {
  if (event.target !== viewport.value) return
  const index = indexOfKey(keyboardTargetKey.value ?? '')
  const rows = keyboardRows.value
  const row = rows[index]
  if (!row) return
  let next: number | null = null

  if (event.key === 'ArrowDown') next = Math.min(index + 1, rows.length - 1)
  else if (event.key === 'ArrowUp') next = Math.max(0, index - 1)
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = rows.length - 1
  else if (event.key === 'ArrowLeft') {
    if (row.hasChildren && isExpanded(row.key)) toggle(row.key)
    else {
      for (let i = index - 1; i >= 0; i--) {
        if (rows[i]!.depth < row.depth) {
          next = i
          break
        }
      }
    }
  } else if (event.key === 'ArrowRight') {
    if (row.hasChildren && !isExpanded(row.key)) toggle(row.key)
    else if (rows[index + 1]?.depth > row.depth) next = index + 1
  } else if (event.key === 'Enter' || event.key === ' ') {
    emit('node-click', { slug: row.slug })
  } else return

  event.preventDefault()
  event.stopPropagation()
  if (next !== null) focusRow(next)
}

// Editor heading notifications are asynchronous. They may reveal the active
// outline row only when the user is NOT navigating this tree by keyboard;
// otherwise a delayed editor update can scroll the virtual window away from
// its aria-activedescendant before End/Enter completes.
watch(() => props.activeTocSlug, (slug) => {
  if (document.activeElement === viewport.value) return
  if (typeof slug !== 'string') return
  const index = keyboardRows.value.findIndex((row) => row.slug === slug)
  if (index >= 0) revealOutlineRow(index)
}, { flush: 'post' })

const isExpanded = (key: string): boolean => expanded.value.has(key)

const toggle = (key: string): void => {
  if (isExpanded(key)) {
    emit('node-collapse', { key })
  } else {
    emit('node-expand', { key })
  }
}

const handleScroll = (event: Event): void => {
  scrollTop.value = (event.currentTarget as HTMLElement).scrollTop
}

const updateViewportHeight = (): void => {
  const height = viewport.value?.clientHeight ?? 0
  if (height > 0) viewportHeight.value = height
}

onMounted(() => {
  updateViewportHeight()
  window.addEventListener('resize', updateViewportHeight)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateViewportHeight)
})
</script>

<style scoped>
.toc-virtualized-tree {
  min-height: 0;
  height: 100%;
  overflow: auto;
  background: transparent;
  color: var(--text-secondary);
  contain: strict;
}

.toc-virtual-window {
  position: absolute;
  inset-inline: 0;
  top: 0;
}

.toc-virtual-spacer {
  position: relative;
  min-height: 1px;
}

.toc-virtualized-tree .el-tree-node {
  height: 34px;
  margin-top: 0;
}

.toc-virtualized-tree:focus-visible .el-tree-node[data-focused="true"] > .el-tree-node__content {
  outline: 2px solid var(--color-accent-focus);
  outline-offset: -2px;
}

.toc-virtualized-tree .el-tree-node__content {
  height: 34px;
  cursor: pointer;
}

.toc-virtualized-tree .el-tree-node__content:hover {
  background: var(--surface-hover);
}

.toc-virtual-toggle {
  display: inline-flex;
  flex: 0 0 20px;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 24px;
  padding: 0;
  border: 0;
  color: var(--icon-secondary);
  background: transparent;
  cursor: pointer;
}

.toc-virtual-toggle .el-icon {
  transition: transform var(--motion-normal);
  transform: rotate(90deg);
}

.toc-virtual-toggle .el-icon.fold {
  transform: rotate(0);
}

.toc-virtualized-tree .toc-node-label {
  flex: 1;
  min-width: 0;
}
</style>
