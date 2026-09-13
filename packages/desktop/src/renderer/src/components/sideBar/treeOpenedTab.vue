<template>
  <div
    class="opened-file"
    :title="file.pathname"
    role="button"
    tabindex="0"
    :aria-label="file.filename"
    :aria-current="currentFile?.id === file.id ? 'page' : undefined"
    :class="[{ active: currentFile?.id === file.id, unsaved: !file.isSaved }]"
    @click="selectFile(file)"
    @keydown="handleOpenedFileKeydown"
  >
    <button
      type="button"
      class="close-icon"
      :aria-label="t('contextMenu.tabs.close') + ' ' + file.filename"
      @click.stop="removeFileInTab(file)"
    >
      <el-icon :size="10">
        <Close />
      </el-icon>
    </button>
    <span class="name">{{ file.filename }}</span>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/store/editor'
import { useI18n } from 'vue-i18n'
import { Close } from '@element-plus/icons-vue'
import type { TabDescriptor } from './types'

const props = defineProps<{
  file: TabDescriptor
}>()

const editorStore = useEditorStore()
const { t } = useI18n()

const { currentFile } = storeToRefs(editorStore)

const selectFile = (file: TabDescriptor): void => {
  if (file.id !== currentFile.value?.id) {
    editorStore.UPDATE_CURRENT_FILE(file)
  }
}

const removeFileInTab = (file: TabDescriptor): void => {
  const { isSaved } = file
  if (isSaved) {
    editorStore.FORCE_CLOSE_TAB(file)
  } else {
    editorStore.CLOSE_UNSAVED_TAB(file)
  }
}

const handleOpenedFileKeydown = (event: KeyboardEvent): void => {
  if (event.target !== event.currentTarget) return
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    selectFile(props.file)
    return
  }
  if (event.key === 'Delete') {
    event.preventDefault()
    removeFileInTab(props.file)
  }
}
</script>

<style scoped>
.opened-file {
  display: flex;
  user-select: none;
  height: 30px;
  line-height: 30px;
  margin-inline: 6px;
  padding-left: 35px;
  position: relative;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  transition: background-color var(--motion-fast), color var(--motion-fast);
  & > .close-icon {
    appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    pointer-events: none;
    position: absolute;
    top: 5px;
    left: 5px;
    width: 20px;
    height: 20px;
    margin: 0;
    padding: 0;
    color: var(--icon-secondary);
    background: transparent;
    border: 0;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: color var(--motion-fast), opacity var(--motion-fast), box-shadow var(--motion-fast);
  }
  & > .close-icon:focus-visible {
    opacity: 1;
    pointer-events: auto;
    outline: none;
    box-shadow: var(--focus-ring);
  }
  &:hover > .close-icon {
    opacity: 1;
    pointer-events: auto;
  }
  &:hover {
    background: var(--surface-hover);
  }
  & > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
.opened-file:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.opened-file.active {
  color: var(--text-primary);
  background: var(--color-accent-soft);
}
.unsaved.opened-file::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-accent);
  position: absolute;
  top: 12px;
  left: 12px;
}
.unsaved.opened-file:hover::before {
  content: none;
}
</style>
