<template>
  <div
    v-if="visible && pendingUntitledRecoveries.length > 0"
    class="recovery-backdrop"
    data-testid="untitled-recovery-center"
    @click.self="dismiss"
  >
    <section
      class="recovery-center"
      role="dialog"
      aria-modal="true"
      :aria-label="t('recovery.untitled.title')"
    >
      <header class="recovery-header">
        <div>
          <h2>{{ t('recovery.untitled.title') }}</h2>
          <p>{{ t('recovery.untitled.description') }}</p>
        </div>
        <button
          class="ghost-button"
          type="button"
          @click="dismiss"
        >
          {{ t('recovery.untitled.later') }}
        </button>
      </header>

      <div class="recovery-body">
        <div class="recovery-list">
          <button
            v-for="(draft, index) in pendingUntitledRecoveries"
            :key="draft.id"
            type="button"
            class="recovery-item"
            :class="{ active: draft.id === selectedId }"
            @click="selectedId = draft.id"
          >
            <strong>{{ t('recovery.untitled.documentName', { index: index + 1 }) }}</strong>
            <span>{{ formatProtectedAt(draft.protectedAt) }}</span>
            <small>{{ formatStats(draft) }}</small>
          </button>
        </div>

        <div
          v-if="selectedDraft"
          class="recovery-preview"
        >
          <div class="preview-meta">
            <span>{{ t('recovery.untitled.protectedAt') }}</span>
            <strong>{{ formatProtectedAt(selectedDraft.protectedAt) }}</strong>
          </div>
          <pre>{{ preview(selectedDraft.markdown) }}</pre>
          <p class="save-as-hint">
            {{ t('recovery.untitled.saveAsHint') }}
          </p>
        </div>
      </div>

      <footer class="recovery-footer">
        <span>{{ t('recovery.untitled.count', { count: pendingUntitledRecoveries.length }) }}</span>
        <button
          class="primary-button"
          type="button"
          :disabled="!selectedDraft || restoring"
          @click="restoreSelected"
        >
          {{ t('recovery.untitled.restoreToNewTab') }}
        </button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useEditorStore, type UntitledRecoveryDraft } from '@/store/editor'
import { t } from '@/i18n'

const editorStore = useEditorStore()
const { pendingUntitledRecoveries } = storeToRefs(editorStore)

const visible = ref(true)
const restoring = ref(false)
const selectedId = ref<string | null>(pendingUntitledRecoveries.value[0]?.id ?? null)

const selectedDraft = computed(
  () => pendingUntitledRecoveries.value.find((draft) => draft.id === selectedId.value) ?? null
)

watch(
  pendingUntitledRecoveries,
  (drafts) => {
    if (drafts.length === 0) {
      selectedId.value = null
      return
    }
    if (!drafts.some((draft) => draft.id === selectedId.value)) {
      selectedId.value = drafts[0]!.id
    }
  },
  { deep: false }
)

const dismiss = (): void => {
  visible.value = false
}

const preview = (markdown: string): string => {
  const lines = markdown.split(/\r?\n/).slice(0, 8).join('\n').trim()
  return lines || t('recovery.untitled.emptyPreview')
}

const formatProtectedAt = (protectedAt: number): string => new Date(protectedAt).toLocaleString()

const formatStats = (draft: UntitledRecoveryDraft): string => {
  const words = draft.wordCount?.word ?? 0
  const bytes = new TextEncoder().encode(draft.markdown).byteLength
  return t('recovery.untitled.stats', { words, size: formatBytes(bytes) })
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

const restoreSelected = async (): Promise<void> => {
  if (!selectedDraft.value || restoring.value) return
  restoring.value = true
  try {
    await editorStore.RESTORE_UNTITLED_RECOVERY(selectedDraft.value.id)
    if (pendingUntitledRecoveries.value.length === 0) visible.value = false
  } finally {
    restoring.value = false
  }
}
</script>

<style scoped>
.recovery-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgb(0 0 0 / 28%);
}

.recovery-center {
  width: min(760px, calc(100vw - 48px));
  max-height: min(620px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--elevation-floating);
}

.recovery-header,
.recovery-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
}

.recovery-header {
  border-bottom: 1px solid var(--border-subtle);
}

.recovery-header h2 {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 600;
}

.recovery-header p,
.save-as-hint,
.recovery-footer span {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
}

.recovery-body {
  min-height: 260px;
  display: grid;
  grid-template-columns: minmax(190px, 240px) minmax(0, 1fr);
  overflow: hidden;
}

.recovery-list {
  overflow: auto;
  padding: 8px;
  border-right: 1px solid var(--border-subtle);
}

.recovery-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  margin: 0 0 4px;
  text-align: left;
  color: inherit;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
}

.recovery-item:hover {
  background: var(--surface-hover);
}

.recovery-item.active {
  background: var(--surface-selected);
  border-color: var(--border-default);
}

.recovery-item span,
.recovery-item small {
  color: var(--text-secondary);
  font-size: 11px;
}

.recovery-preview {
  min-width: 0;
  overflow: auto;
  padding: 18px;
}

.preview-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  color: var(--text-secondary);
  font-size: 11px;
}

.recovery-preview pre {
  min-height: 150px;
  margin: 0 0 12px;
  padding: 14px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--font-family-ui);
  font-size: 12px;
  line-height: 1.6;
  background: var(--editorBgColor);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.recovery-footer {
  border-top: 1px solid var(--border-subtle);
}

.ghost-button,
.primary-button {
  min-height: 30px;
  padding: 0 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.ghost-button {
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--border-subtle);
}

.primary-button {
  color: var(--button-primary-text, #fff);
  background: var(--color-accent);
  border: 1px solid var(--color-accent);
}

.primary-button:disabled {
  opacity: 0.55;
  cursor: default;
}

@media (max-width: 680px) {
  .recovery-body {
    grid-template-columns: 1fr;
  }

  .recovery-list {
    max-height: 180px;
    border-right: 0;
    border-bottom: 1px solid var(--border-subtle);
  }
}
</style>
