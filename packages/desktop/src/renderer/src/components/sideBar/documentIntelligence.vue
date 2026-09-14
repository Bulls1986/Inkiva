<template>
  <section
    class="document-intelligence"
    :aria-label="t('sideBar.documentIntelligence.title')"
  >
    <header class="document-intelligence__header">
      <h2>{{ t('sideBar.documentIntelligence.title') }}</h2>
      <button
        v-if="currentPath"
        type="button"
        class="icon-button"
        :aria-label="t('sideBar.documentIntelligence.refresh')"
        :disabled="loading"
        @click="documentIntelligenceStore.REFRESH()"
      >
        <RefreshRight />
      </button>
    </header>

    <div
      v-if="!currentPath"
      class="document-intelligence__state"
    >
      {{ t('sideBar.documentIntelligence.noDocument') }}
    </div>

    <div
      v-else-if="loading"
      class="document-intelligence__state"
      role="status"
      aria-live="polite"
    >
      {{ t('sideBar.documentIntelligence.loading') }}
    </div>

    <template v-else>
      <div
        v-if="error"
        class="document-intelligence__error"
        role="alert"
      >
        {{ errorMessage }}
      </div>

      <section class="document-intelligence__section">
        <h3>{{ t('sideBar.documentIntelligence.backlinks') }}</h3>
        <ul v-if="backlinks.length">
          <li
            v-for="backlink in backlinks"
            :key="`${backlink.sourcePath}:${backlink.start}`"
          >
            <button
              type="button"
              class="document-intelligence__item"
              @click="openBacklink(backlink)"
            >
              <span class="document-intelligence__item-title">
                {{ basename(backlink.sourcePath) }}
              </span>
              <span class="document-intelligence__item-detail">
                {{ t('sideBar.documentIntelligence.line', { line: backlink.line }) }}
                · {{ backlink.label || backlink.destination }}
              </span>
            </button>
          </li>
        </ul>
        <p
          v-else
          class="document-intelligence__empty"
        >
          {{ t('sideBar.documentIntelligence.noBacklinks') }}
        </p>
      </section>

      <section class="document-intelligence__section">
        <h3>{{ t('sideBar.documentIntelligence.localHistory') }}</h3>
        <p
          v-if="requiresSaveBeforeRestore && history.length"
          class="document-intelligence__hint"
        >
          {{ t('sideBar.documentIntelligence.saveBeforeRestore') }}
        </p>
        <ul v-if="history.length">
          <li
            v-for="entry in history"
            :key="entry.id"
            class="document-intelligence__history-item"
          >
            <div class="document-intelligence__history-copy">
              <span class="document-intelligence__item-title">{{
                formatDate(entry.createdAt)
              }}</span>
              <span class="document-intelligence__item-detail">
                {{ historyReason(entry.reason) }} · {{ formatSize(entry.size) }}
              </span>
            </div>
            <button
              type="button"
              class="restore-button"
              :disabled="!canRestore"
              :aria-label="
                t('sideBar.documentIntelligence.restoreEntry', {
                  date: formatDate(entry.createdAt)
                })
              "
              :title="
                requiresSaveBeforeRestore
                  ? t('sideBar.documentIntelligence.saveBeforeRestore')
                  : t('sideBar.documentIntelligence.restore')
              "
              @click="documentIntelligenceStore.RESTORE_SNAPSHOT(entry.id)"
            >
              {{
                restoringSnapshotId === entry.id
                  ? t('sideBar.documentIntelligence.restoring')
                  : t('sideBar.documentIntelligence.restore')
              }}
            </button>
          </li>
        </ul>
        <p
          v-else
          class="document-intelligence__empty"
        >
          {{ t('sideBar.documentIntelligence.noHistory') }}
        </p>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { RefreshRight } from '@element-plus/icons-vue'
import type { LocalHistoryReason, MarkdownBacklink } from '@shared/types/documentIntelligence'
import bus from '@/bus'
import { useEditorStore } from '@/store/editor'
import { useDocumentIntelligenceStore } from '@/store/documentIntelligence'

const { t, locale } = useI18n()
const editorStore = useEditorStore()
const documentIntelligenceStore = useDocumentIntelligenceStore()
const {
  backlinks,
  history,
  loading,
  restoringSnapshotId,
  error,
  currentPath,
  canRestore,
  requiresSaveBeforeRestore
} = storeToRefs(documentIntelligenceStore)

const errorMessage = computed(() => {
  if (!error.value) return ''
  return t(`sideBar.documentIntelligence.errors.${error.value}`)
})

const formatDate = (createdAt: number): string =>
  new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(createdAt)

const formatSize = (size: number): string => {
  if (size < 1_024) return t('sideBar.documentIntelligence.bytes', { count: size })
  return t('sideBar.documentIntelligence.kilobytes', { count: Math.ceil(size / 1_024) })
}

const historyReason = (reason: LocalHistoryReason): string =>
  t(`sideBar.documentIntelligence.historyReasons.${reason}`)

const basename = (pathname: string): string => window.path.basename(pathname)

const openBacklink = (backlink: MarkdownBacklink): void => {
  const line = Math.max(0, backlink.line - 1)
  const cursor = {
    isCollapsed: true,
    anchor: { line, ch: 0 },
    focus: { line, ch: 0 }
  }
  const openedTab = editorStore.tabs.find((tab) =>
    window.fileUtils.isSamePathSync(tab.pathname, backlink.sourcePath)
  )

  if (!openedTab) {
    window.electron.ipcRenderer.send('mt::open-file', backlink.sourcePath, { cursor })
    return
  }

  openedTab.cursor = cursor
  if (editorStore.currentFile?.id !== openedTab.id) {
    editorStore.UPDATE_CURRENT_FILE(openedTab)
  } else {
    bus.emit('file-changed', {
      id: openedTab.id,
      markdown: openedTab.markdown,
      cursor,
      renderCursor: true,
      history: openedTab.history
    })
  }
}
</script>

<style scoped>
.document-intelligence {
  height: 100%;
  overflow-y: auto;
  padding: var(--space-4) var(--space-3);
  box-sizing: border-box;
  color: var(--text-secondary);
  font-size: var(--font-ui-md);
}

.document-intelligence__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
  margin-bottom: var(--space-3);
}

.document-intelligence h2,
.document-intelligence h3,
.document-intelligence p {
  margin: 0;
}

.document-intelligence h2 {
  color: var(--text-primary);
  font-size: var(--font-ui-lg);
}

.document-intelligence h3 {
  margin-bottom: var(--space-2);
  color: var(--text-primary);
  font-size: var(--font-ui-md);
}

.document-intelligence ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.document-intelligence__section + .document-intelligence__section {
  margin-top: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--border-subtle);
}

.document-intelligence__state,
.document-intelligence__empty,
.document-intelligence__hint,
.document-intelligence__error {
  padding: var(--space-3);
  border-radius: var(--radius-md);
  color: var(--text-tertiary);
  background: var(--surface-hover);
}

.document-intelligence__hint {
  margin-bottom: var(--space-2) !important;
  font-size: var(--font-ui-sm);
}

.document-intelligence__error {
  margin-bottom: var(--space-3);
  color: var(--color-danger);
  background: var(--color-danger-soft);
}

.document-intelligence__item {
  appearance: none;
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: var(--space-2);
  color: inherit;
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.document-intelligence__item:hover {
  background: var(--surface-hover);
}

.document-intelligence__item-title {
  overflow: hidden;
  color: var(--text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-intelligence__item-detail {
  overflow: hidden;
  margin-top: 2px;
  color: var(--text-tertiary);
  font-size: var(--font-ui-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-intelligence__history-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  border-radius: var(--radius-sm);
}

.document-intelligence__history-item:hover {
  background: var(--surface-hover);
}

.document-intelligence__history-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.icon-button,
.restore-button {
  appearance: none;
  flex: 0 0 auto;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 5px;
}

.restore-button {
  min-height: 28px;
  padding: 0 var(--space-2);
  font-size: var(--font-ui-sm);
}

.icon-button:hover:not(:disabled),
.restore-button:hover:not(:disabled) {
  color: var(--color-accent);
  border-color: var(--color-accent);
}

.icon-button:focus-visible,
.restore-button:focus-visible,
.document-intelligence__item:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.icon-button:disabled,
.restore-button:disabled {
  color: var(--text-disabled);
  cursor: not-allowed;
}
</style>
