<template>
  <div class="recovery-center-host">
    <div
      v-if="currentFile?.recoverySourcePath !== undefined"
      class="recovery-document-note"
      data-testid="recovery-document-note"
    >
      {{ recoveryDocumentNote }}
    </div>

    <div
      v-if="state.items.length && !bannerDismissed"
      class="recovery-banner"
      data-testid="recovery-banner"
    >
      <span>{{ bannerText }}</span>
      <button
        type="button"
        class="recovery-link"
        @click="openDialog"
      >
        查看恢复内容
      </button>
      <button
        type="button"
        class="recovery-dismiss"
        aria-label="关闭"
        @click="bannerDismissed = true"
      >
        ×
      </button>
    </div>

    <el-dialog
      v-model="visible"
      title="恢复内容"
      width="860px"
      custom-class="recovery-center-dialog"
      :close-on-click-modal="false"
      @open="refresh"
    >
      <div
        v-if="state.safeMode"
        class="recovery-safe-mode"
      >
        <div>恢复上次布局时遇到问题，Inkiva 已安全启动。请逐项检查恢复内容。</div>
        <div class="recovery-actions">
          <el-button @click="continueBlankLayout">
            继续使用空白布局
          </el-button>
          <el-button
            type="danger"
            plain
            @click="requestDiscardWorkspace"
          >
            放弃恢复工作区状态…
          </el-button>
        </div>
      </div>

      <div
        v-if="state.items.length"
        class="recovery-layout"
      >
        <aside class="recovery-list">
          <button
            v-for="item in state.items"
            :key="item.id"
            type="button"
            class="recovery-item"
            :class="{ active: item.id === selectedId }"
            @click="selectItem(item.id)"
          >
            <strong>{{ item.title }}</strong>
            <span>{{ item.kind === 'damaged-source' ? '恢复数据异常' : item.pathname || '未命名文档' }}</span>
            <small>{{ formatTime(item.savedAt) }}</small>
            <small v-if="item.kind === 'revision' && item.differsFromDisk">与当前文件不同</small>
          </button>
        </aside>

        <section
          v-if="selectedItem"
          class="recovery-preview"
        >
          <template v-if="selectedItem.kind === 'damaged-source'">
            <h3>{{ selectedItem.title }}</h3>
            <p class="recovery-error">
              {{ selectedItem.error || '恢复数据无法读取。' }}
            </p>
            <code class="recovery-source-path">{{ selectedItem.sourcePath }}</code>
            <div class="recovery-actions">
              <el-button @click="retrySelected">
                重试
              </el-button>
              <el-button @click="showSelectedLocation">
                显示位置
              </el-button>
              <el-button
                type="danger"
                plain
                @click="requestDiscard"
              >
                放弃此恢复稿…
              </el-button>
            </div>
          </template>

          <template v-else>
            <header class="recovery-preview-header">
              <div>
                <h3>{{ selectedItem.title }}</h3>
                <p>{{ selectedItem.pathname || '未命名文档' }}</p>
              </div>
              <el-button-group>
                <el-button
                  size="small"
                  :type="previewMode === 'disk' ? 'primary' : 'default'"
                  @click="previewMode = 'disk'"
                >
                  当前文件
                </el-button>
                <el-button
                  size="small"
                  :type="previewMode === 'recovery' ? 'primary' : 'default'"
                  @click="previewMode = 'recovery'"
                >
                  恢复版本
                </el-button>
              </el-button-group>
            </header>

            <p
              v-if="selectedItem.error"
              class="recovery-error"
            >
              {{ selectedItem.error }}
            </p>

            <pre
              class="recovery-markdown-preview"
              data-testid="recovery-markdown-preview"
            >{{ previewMarkdown }}</pre>

            <p
              v-if="actionError"
              class="recovery-error"
            >
              {{ actionError }}
            </p>

            <div class="recovery-actions">
              <el-button
                type="primary"
                :disabled="selectedItem.recoveryMarkdown === null"
                @click="openRecoveryCopy"
              >
                作为新文档打开恢复稿
              </el-button>
              <el-button
                v-if="selectedItem.pathname && selectedItem.differsFromDisk"
                :disabled="selectedItem.recoveryMarkdown === null"
                @click="requestReplace"
              >
                用恢复稿替换文件…
              </el-button>
              <el-button
                type="danger"
                plain
                @click="requestDiscard"
              >
                放弃此恢复稿…
              </el-button>
            </div>
          </template>

          <div
            v-if="confirmAction"
            class="recovery-confirm"
          >
            <template v-if="confirmAction === 'replace'">
              <strong>确认替换当前文件？</strong>
              <p>Inkiva 会先把当前磁盘版本保存到本地历史，再写入恢复稿。</p>
              <el-button @click="confirmAction = null">
                取消
              </el-button>
              <el-button
                type="primary"
                @click="replaceSelected"
              >
                确认替换
              </el-button>
            </template>
            <template v-else>
              <strong>确认放弃这份恢复内容？</strong>
              <p>只有明确放弃后，这份恢复内容才会被清理。</p>
              <el-button @click="confirmAction = null">
                取消
              </el-button>
              <el-button
                type="danger"
                @click="discardSelected"
              >
                确认放弃
              </el-button>
            </template>
          </div>
        </section>
      </div>

      <div
        v-else
        class="recovery-empty"
      >
        没有待处理的恢复内容。
      </div>

      <div
        v-if="confirmWorkspaceDiscard"
        class="recovery-confirm"
      >
        <strong>确认放弃恢复工作区状态？</strong>
        <p>这会清理上次工作区的恢复状态和损坏恢复源；磁盘上的 Markdown 文件不会被修改。</p>
        <el-button @click="confirmWorkspaceDiscard = false">
          取消
        </el-button>
        <el-button
          type="danger"
          @click="discardWorkspaceState"
        >
          确认放弃工作区状态
        </el-button>
      </div>

      <template #footer>
        <el-button @click="visible = false">
          稍后处理
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/store/editor'
import type { RecoveryCenterItem, RecoveryCenterState } from '@shared/types/recovery'

const emptyState = (): RecoveryCenterState => ({ safeMode: false, items: [] })

const editorStore = useEditorStore()
const { currentFile } = storeToRefs(editorStore)
const state = ref<RecoveryCenterState>(emptyState())
const visible = ref(false)
const bannerDismissed = ref(false)
const selectedId = ref('')
const previewMode = ref<'disk' | 'recovery'>('recovery')
const confirmAction = ref<'replace' | 'discard' | null>(null)
const confirmWorkspaceDiscard = ref(false)
const actionError = ref('')

const selectedItem = computed<RecoveryCenterItem | null>(
  () => state.value.items.find(({ id }) => id === selectedId.value) ?? state.value.items[0] ?? null
)

const previewMarkdown = computed(() => {
  const item = selectedItem.value
  if (!item) return ''
  return previewMode.value === 'disk'
    ? (item.diskMarkdown ?? '当前文件不存在或无法读取。')
    : (item.recoveryMarkdown ?? '恢复版本无法读取。')
})

const bannerText = computed(() =>
  state.value.safeMode
    ? '恢复上次布局时遇到问题'
    : `找到 ${state.value.items.length} 份可能未保存的内容`
)

const recoveryDocumentNote = computed(() => {
  const source = currentFile.value?.recoverySourcePath
  const sourceName = source?.split(/[\\/]/).pop()
  return sourceName
    ? `从 ${sourceName} 的恢复稿打开 · 尚未另存为`
    : '从未命名文档的恢复稿打开 · 尚未另存为'
})

const keepSelectionValid = (): void => {
  if (!state.value.items.some(({ id }) => id === selectedId.value)) {
    selectedId.value = state.value.items[0]?.id ?? ''
  }
}

const refresh = async(): Promise<void> => {
  state.value = await window.electron.ipcRenderer.invoke('mt::recovery-center::get-state')
  keepSelectionValid()
}

const openDialog = async(): Promise<void> => {
  await refresh()
  visible.value = true
}

const selectItem = (id: string): void => {
  selectedId.value = id
  previewMode.value = 'recovery'
  confirmAction.value = null
  actionError.value = ''
}

const continueBlankLayout = (): void => {
  visible.value = false
  bannerDismissed.value = true
}

const requestDiscardWorkspace = (): void => {
  confirmWorkspaceDiscard.value = true
  confirmAction.value = null
  actionError.value = ''
}

const discardWorkspaceState = async(): Promise<void> => {
  await window.electron.ipcRenderer.invoke('mt::recovery-center::discard-workspace')
  confirmWorkspaceDiscard.value = false
  visible.value = false
  bannerDismissed.value = true
  await refresh()
}

const formatTime = (value: number | null): string =>
  value ? new Date(value).toLocaleString() : '时间未知'

const openRecoveryCopy = async(): Promise<void> => {
  const item = selectedItem.value
  if (!item) return
  const result = await window.electron.ipcRenderer.invoke('mt::recovery-center::open-copy', item.id)
  if (!result) {
    actionError.value = '恢复稿无法打开。'
    return
  }
  editorStore.NEW_UNTITLED_TAB({
    markdown: result.markdown,
    selected: true,
    recoverySourcePath: result.sourcePath
  })
  visible.value = false
}

const requestReplace = (): void => {
  confirmAction.value = 'replace'
  actionError.value = ''
}

const replaceSelected = async(): Promise<void> => {
  const item = selectedItem.value
  if (!item) return
  const result = await window.electron.ipcRenderer.invoke(
    'mt::recovery-center::replace-file',
    item.id,
    item.diskRevision
  )
  confirmAction.value = null
  if (!result.ok) {
    actionError.value =
      result.reason === 'external-change'
        ? '文件已在外部更改。已停止替换，请重新比较，或作为新文档打开后另存为。'
        : (result.message ?? '无法替换文件。')
    await refresh()
    previewMode.value = 'disk'
    return
  }
  actionError.value = ''
  await refresh()
}

const requestDiscard = (): void => {
  confirmAction.value = 'discard'
  actionError.value = ''
}

const discardSelected = async(): Promise<void> => {
  const item = selectedItem.value
  if (!item) return
  await window.electron.ipcRenderer.invoke('mt::recovery-center::discard', item.id)
  confirmAction.value = null
  actionError.value = ''
  await refresh()
}

const retrySelected = async(): Promise<void> => {
  const item = selectedItem.value
  if (!item) return
  state.value = await window.electron.ipcRenderer.invoke('mt::recovery-center::retry', item.id)
  keepSelectionValid()
}

const showSelectedLocation = (): void => {
  const item = selectedItem.value
  if (item?.sourcePath) window.electron.ipcRenderer.send('mt::shell::show-item', item.sourcePath)
}

let stopOpenListener: (() => void) | undefined

onMounted(() => {
  stopOpenListener = window.electron.ipcRenderer.on('mt::open-recovery-center', () => {
    void openDialog()
  })
  void refresh()
})

onBeforeUnmount(() => {
  stopOpenListener?.()
})
</script>

<style>
.recovery-center-host {
  flex: 0 0 auto;
}

.recovery-banner,
.recovery-document-note {
  min-height: 34px;
  box-sizing: border-box;
  padding: 7px 12px;
  border-bottom: 1px solid var(--floatBorderColor);
  background: var(--floatBgColor);
  color: var(--floatFontColor);
  font-size: 12px;
}

.recovery-banner {
  display: flex;
  align-items: center;
  gap: 8px;
}

.recovery-document-note {
  text-align: center;
  color: var(--text-secondary, var(--floatFontColor));
}

.recovery-link,
.recovery-dismiss,
.recovery-item {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
}

.recovery-link {
  color: var(--themeColor);
  cursor: pointer;
  font-weight: 600;
}

.recovery-dismiss {
  margin-left: auto;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
}

.recovery-safe-mode,
.recovery-error,
.recovery-confirm {
  border: 1px solid var(--floatBorderColor);
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 12px;
  background: var(--floatHoverColor);
}

.recovery-layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  min-height: 420px;
  max-height: 62vh;
  border: 1px solid var(--floatBorderColor);
  border-radius: 6px;
  overflow: hidden;
}

.recovery-list {
  overflow: auto;
  border-right: 1px solid var(--floatBorderColor);
  background: var(--itemBgColor);
}

.recovery-item {
  display: grid;
  width: 100%;
  gap: 4px;
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid var(--floatBorderColor);
  cursor: pointer;
}

.recovery-item:hover,
.recovery-item.active {
  background: var(--floatHoverColor);
}

.recovery-item span,
.recovery-item small,
.recovery-preview-header p {
  overflow: hidden;
  color: var(--text-secondary, var(--floatFontColor));
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recovery-preview {
  min-width: 0;
  padding: 16px;
  overflow: auto;
}

.recovery-preview-header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 16px;
}

.recovery-preview-header h3,
.recovery-preview-header p {
  margin: 0 0 6px;
}

.recovery-markdown-preview {
  min-height: 250px;
  max-height: 40vh;
  margin: 12px 0;
  padding: 14px;
  overflow: auto;
  border: 1px solid var(--floatBorderColor);
  border-radius: 6px;
  background: var(--itemBgColor);
  color: var(--floatFontColor);
  font-family: var(--codeFontFamily);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.recovery-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.recovery-source-path {
  display: block;
  overflow-wrap: anywhere;
}

.recovery-empty {
  padding: 48px 0;
  text-align: center;
  color: var(--text-secondary, var(--floatFontColor));
}
</style>
