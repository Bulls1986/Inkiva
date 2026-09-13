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
        aria-keyshortcuts="Control+P"
        @click="quickOpen"
      >
        <span>{{ t('recent.quickOpen', { shortcut: quickOpenShortcut }) }}</span>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useEditorStore } from '@/store/editor'
import { isOsx } from '@/util'
import { DocumentAdd, FolderOpened } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import bus from '../../bus'

const editorStore = useEditorStore()
const { t } = useI18n()

const openFileShortcut = isOsx ? '⌘O' : 'Ctrl+O'
const openFileKey = isOsx ? 'Meta+O' : 'Control+O'
const quickOpenShortcut = 'Ctrl+P'

const newFile = () => {
  editorStore.NEW_UNTITLED_TAB({})
}

const openFile = (): void => {
  window.electron.ipcRenderer.send('mt::cmd-open-file')
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
