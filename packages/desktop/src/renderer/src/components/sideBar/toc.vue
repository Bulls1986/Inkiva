<template>
  <div
    class="side-bar-toc"
    :class="[{ 'side-bar-toc-overflow': !wordWrapInToc, 'side-bar-toc-wordwrap': wordWrapInToc }]"
  >
    <div class="title">
      {{ t('sideBar.toc.title') }}
    </div>
    <div class="toc-toolbar">
      <el-input
        v-model="searchQuery"
        data-testid="toc-search"
        size="small"
        clearable
        :aria-label="t('sideBar.toc.search')"
        :placeholder="t('sideBar.toc.search')"
      />
      <div class="toc-toolbar-actions">
        <button
          type="button"
          class="toc-toolbar-button"
          data-testid="toc-expand-all"
          :title="t('sideBar.toc.expandAll')"
          :aria-label="t('sideBar.toc.expandAll')"
          @click="expandAll"
        >
          +
        </button>
        <button
          type="button"
          class="toc-toolbar-button"
          data-testid="toc-collapse-all"
          :title="t('sideBar.toc.collapseAll')"
          :aria-label="t('sideBar.toc.collapseAll')"
          @click="collapseAll"
        >
          −
        </button>
      </div>
    </div>
    <el-tree
      v-if="filteredToc.length"
      ref="treeRef"
      :data="filteredToc"
      node-key="key"
      :default-expanded-keys="expandedKeys"
      :props="defaultProps"
      :expand-on-click-node="false"
      :indent="10"
      :icon="ArrowRight"
      @node-click="handleClick"
      @node-expand="onExpand"
      @node-collapse="onCollapse"
    >
      <template #default="{ data }">
        <span
          class="el-tree-node__label"
          :class="['toc-node-label', { 'is-active': data.slug === activeTocSlug }]"
          :aria-current="data.slug === activeTocSlug ? 'location' : undefined"
          data-testid="toc-node-label"
        >
          {{ data.label }}
        </span>
      </template>
    </el-tree>
    <div v-else class="toc-empty">
      {{ searchQuery ? t('sideBar.toc.noMatches') : t('sideBar.toc.empty') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import { deriveKeyedToc, type KeyedTocNode } from '@/util/tocKeys'
import { filterTocTree, getExpandableTocKeys } from '@/util/tocOutline'
import bus from '../../bus'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { ArrowRight } from '@element-plus/icons-vue'

const { t } = useI18n()

const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()

const defaultProps = {
  children: 'children',
  label: 'label'
}

const { toc, activeTocSlug } = storeToRefs(editorStore)
const { wordWrapInToc } = storeToRefs(preferencesStore)

const searchQuery = ref('')
type TocTreeNode = {
  expand: () => void
  collapse: () => void
}

type TocTree = {
  getNode?: (key: string) => TocTreeNode | null
}

const treeRef = ref<TocTree | null>(null)

// Stable per-node key so el-tree preserves the user's expand/collapse state
// across content edits (#3028) and tab switches (#3791). See deriveKeyedToc.
const keyedToc = computed<KeyedTocNode[]>(() => deriveKeyedToc(toc.value))
const filteredToc = computed<KeyedTocNode[]>(() => filterTocTree(keyedToc.value, searchQuery.value))

// Track which headings the user collapsed, by stable key (#3028). Headings are
// expanded by default; a collapse is remembered here.
const collapsedKeys = ref<Set<string>>(new Set())

const onCollapse = (data: { key?: string }): void => {
  if (data.key) collapsedKeys.value = new Set(collapsedKeys.value).add(data.key)
}

const onExpand = (data: { key?: string }): void => {
  if (!data.key) return
  const next = new Set(collapsedKeys.value)
  next.delete(data.key)
  collapsedKeys.value = next
}

// The set el-tree should have expanded: every node that is neither collapsed
// nor inside a collapsed ancestor. On each content edit el-tree rebuilds and
// re-applies these keys, so binding the *correct* set makes it paint the right
// state directly — instead of expanding everything and then collapsing, which
// flickered.
const expandedKeys = computed<string[]>(() => {
  if (searchQuery.value.trim()) return getExpandableTocKeys(filteredToc.value)

  const keys: string[] = []
  const walk = (nodes: KeyedTocNode[], hiddenByAncestor: boolean): void => {
    for (const node of nodes) {
      const collapsed = hiddenByAncestor || collapsedKeys.value.has(node.key)
      if (!collapsed) keys.push(node.key)
      walk(node.children, collapsed)
    }
  }
  walk(filteredToc.value, false)
  return keys
})

watch(
  expandedKeys,
  async (keys) => {
    await nextTick()
    const tree = treeRef.value
    if (!tree?.getNode) return

    const expanded = new Set(keys)
    for (const key of getExpandableTocKeys(filteredToc.value)) {
      const node = tree.getNode(key)
      if (!node) continue
      if (expanded.has(key)) node.expand()
      else node.collapse()
    }
  },
  { flush: 'post' }
)

const expandAll = (): void => {
  collapsedKeys.value = new Set()
}

const collapseAll = (): void => {
  collapsedKeys.value = new Set(getExpandableTocKeys(keyedToc.value))
}

const handleClick = (data: { slug?: unknown }): void => {
  // editor.vue builds a CSS selector with `#${slug}` — bail out if the
  // node has no slug (e.g. unsluggable headings) to avoid emitting
  // `undefined` / non-string payloads and producing `#undefined` selectors.
  if (typeof data.slug !== 'string' || data.slug.length === 0) return
  editorStore.UPDATE_ACTIVE_TOC(data.slug)
  bus.emit('scroll-to-header', data.slug)
}
</script>

<style>
.side-bar-toc {
  height: calc(100% - 35px);
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
}

.side-bar-toc .title {
  color: var(--sideBarTitleColor);
  font-weight: 600;
  font-size: 16px;
  margin: 37px 0 10px 0;
  padding-left: 25px;
}

.side-bar-toc .toc-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 10px 8px 10px;
}

.side-bar-toc .toc-toolbar .el-input {
  min-width: 0;
  flex: 1;
}

.side-bar-toc .toc-toolbar-actions {
  display: flex;
  flex-shrink: 0;
  gap: 2px;
}

.side-bar-toc .toc-toolbar-button {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  color: var(--sideBarTitleColor);
  background: transparent;
  cursor: pointer;
  font-size: 17px;
  line-height: 1;
}

.side-bar-toc .toc-toolbar-button:hover {
  background: var(--sideBarItemHoverBgColor);
}

.side-bar-toc .toc-empty {
  padding: 20px 25px;
  color: var(--sideBarTitleColor);
  opacity: 0.7;
  font-size: 13px;
}

.side-bar-toc .toc-node-label {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-radius: 3px;
}

.side-bar-toc .toc-node-label.is-active {
  color: var(--themeColor);
  font-weight: 600;
}

.side-bar-toc-wordwrap .toc-node-label {
  overflow: visible;
  overflow-wrap: anywhere;
  white-space: normal;
}

.side-bar-toc .el-tree-node {
  margin-top: 8px;
}

.side-bar-toc .el-tree {
  background: transparent;
  color: var(--sideBarColor);
}

.side-bar-toc .el-tree-node:focus > .el-tree-node__content {
  background-color: var(--sideBarItemHoverBgColor);
}

.side-bar-toc .el-tree-node__content:hover {
  background: var(--sideBarItemHoverBgColor);
}

.side-bar-toc > li {
  font-size: 14px;
  margin-bottom: 15px;
  cursor: pointer;
}
.side-bar-toc-overflow {
  overflow: auto;
}
.side-bar-toc-wordwrap {
  overflow-x: hidden;
  overflow-y: auto;
}

.side-bar-toc-wordwrap .el-tree-node__content {
  white-space: normal;
  height: auto;
  min-height: 26px;
}
</style>
