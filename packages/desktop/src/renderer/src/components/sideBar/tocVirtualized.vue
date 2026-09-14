<template>
  <div
    ref="viewport"
    class="el-tree toc-virtualized-tree"
    @scroll="handleScroll"
  >
    <div
      class="toc-virtual-spacer"
      :style="{ height: \`\${windowState.totalHeight}px\` }"
    >
      <div
        class="toc-virtual-window"
        :style="{ transform: \`translateY(\${windowState.offsetTop}px)\` }"
      >
        <div
          v-for="row in visibleRows"
          :key="row.key"
          class="el-tree-node"
          :data-key="row.key"
        >
          <div
            class="el-tree-node__content"
            :style="{ paddingLeft: \`\${row.depth * 10 + 8}px\` }"
            @click="emit('node-click', { slug: row.slug })"
          >
            <button
              v-if="row.hasChildren"
              type="button"
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
import { computed, onMounted, ref, onBeforeUnmount } from 'vue'
import { calculateVirtualWindow } from '@/util/virtualization'
import { flattenTocRows, type VirtualTocRow } from '@/util/tocVirtualization'
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
const rows = computed<VirtualTocRow[]>(() => flattenTocRows(props.nodes, expanded.value))
const windowState = computed(() =>
  calculateVirtualWindow(
    rows.value.length,
    ROW_HEIGHT,
    scrollTop.value,
    viewportHeight.value
  )
)
const visibleRows = computed(() =>
  rows.value.slice(windowState.value.startIndex, windowState.value.endIndex)
)

const isExpanded = (key: string): boolean => expanded.value.has(key)

const toggle = (key: string): void => {
  const event = isExpanded(key) ? 'node-collapse' : 'node-expand'
  emit(event, { key })
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
