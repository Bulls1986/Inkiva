<template>
  <div class="pref-effect-status" :class="{ error: Boolean(error) }">
    <span>{{ timingLabel }}</span>
    <template v-if="pending && timing === 'app-restart'">
      <span class="separator">·</span>
      <button type="button" class="apply-action" @click="quitInkiva">
        {{ restartActionLabel }}
      </button>
    </template>
    <template v-if="error">
      <span class="separator">·</span>
      <button type="button" class="retry" @click="onRetry">
        {{ failureLabel }}
      </button>
      <span class="reason" :title="error">{{ error }}</span>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PreferenceEffectTiming } from './types'

interface Props {
  timing?: PreferenceEffectTiming
  error?: string
  onRetry?: () => void
  pending?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  timing: 'immediate',
  error: '',
  onRetry: () => {},
  pending: false
})
const { locale } = useI18n()
const isChinese = computed(() => String(locale.value).toLowerCase().startsWith('zh'))
const timingLabel = computed(() => {
  if (props.timing === 'app-restart') return isChinese.value ? '重启 Inkiva 后生效' : 'Applies after restart'
  if (props.timing === 'window-reopen') return isChinese.value ? '重新打开窗口后生效' : 'Applies after reopening window'
  return isChinese.value ? '立即生效' : 'Applies immediately'
})
const failureLabel = computed(() => isChinese.value ? '未保存设置 · 重试' : 'Not saved · Retry')
const restartActionLabel = computed(() => isChinese.value ? '退出 Inkiva' : 'Quit Inkiva')
const quitInkiva = (): void => window.electron.commands.tryQuit()
</script>

<style scoped>
.pref-effect-status {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 18px;
  margin-top: 4px;
  color: var(--text-tertiary);
  font-size: var(--font-size-shortcut);
  line-height: 1.4;
}
.pref-effect-status.error {
  color: var(--color-danger, #d9534f);
}
.retry,
.apply-action {
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
}
.reason {
  overflow: hidden;
  max-width: 260px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
