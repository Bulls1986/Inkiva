<template>
  <div
    class="opened-file"
    :title="file.pathname"
    :class="[{ active: currentFile?.id === file.id, unsaved: !file.isSaved }]"
    @click="selectFile(file)"
  >
    <el-icon
      class="close-icon"
      :size="10"
      @click.stop="removeFileInTab(file)"
    >
      <Close />
    </el-icon>
    <span class="name">{{ file.filename }}</span>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/store/editor'
import { Close } from '@element-plus/icons-vue'
import type { TabDescriptor } from './types'

defineProps<{
  file: TabDescriptor
}>()

const editorStore = useEditorStore()

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
    display: none;
    position: absolute;
    top: 10px;
    left: 10px;
    cursor: pointer;
    color: var(--icon-secondary);
    transition: color var(--motion-fast), opacity var(--motion-fast);
  }
  &:hover > .close-icon {
    display: inline-flex;
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
