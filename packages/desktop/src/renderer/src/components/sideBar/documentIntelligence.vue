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
            <button
              type="button"
              class="document-intelligence__history-copy document-intelligence__item"
              :aria-label="t('sideBar.documentIntelligence.preview')"
              @click="openHistoryPreview(entry)"
            >
              <span class="document-intelligence__item-title">{{
                formatDate(entry.createdAt)
              }}</span>
              <span class="document-intelligence__item-detail">
                {{ historyReason(entry.reason) }} · {{ formatSize(entry.size) }}
              </span>
            </button>
            <button
              type="button"
              class="restore-button"
              :disabled="previewLoading"
              :aria-label="t('sideBar.documentIntelligence.preview')"
              @click="openHistoryPreview(entry)"
            >
              {{ t('sideBar.documentIntelligence.preview') }}
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

  <div
    v-if="selectedSnapshot && selectedEntry"
    class="history-preview-overlay"
    role="presentation"
    @click.self="closeHistoryPreview"
  >
    <section
      class="history-preview"
      role="dialog"
      aria-modal="true"
      :aria-label="t('sideBar.documentIntelligence.previewTitle')"
    >
      <header class="history-preview__header">
        <div>
          <span class="history-preview__eyebrow">
            {{ t('sideBar.documentIntelligence.readonlyPreview') }}
          </span>
          <h2>{{ formatDate(selectedEntry.createdAt) }}</h2>
          <p>
            {{ historyReason(selectedEntry.reason) }} ·
            {{ t('sideBar.documentIntelligence.previewUnchanged') }}
          </p>
        </div>
        <button
          type="button"
          class="icon-button"
          :aria-label="t('sideBar.documentIntelligence.closePreview')"
          @click="closeHistoryPreview"
        >
          ×
        </button>
      </header>

      <div class="history-preview__content">
        <pre>{{ selectedSnapshot.content }}</pre>
      </div>

      <div
        v-if="confirmRestore"
        class="history-preview__confirm"
        role="alert"
      >
        <strong>{{ t('sideBar.documentIntelligence.confirmRestoreTitle') }}</strong>
        <p>{{ t('sideBar.documentIntelligence.confirmRestoreBody') }}</p>
      </div>

      <footer class="history-preview__footer">
        <button
          type="button"
          class="history-preview__button"
          @click="openSnapshotCopy"
        >
          {{ t('sideBar.documentIntelligence.openCopy') }}
        </button>
        <span />
        <button
          v-if="confirmRestore"
          type="button"
          class="history-preview__button"
          @click="confirmRestore = false"
        >
          {{ t('sideBar.documentIntelligence.cancel') }}
        </button>
        <button
          type="button"
          class="history-preview__button history-preview__button--primary"
          :disabled="!canRestore || restoringSnapshotId === selectedEntry.id"
          :title="
            requiresSaveBeforeRestore
              ? t('sideBar.documentIntelligence.saveBeforeRestore')
              : t('sideBar.documentIntelligence.restore')
          "
          @click="confirmRestore ? restoreSelectedSnapshot() : (confirmRestore = true)"
        >
          {{
            restoringSnapshotId === selectedEntry.id
              ? t('sideBar.documentIntelligence.restoring')
              : confirmRestore
                ? t('sideBar.documentIntelligence.restore')
                : t('sideBar.documentIntelligence.restoreCurrent')
          }}
        </button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { RefreshRight } from '@element-plus/icons-vue'
import type {
  LocalHistoryEntry,
  LocalHistoryReason,
  LocalHistorySnapshot,
  MarkdownBacklink
} from '@shared/types/documentIntelligence'
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
const previewLoading = ref(false)
const selectedEntry = ref<LocalHistoryEntry | null>(null)
const selectedSnapshot = ref<LocalHistorySnapshot | null>(null)
const confirmRestore = ref(false)

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

const closeHistoryPreview = (): void => {
  selectedEntry.value = null
  selectedSnapshot.value = null
  confirmRestore.value = false
}

const openHistoryPreview = async (entry: LocalHistoryEntry): Promise<void> => {
  previewLoading.value = true
  confirmRestore.value = false
  try {
    const snapshot = await documentIntelligenceStore.GET_SNAPSHOT(entry.id)
    if (!snapshot) return
    selectedEntry.value = entry
    selectedSnapshot.value = snapshot
  } finally {
    previewLoading.value = false
  }
}

const openSnapshotCopy = async (): Promise<void> => {
  if (!selectedEntry.value) return
  const opened = await documentIntelligenceStore.OPEN_SNAPSHOT_COPY(selectedEntry.value.id)
  if (opened) closeHistoryPreview()
}

const restoreSelectedSnapshot = async (): Promise<void> => {
  if (!selectedEntry.value) return
  const restored = await documentIntelligenceStore.RESTORE_SNAPSHOT(selectedEntry.value.id)
  if (restored) closeHistoryPreview()
}

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

.history-preview-overlay {
  position: fixed;
  z-index: var(--z-modal);
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
  background: rgba(0, 0, 0, 0.32);
}

.history-preview {
  display: flex;
  flex-direction: column;
  width: min(760px, calc(100vw - 48px));
  max-height: min(720px, calc(100vh - 48px));
  overflow: hidden;
  color: var(--text-secondary);
  background: var(--surface-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--elevation-floating);
}

.history-preview__header {
  display: flex;
  gap: var(--space-4);
  align-items: flex-start;
  justify-content: space-between;
  padding: var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
}

.history-preview__header h2 {
  margin: 4px 0;
  color: var(--text-primary);
  font-size: var(--font-size-title);
}

.history-preview__header p,
.history-preview__confirm p {
  margin: 0;
  color: var(--text-tertiary);
  font-size: var(--font-ui-sm);
}

.history-preview__eyebrow {
  color: var(--text-tertiary);
  font-size: var(--font-size-metadata);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.history-preview__content {
  flex: 1;
  min-height: 220px;
  overflow: auto;
  padding: var(--space-4);
  background: var(--surface-chrome);
}

.history-preview__content pre {
  margin: 0;
  color: var(--text-primary);
  font-family: 'DejaVu Sans Mono', 'Source Code Pro', 'Droid Sans Mono', Consolas, monospace;
  font-size: var(--font-ui-md);
  line-height: 1.65;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.history-preview__confirm {
  margin: 0 var(--space-4);
  padding: var(--space-3);
  color: var(--text-primary);
  background: var(--surface-hover);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.history-preview__footer {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-4);
  border-top: 1px solid var(--border-subtle);
}

.history-preview__footer > span {
  flex: 1;
}

.history-preview__button {
  min-height: 32px;
  padding: 0 var(--space-3);
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.history-preview__button--primary {
  color: #fff;
  background: var(--color-accent);
  border-color: var(--color-accent);
}

.history-preview__button:disabled {
  color: var(--text-disabled);
  background: var(--surface-hover);
  border-color: var(--border-subtle);
  cursor: not-allowed;
}
</style>
