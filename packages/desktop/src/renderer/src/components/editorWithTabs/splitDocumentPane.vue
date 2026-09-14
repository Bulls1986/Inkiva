<template>
  <section
    class="split-document-pane"
    data-testid="split-document-pane"
    :dir="textDirection"
    aria-label="Secondary document pane"
  >
    <header class="split-document-header">
      <span class="split-document-title" :title="file.pathname || file.filename">{{
        file.filename
      }}</span>
      <button
        type="button"
        class="split-document-activate"
        data-testid="split-document-activate"
        @click="$emit('activate')"
      >
        Use as editor
      </button>
    </header>
    <div v-if="html" class="split-document-content markdown-body" v-html="html" />
    <p v-else class="split-document-loading">Loading…</p>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { MarkdownToHtml } from '@muyajs/core'
import type { IFileState } from '@shared/types/files'

const props = defineProps<{
  file: IFileState
  textDirection: string
}>()

defineEmits<{
  activate: []
}>()

const html = ref('')
let renderGeneration = 0

const rewriteLocalImages = (value: string, pathname: string): string => {
  if (!pathname) return value
  const dirname = window.path.dirname(pathname)
  return value.replace(
    /(<img\b[^>]*?\ssrc=")(?!https?:|file:|data:)([^"]+)(")/gi,
    (_match, prefix: string, src: string, suffix: string) => {
      return `${prefix}file://${window.path.resolve(dirname, src)}${suffix}`
    }
  )
}

const render = async (): Promise<void> => {
  const generation = ++renderGeneration
  const rendered = await new MarkdownToHtml(props.file.markdown).renderHtml()
  if (generation !== renderGeneration) return
  html.value = rewriteLocalImages(rendered, props.file.pathname)
}

watch(
  () => [props.file.id, props.file.markdown, props.file.pathname],
  () => {
    render().catch((error: unknown) => {
      console.error('Failed to render split document preview', error)
      html.value = ''
    })
  },
  { immediate: true }
)
</script>

<style scoped>
.split-document-pane {
  display: flex;
  flex: 1 1 50%;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--surface-editor);
  border-left: 1px solid var(--border-default);
}

.split-document-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 0 0 var(--documentTabsHeight);
  min-width: 0;
  padding: 0 var(--space-3);
  color: var(--text-secondary);
  background: var(--surface-chrome);
  border-bottom: 1px solid var(--border-subtle);
  font-size: var(--font-size-shortcut);
}

.split-document-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.split-document-activate {
  flex: 0 0 auto;
  min-height: var(--hit-target-sm);
  margin-left: var(--space-2);
  padding: 2px var(--space-2);
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font: inherit;
}

.split-document-activate:hover,
.split-document-activate:focus-visible {
  color: var(--text-primary);
  background: var(--surface-hover);
}

.split-document-activate:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.split-document-content {
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: var(--space-6) clamp(var(--space-4), 5vw, var(--space-10));
}

.split-document-loading {
  margin: var(--space-6);
  color: var(--text-tertiary);
}
</style>
