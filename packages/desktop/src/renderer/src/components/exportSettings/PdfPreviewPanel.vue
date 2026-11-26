<template>
  <section
    class="pdf-preview-panel"
    data-testid="pdf-preview-panel"
  >
    <div class="preview-surface">
      <canvas
        v-show="showCanvas"
        ref="canvasRef"
        class="preview-canvas"
      />
      <div
        v-if="!showCanvas"
        class="preview-placeholder"
      >
        {{ placeholderText }}
      </div>
    </div>

    <div
      v-if="state.pageCount > 0"
      class="preview-controls"
    >
      <button
        class="preview-nav"
        :disabled="state.currentPage <= 1"
        @click="goTo(state.currentPage - 1)"
      >
        {{ t('exportSettings.preview.previous') }}
      </button>
      <span class="preview-page-indicator">
        {{ t('exportSettings.preview.pageOf', { current: state.currentPage, total: state.pageCount }) }}
      </span>
      <button
        class="preview-nav"
        :disabled="state.currentPage >= state.pageCount"
        @click="goTo(state.currentPage + 1)"
      >
        {{ t('exportSettings.preview.next') }}
      </button>
    </div>

    <p
      class="preview-status"
      :class="'preview-status--' + state.status"
      :data-status="state.status"
      :data-events="state.events.join(',')"
      data-testid="pdf-preview-status"
    >
      {{ statusText }}
    </p>
    <p
      v-if="state.error"
      class="preview-error"
      data-testid="pdf-preview-error"
    >
      {{ state.error }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { pdfPreviewSession } from '@/services/pdfPreviewRuntime'

const { t } = useI18n()
const state = pdfPreviewSession.state
const canvasRef = ref<HTMLCanvasElement | null>(null)

const showCanvas = computed(
  () =>
    (state.status === 'ready' ||
      state.status === 'saving' ||
      state.status === 'saved' ||
      state.status === 'stale') &&
    state.pageCount > 0
)

const statusText = computed(() => {
  switch (state.status) {
    case 'generating':
      return t('exportSettings.preview.generating')
    case 'ready':
      return t('exportSettings.preview.ready')
    case 'stale':
      return t('exportSettings.preview.stale')
    case 'saving':
      return t('exportSettings.preview.saving')
    case 'saved':
      return t('exportSettings.preview.saved')
    case 'failed':
      return t('exportSettings.preview.failed')
    default:
      return t('exportSettings.preview.empty')
  }
})

const placeholderText = computed(() => {
  if (state.status === 'generating') return t('exportSettings.preview.generating')
  if (state.status === 'failed') return t('exportSettings.preview.failed')
  return t('exportSettings.preview.empty')
})

const goTo = (page: number): void => {
  pdfPreviewSession.setPage(page)
}

const renderCurrentPage = async (): Promise<void> => {
  const canvas = canvasRef.value
  const document = pdfPreviewSession.getDocument()
  if (!canvas || !document || !document.renderPage || !showCanvas.value) return
  try {
    await document.renderPage(state.currentPage, canvas, 360)
  } catch {
    // A render task is canceled when the page changes or the preview is
    // released; the new state renders on the next tick.
  }
}

watch(
  () => [state.status, state.currentPage, state.pageCount],
  async () => {
    await nextTick()
    await renderCurrentPage()
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  pdfPreviewSession.teardown()
})
</script>

<style scoped>
.pdf-preview-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.preview-surface {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  max-height: 360px;
  overflow: auto;
  background: var(--editorBgColor, #f5f5f5);
  border: 1px solid var(--borderColor, #ddd);
  border-radius: 4px;
  padding: 8px;
}

.preview-canvas {
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  background: #fff;
}

.preview-placeholder {
  color: var(--editorColor50, #888);
  font-size: 13px;
  text-align: center;
}

.preview-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.preview-page-indicator {
  min-width: 96px;
  text-align: center;
  font-size: 13px;
}

.preview-status {
  margin: 0;
  font-size: 12px;
  color: var(--editorColor50, #666);
}

.preview-status--stale,
.preview-status--failed,
.preview-error {
  color: var(--notificationErrorColor, #c0392b);
}

.preview-error {
  margin: 0;
  font-size: 12px;
  word-break: break-word;
}
</style>
