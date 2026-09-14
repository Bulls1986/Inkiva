<template>
  <div
    v-if="currentNotification"
    class="editor-notifications"
    :class="currentNotification.style"
  >
    <div class="msg">
      {{ currentNotification.msg }}
    </div>
    <div class="controls">
      <div>
        <span
          v-if="currentNotification.showConfirm"
          class="inline-button"
          @click.stop="handleClick(true)"
        >
          {{ t('common.ok') }}
        </span>
        <span
          class="inline-button"
          @click.stop="handleClick(false)"
        >
          <el-icon
            class="close-icon"
            :size="12"
          >
            <Close />
          </el-icon>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '@/store/editor'
import { storeToRefs } from 'pinia'
import { Close } from '@element-plus/icons-vue'
import { t } from '../../i18n'

const editorStore = useEditorStore()

const { currentFile } = storeToRefs(editorStore)

const currentNotification = computed(() => {
  const notifications = currentFile.value?.notifications
  if (!notifications || notifications.length === 0) {
    return null
  }
  return notifications[0]
})

const handleClick = (status: boolean) => {
  const notifications = currentFile.value?.notifications
  if (!notifications || notifications.length === 0) {
    console.error(t('editor.notifications.notificationNotFound'))
    return
  }

  const item = notifications.shift()
  const action = item?.action
  if (action) {
    action(status)
  }
}
</script>

<style scoped>
.editor-notifications {
  position: relative;
  display: flex;
  flex-direction: row;
  max-height: 100px;
  margin: 8px 10px 0;
  background: var(--surface-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
  border-left: 2px solid var(--color-accent);
  border-radius: var(--radius-md);
  padding: 8px 10px;
  user-select: none;
  overflow: hidden;
  transition: background-color var(--motion-normal), border-color var(--motion-normal), color var(--motion-normal);
  &.warn {
    border-left-color: var(--color-warning);
  }
  &.crit {
    border-left-color: var(--color-danger);
  }
}
.msg {
  font-size: 13px;
  flex: 1;
}
.controls {
  display: flex;
  flex-direction: column;
  justify-content: center;
  & > div {
    display: flex;
    flex-direction: row;
  }
  & .inline-button:not(:last-child) {
    margin-right: 3px;
  }
  & .inline-button {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 24px;
    height: 24px;
    font-size: 12px;
    cursor: pointer;
    color: var(--icon-secondary);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    transition: background-color var(--motion-fast), border-color var(--motion-fast), color var(--motion-fast);
  }
  & .inline-button:hover {
    background: var(--surface-hover);
    border-color: var(--border-default);
    color: var(--icon-primary);
  }
}
</style>
