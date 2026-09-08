<template>
  <div class="editor-with-tabs">
    <tabs v-show="showTabBar" />
    <div class="container">
      <editor
        :markdown="markdown"
        :cursor="cursor"
        :text-direction="textDirection"
        :platform="platform"
      />
      <source-code
        v-if="sourceCode"
        :markdown="markdown"
        :muya-index-cursor="muyaIndexCursor"
        :text-direction="textDirection"
      />
    </div>
    <tab-notifications />
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import Tabs from './tabs.vue'
import Editor from './editor.vue'
import TabNotifications from './notifications.vue'

// Source mode is optional and disabled by default. Keep CodeMirror and its
// language/runtime dependencies out of the WYSIWYG first-paint path.
const SourceCode = defineAsyncComponent(() => import('./sourceCode.vue'))

defineProps<{
  markdown: string
  cursor: unknown
  muyaIndexCursor?: unknown
  sourceCode: boolean
  showTabBar: boolean
  textDirection: string
  platform: string
}>()
</script>

<style scoped>
.editor-with-tabs {
  position: relative;
  height: 100%;
  flex: 1;
  min-width: 0;
  /* The in-flow sidebar is already accounted for by the flex parent. When
     the sidebar becomes an overlay it leaves that flow, so an explicit
     `100vw - sidebarWidth` cap would incorrectly shrink the editor. */
  display: flex;
  flex-direction: column;

  overflow: hidden;
  background: var(--editorBgColor);
  & > .container {
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }
}
</style>
