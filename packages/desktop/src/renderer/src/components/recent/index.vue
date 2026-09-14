<template>
  <section
    class="recent-files-projects"
    data-testid="welcome-surface"
    aria-labelledby="welcome-title"
  >
    <div class="welcome-surface">
      <div
        class="welcome-brand"
        aria-label="Inkiva"
      >
        <span
          class="welcome-mark"
          aria-hidden="true"
        >i</span>
        <span class="welcome-wordmark">Inkiva</span>
      </div>

      <div class="welcome-copy">
        <h1 id="welcome-title">
          {{ t('recent.welcomeTitle') }}
        </h1>
        <p>{{ t('recent.welcomeDescription') }}</p>
      </div>

      <section
        class="recent-documents-panel"
        data-testid="recent-documents-list"
        :aria-label="t('recent.documents')"
      >
        <div class="recent-documents-header">
          <h2>{{ t('recent.documents') }}</h2>
          <button
            type="button"
            class="recent-clear"
            data-testid="recent-clear"
            :disabled="recentItems.length === 0"
            @click="clearRecent"
          >
            {{ t('recent.clear') }}
          </button>
        </div>

        <p
          v-if="recentItems.length === 0"
          class="recent-empty"
          data-testid="recent-empty"
        >
          {{ t('recent.empty') }}
        </p>
        <ul
          v-else
          class="recent-document-items"
          data-testid="recent-document-items"
        >
          <li
            v-for="item of recentItems"
            :key="item.pathname"
            class="recent-document-item"
            data-testid="recent-document-item"
            :data-path="item.pathname"
            :data-kind="item.kind"
            :data-pinned="item.pinned"
          >
            <button
              type="button"
              class="recent-document-open"
              data-testid="recent-open"
              :aria-label="t('recent.open') + ' ' + displayName(item.pathname)"
              @click="openRecent(item)"
            >
              <el-icon :size="16" aria-hidden="true">
                <FolderOpened v-if="item.kind === 'folder'" />
                <Document v-else />
              </el-icon>
              <span class="recent-document-copy">
                <strong>{{ displayName(item.pathname) }}</strong>
                <small>{{ item.pathname }}</small>
              </span>
            </button>
            <div class="recent-document-actions">
              <button
                type="button"
                class="recent-document-action"
                data-testid="recent-pin"
                :aria-label="t(item.pinned ? 'recent.unpin' : 'recent.pin')"
                @click.stop="recentStore.TOGGLE_PIN(item.pathname)"
              >
                <el-icon :size="14" aria-hidden="true">
                  <Paperclip />
                </el-icon>
              </button>
              <button
                type="button"
                class="recent-document-action"
                data-testid="recent-remove"
                :aria-label="t('recent.remove')"
                @click.stop="recentStore.REMOVE(item.pathname)"
              >
                <el-icon :size="14" aria-hidden="true">
                  <Close />
                </el-icon>
              </button>
            </div>
          </li>
        </ul>
      </section>

      <div
        class="welcome-actions"
        :aria-label="t('recent.actions')"
      >
        <el-button
          class="welcome-action welcome-action-primary"
          type="primary"
          data-testid="welcome-new-file"
          @click="newFile"
        >
          <el-icon
            :size="16"
            aria-hidden="true"
          >
            <DocumentAdd />
          </el-icon>
          <span>{{ t('recent.newFile') }}</span>
        </el-button>
        <el-button
          class="welcome-action welcome-action-secondary"
          data-testid="welcome-open-file"
          :aria-keyshortcuts="openFileKey"
          @click="openFile"
        >
          <el-icon
            :size="16"
            aria-hidden="true"
          >
            <FolderOpened />
          </el-icon>
          <span>{{ t('recent.openFile') }}</span>
          <kbd>{{ openFileShortcut }}</kbd>
        </el-button>
      </div>

      <button
        class="welcome-quick-open"
        data-testid="welcome-quick-open"
        type="button"
        :aria-keyshortcuts="quickOpenKey"
        @click="quickOpen"
      >
        <span>{{ t('recent.quickOpen', { shortcut: quickOpenShortcut }) }}</span>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useEditorStore } from '@/store/editor'
import { useRecentDocumentsStore, type RecentDocument } from '@/store/recentDocuments'
import { storeToRefs } from 'pinia'
import { isOsx } from '@/util'
import { Close, Document, DocumentAdd, FolderOpened, Paperclip } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import bus from '../../bus'

const editorStore = useEditorStore()
const recentStore = useRecentDocumentsStore()
const { t } = useI18n()
const { items: recentItems } = storeToRefs(recentStore)

const openFileShortcut = isOsx ? '⌘O' : 'Ctrl+O'
const openFileKey = isOsx ? 'Meta+O' : 'Control+O'
const quickOpenShortcut = isOsx ? '⌘P' : 'Ctrl+P'
const quickOpenKey = isOsx ? 'Meta+P' : 'Control+P'

const newFile = () => {
  editorStore.NEW_UNTITLED_TAB({})
}

const openFile = (): void => {
  window.electron.ipcRenderer.send('mt::cmd-open-file')
}

const displayName = (pathname: string): string => {
  return window.path.basename(pathname) || pathname
}

const openRecent = (item: RecentDocument): void => {
  const windowId = window.inkiva?.env?.windowId
  if (typeof windowId !== 'number') return
  if (item.kind === 'folder') {
    window.electron.ipcRenderer.send('app-open-directory-by-id', windowId, item.pathname)
  } else {
    window.electron.ipcRenderer.send('app-open-file-by-id', windowId, item.pathname)
  }
}

const clearRecent = (): void => {
  recentStore.CLEAR()
}

const quickOpen = (): void => {
  bus.emit('cmd::execute', 'file.quick-open')
}
</script>

<style scoped>
.recent-files-projects {
  box-sizing: border-box;
  background: var(--surface-editor);
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: var(--space-8) var(--space-6);
  color: var(--text-primary);
}

.welcome-surface {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: min(100%, 460px);
  text-align: center;
}

.welcome-brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-secondary);
  font-size: var(--font-size-ui);
  font-weight: 500;
  letter-spacing: 0.01em;
}

.welcome-mark {
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  box-sizing: border-box;
  color: var(--text-secondary);
  background: var(--surface-chrome);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  font-size: var(--font-size-title);
  font-weight: var(--font-weight-emphasis);
  line-height: 1;
}

.welcome-copy {
  margin-top: var(--space-6);
}

.welcome-copy h1 {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--font-size-section);
  font-weight: var(--font-weight-medium);
  line-height: 1.4;
}

.welcome-copy p {
  margin: var(--space-2) 0 0;
  color: var(--text-tertiary);
  font-size: var(--font-ui-md);
  line-height: 1.5;
}

.recent-documents-panel {
  width: min(100%, 460px);
  box-sizing: border-box;
  margin-top: var(--space-6);
  padding: var(--space-3);
  text-align: left;
  background: var(--surface-chrome);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.recent-documents-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.recent-documents-header h2 {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--font-ui-md);
  font-weight: var(--font-weight-medium);
}

.recent-clear,
.recent-document-action {
  appearance: none;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
  background: transparent;
  cursor: pointer;
  font: inherit;
}

.recent-clear {
  padding: 4px 6px;
  font-size: var(--font-size-shortcut);
}

.recent-clear:hover:not(:disabled),
.recent-clear:focus-visible,
.recent-document-action:hover,
.recent-document-action:focus-visible {
  color: var(--text-primary);
  background: var(--surface-hover);
}

.recent-clear:disabled {
  cursor: default;
  opacity: 0.5;
}

.recent-empty {
  margin: var(--space-3) 0 var(--space-1);
  color: var(--text-tertiary);
  font-size: var(--font-size-shortcut);
}

.recent-document-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 240px;
  margin: var(--space-2) 0 0;
  padding: 0;
  overflow: auto;
  list-style: none;
}

.recent-document-item {
  display: flex;
  align-items: center;
  min-width: 0;
  border-radius: var(--radius-sm);
}

.recent-document-item[data-pinned='true'] {
  background: var(--surface-selected);
}

.recent-document-open {
  appearance: none;
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
  gap: var(--space-2);
  padding: 7px 6px;
  border: 0;
  color: var(--text-primary);
  background: transparent;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.recent-document-open:hover,
.recent-document-open:focus-visible {
  outline: none;
  background: var(--surface-hover);
}

.recent-document-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}

.recent-document-copy strong,
.recent-document-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-document-copy strong {
  color: var(--text-secondary);
  font-size: var(--font-size-secondary);
  font-weight: var(--font-weight-medium);
}

.recent-document-copy small {
  color: var(--text-tertiary);
  font-size: var(--font-size-shortcut);
}

.recent-document-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 2px;
  padding-right: 4px;
}

.recent-document-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--hit-target-sm);
  height: var(--hit-target-sm);
}

.welcome-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-2);
  margin-top: var(--space-6);
}

.welcome-action {
  min-height: var(--hit-target-lg);
  border-radius: var(--radius-md);
  transition: color var(--motion-fast), background-color var(--motion-fast), box-shadow var(--motion-fast);
}

.welcome-action :deep(.el-icon) {
  margin-right: var(--space-1);
}

.welcome-action kbd {
  margin-left: var(--space-1);
  padding: 1px 5px;
  color: var(--text-tertiary);
  background: var(--surface-chrome);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: var(--font-size-shortcut);
  line-height: 16px;
}

.welcome-action-primary {
  background-color: var(--buttonPrimaryBgColor);
  color: var(--buttonPrimaryFontColor);
  border-color: transparent;
}

.welcome-action-primary:hover,
.welcome-action-primary:focus-visible {
  background-color: var(--buttonPrimaryBgColorHover);
  color: var(--buttonPrimaryFontColorHover);
  border-color: transparent;
}

.welcome-action-primary:active {
  background-color: var(--buttonPrimaryBgColorActive);
  color: var(--buttonPrimaryFontColorActive);
  border-color: transparent;
}

.welcome-action-primary:focus-visible,
.welcome-action-secondary:focus-visible,
.welcome-quick-open:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.welcome-action-secondary {
  color: var(--text-secondary);
  background: var(--surface-editor);
  border: 1px solid var(--border-default);
}

.welcome-action-secondary:hover {
  color: var(--text-primary);
  background: var(--surface-hover);
  border-color: var(--border-default);
}

.welcome-quick-open {
  display: inline-flex;
  align-items: center;
  min-height: var(--hit-target-md);
  margin-top: var(--space-3);
  padding: 4px 8px;
  color: var(--text-tertiary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font: inherit;
  font-size: var(--font-size-shortcut);
  transition: color var(--motion-fast), background-color var(--motion-fast), box-shadow var(--motion-fast);
}

.welcome-quick-open:hover {
  color: var(--text-secondary);
  background: var(--surface-hover);
}

@media (max-width: 520px) {
  .recent-files-projects {
    padding-inline: var(--space-4);
  }

  .welcome-actions {
    flex-direction: column;
    width: min(100%, 240px);
  }

  .welcome-action {
    width: 100%;
  }
}
</style>
