<template>
  <div>
    <div
      v-if="showTitleBar"
      class="title-bar-editor-bg"
      :class="{ 'tabs-visible': showTabBar }"
    />
    <div
      v-if="showTitleBar"
      class="title-bar"
      :class="[
        { active: active },
        { 'tabs-visible': showTabBar },
        { frameless: titleBarStyle === 'custom' },
        { isOsx: isOsx }
      ]"
    >
      <div
        class="title"
        @dblclick.stop="toggleMaxmizeOnMacOS"
      >
        <span v-if="!filename">Inkiva</span>
        <span v-else>
          <span
            v-for="(path, index) of paths"
            :key="index"
          >
            {{ path }}
            <el-icon
              class="path-arrow"
              :size="12"
            >
              <ArrowRight />
            </el-icon>
          </span>
          <span
            class="filename"
            :class="{ isOsx: platform === 'darwin' }"
            @click="rename"
          >
            {{ filename }}
          </span>
          <span
            class="save-dot"
            :class="{ show: !isSaved }"
          />
        </span>
      </div>
      <nav
        v-if="showCustomTitleBar"
        class="menu-bar title-no-drag"
        aria-label="Application menu"
      >
        <button
          v-for="item in topMenuItems"
          :key="item.id"
          class="menu-bar-item"
          :class="{ active: activeMenuId === item.id }"
          type="button"
          @click.stop="handleMenuClick(item.id, $event)"
        >
          {{ item.label }}
        </button>
      </nav>
      <div
        class="word-count-toolbar"
        :class="{ custom: showCustomTitleBar }"
      >
        <el-tooltip
          v-if="wordCount"
          class="item"
          :content="`${wordCount[show]} ${HASH[show].full + (wordCount[show] > 1 ? 's' : '')}`"
          placement="bottom-end"
        >
          <template #content>
            <div class="title-item">
              <span class="front">{{ t('menu.counter.words') }}:</span><span class="text">{{ wordCount['word'] }}</span>
            </div>
            <div class="title-item">
              <span class="front">{{ t('menu.counter.characters') }}:</span><span class="text">{{ wordCount['character'] }}</span>
            </div>
            <div class="title-item">
              <span class="front">{{ t('menu.counter.paragraphs') }}:</span><span class="text">{{ wordCount['paragraph'] }}</span>
            </div>
          </template>
          <div
            v-if="wordCount"
            class="word-count"
            @click.stop="handleWordClick"
          >
            <span class="text-center-vertical">{{ `${HASH[show].short} ${wordCount[show]}` }}</span>
          </div>
        </el-tooltip>
      </div>
      <div
        v-if="titleBarStyle === 'custom' && !isFullScreen && !isOsx"
        class="right-toolbar"
        :class="[{ 'title-no-drag': titleBarStyle === 'custom' }]"
      >
        <div
          class="frameless-titlebar-button frameless-titlebar-close"
          @click.stop="handleCloseClick"
        >
          <div>
            <svg
              width="10"
              height="10"
            >
              <path :d="windowIconClose" />
            </svg>
          </div>
        </div>
        <div
          class="frameless-titlebar-button frameless-titlebar-toggle"
          @click.stop="handleMaximizeClick"
        >
          <div>
            <svg
              width="10"
              height="10"
            >
              <path
                v-show="!isMaximized"
                :d="windowIconMaximize"
              />
              <path
                v-show="isMaximized"
                :d="windowIconRestore"
              />
            </svg>
          </div>
        </div>
        <div
          class="frameless-titlebar-button frameless-titlebar-minimize"
          @click.stop="handleMinimizeClick"
        >
          <div>
            <svg
              width="10"
              height="10"
            >
              <path :d="windowIconMinimize" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { usePreferencesStore } from '@/store/preferences.js'
import { useLayoutStore } from '@/store/layout.js'
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { minimizePath, restorePath, maximizePath, closePath } from '../../assets/window-controls.js'
import { PATH_SEPARATOR } from '../../config'
import { isOsx as isOsxPlatform } from '@/util'
import { shouldShowInAppTitleBar } from './visibility'
import { useEditorStore } from '@/store/editor'
import { useI18n } from 'vue-i18n'
import { ArrowRight } from '@element-plus/icons-vue'
import type { FileWordCount } from '@shared/types/files'

interface ProjectInfo {
  name?: string
  [key: string]: unknown
}

const props = defineProps<{
  project?: ProjectInfo | null
  filename?: string
  pathname?: string
  active?: boolean
  wordCount?: FileWordCount | null
  platform?: string
  isSaved?: boolean
}>()

const preferencesStore = usePreferencesStore()
const layoutStore = useLayoutStore()
const editorStore = useEditorStore()
const { t } = useI18n()

const isOsx = isOsxPlatform
const HASH = {
  word: {
    short: 'W',
    full: 'word'
  },
  character: {
    short: 'C',
    full: 'character'
  },
  paragraph: {
    short: 'P',
    full: 'paragraph'
  },
  all: {
    short: 'A',
    full: '(with space)character'
  }
}
const windowIconMinimize = minimizePath
const windowIconRestore = restorePath
const windowIconMaximize = maximizePath
const windowIconClose = closePath

const isFullScreen = ref(false)
const isMaximized = ref(false)
const show = ref<'word' | 'paragraph' | 'character' | 'all'>('word')

const activeMenuId = ref<string | null>(null)

const topMenuItems = computed(() => [
  { id: 'fileMenu', label: t('menu.file.file') },
  { id: 'editMenu', label: t('menu.edit.edit') },
  { id: 'paragraphMenuEntry', label: t('menu.paragraph.title') },
  { id: 'formatMenuItem', label: t('menu.format.format') },
  { id: 'viewMenu', label: t('menu.view.view') },
  { id: 'themeMenu', label: t('menu.theme.theme') },
  { id: 'windowMenu', label: t('menu.window.title') },
  { id: 'helpMenu', label: t('menu.help.help') }
])

onMounted(async () => {
  try {
    const [fs, max] = await Promise.all([
      window.electron.windowControl.isFullScreen(),
      window.electron.windowControl.isMaximized()
    ])
    isFullScreen.value = !!fs
    isMaximized.value = !!max
  } catch {}
})

const { titleBarStyle } = storeToRefs(preferencesStore)
const { showTabBar } = storeToRefs(layoutStore)

const paths = computed(() => {
  if (!props.pathname) return []
  const pathnameToken = props.pathname.split(PATH_SEPARATOR).filter((i) => i)
  return pathnameToken.slice(0, pathnameToken.length - 1).slice(-3)
})

const showCustomTitleBar = computed(() => {
  return titleBarStyle.value === 'custom' && !isOsx
})

const showTitleBar = computed(() => {
  return shouldShowInAppTitleBar(titleBarStyle.value, isOsx)
})

watch(
  () => props.filename,
  (value) => {
    // Set filename when hover on dock
    const hasOpenFolder = !!(props.project && props.project.name)
    const projectName = props.project?.name ?? ''
    let title = ''
    if (value) {
      title = hasOpenFolder ? `${value} - ${projectName}` : `${value}`
    } else {
      title = hasOpenFolder ? projectName : ''
    }

    document.title = title
  }
)

const handleWordClick = () => {
  const ITEMS = ['word', 'paragraph', 'character', 'all'] as const
  const len = ITEMS.length
  let index = ITEMS.indexOf(show.value)
  index += 1
  if (index >= len) index = 0
  show.value = ITEMS[index]!
}

const handleCloseClick = () => {
  window.electron.windowControl.close()
}

const handleMaximizeClick = async () => {
  if (isFullScreen.value) {
    window.electron.windowControl.setFullScreen(false)
    return
  }
  if (isMaximized.value) window.electron.windowControl.unmaximize()
  else window.electron.windowControl.maximize()
}

const toggleMaxmizeOnMacOS = () => {
  if (isOsx) {
    handleMaximizeClick()
  }
}

const handleMinimizeClick = () => {
  window.electron.windowControl.minimize()
}

const handleMenuClick = (menuId: string, event: MouseEvent): void => {
  const target = event.currentTarget as HTMLElement | null
  if (!target) return

  const rect = target.getBoundingClientRect()
  activeMenuId.value = menuId
  window.electron.windowControl.popupApplicationSubmenu(menuId, {
    x: Math.round(rect.left),
    y: Math.round(rect.bottom)
  })
}

const rename = () => {
  if (props.platform === 'darwin') {
    editorStore.RESPONSE_FOR_RENAME()
  }
}

const onMaximize = () => {
  isMaximized.value = true
}
const onUnmaximize = () => {
  isMaximized.value = false
}
const onEnterFullScreen = () => {
  isFullScreen.value = true
}
const onLeaveFullScreen = () => {
  isFullScreen.value = false
}

const offMaximize = window.electron.ipcRenderer.on('mt::window-maximize', onMaximize)
const offUnmaximize = window.electron.ipcRenderer.on('mt::window-unmaximize', onUnmaximize)
const offEnterFullScreen = window.electron.ipcRenderer.on(
  'mt::window-enter-full-screen',
  onEnterFullScreen
)
const offLeaveFullScreen = window.electron.ipcRenderer.on(
  'mt::window-leave-full-screen',
  onLeaveFullScreen
)

const offMenuClosed = window.electron.ipcRenderer.on('mt::menu::closed', () => {
  activeMenuId.value = null
})

onBeforeUnmount(() => {
  offMaximize()
  offUnmaximize()
  offEnterFullScreen()
  offLeaveFullScreen()
  offMenuClosed()
})
</script>

<style scoped>
.title-bar-editor-bg {
  height: var(--titleBarHeight);
  background: var(--editorBgColor);
  position: relative;
  left: 0;
  top: 0;
  right: 0;
}
.title-bar {
  -webkit-app-region: drag;
  user-select: none;
  background: transparent;
  height: var(--titleBarHeight);
  box-sizing: border-box;
  color: var(--editorColor50);
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  z-index: 2;
  transition: color var(--motion-normal) ease;
  cursor: default;
}
.active {
  color: var(--editorColor);
}
img {
  height: 90%;
  margin-top: 1px;
  vertical-align: top;
}
.title {
  padding: 0 142px;
  height: 100%;
  line-height: var(--titleBarHeight);
  font-size: 14px;
  text-align: center;
  transition: color var(--motion-normal) ease;
  & .filename {
    transition: color var(--motion-normal) ease;
  }
  &::after {
    content: '';
    position: absolute;
    top: 0;
    height: 1px;
    width: 100%;
    z-index: 1;
    -webkit-app-region: no-drag;
  }
}
.title-bar.frameless:not(.isOsx) .title {
  position: absolute;
  top: 0;
  left: 500px;
  right: 160px;
  padding: 0 8px;
  box-sizing: border-box;
}

div.title > span {
  /* Workaround for GH#339 */
  display: block;
  direction: rtl;
  overflow: hidden;
  text-overflow: clip;
  white-space: nowrap;
}

.title-bar .title .filename.isOsx:hover {
  color: var(--color-accent);
}

.active .save-dot {
  margin-right: 0.25rem;
  width: 8px;
  height: 8px;
  display: inline-block;
  border-radius: 50%;
  background: var(--highlightThemeColor);
  opacity: 0.7;
  visibility: hidden;
}
.active .save-dot.show {
  visibility: visible;
}
.title:hover {
  color: var(--text-primary);
}

.menu-bar {
  position: absolute;
  top: 0;
  left: 8px;
  height: var(--titleBarHeight);
  max-width: calc(100% - 150px);
  display: flex;
  align-items: center;
  gap: 2px;
  overflow: hidden;
  z-index: 3;
}

.menu-bar-item {
  -webkit-app-region: no-drag;
  appearance: none;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  line-height: 1;
  padding: 5px 8px;
  white-space: nowrap;
  transition: background-color var(--motion-fast) ease, color var(--motion-fast) ease;
}

.menu-bar-item:hover,
.menu-bar-item.active {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.menu-bar-item:focus-visible {
  outline: 2px solid var(--color-accent-focus);
  outline-offset: -2px;
}

.word-count-toolbar {
  height: 100%;
  position: absolute;
  top: 0;
  right: 0;
  width: 138px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.word-count-toolbar.custom {
  right: 138px;
  width: 112px;
}

.right-toolbar {
  height: 100%;
  position: absolute;
  top: 0;
  right: 0;
  width: 138px;
  display: flex;
  align-items: center;
  flex-direction: row-reverse;
  & .item {
    margin-right: 10px;
  }
}

.word-count {
  -webkit-app-region: no-drag;
  cursor: pointer;
  font-size: 14px;
  color: var(--editorColor30);
  text-align: center;
  line-height: 24px;
  padding: 0 5px;
  box-sizing: border-box;
  transition: background-color var(--motion-fast) ease, color var(--motion-fast) ease;
  & > .text-center-vertical {
    padding: 2px 5px;
    border-radius: 3px;
  }
  &:hover > span {
    background: var(--surface-hover);
    color: var(--text-primary);
  }
}

.title-no-drag {
  -webkit-app-region: no-drag;
}
/* frameless window controls */
.frameless-titlebar-button {
  position: relative;
  display: block;
  width: 46px;
  height: var(--titleBarHeight);
}
.frameless-titlebar-button > div {
  position: absolute;
  display: inline-flex;
  top: 50%;
  left: 50%;
  transform: translateX(-50%) translateY(-50%);
}
.frameless-titlebar-close:hover {
  background-color: rgb(228, 79, 79);
}
.frameless-titlebar-minimize:hover,
.frameless-titlebar-toggle:hover {
  background-color: rgba(0, 0, 0, 0.1);
}
.frameless-titlebar-button svg {
  fill: #000000;
}
.frameless-titlebar-close:hover svg {
  fill: #ffffff;
}

.text-center-vertical {
  display: inline-block;
  vertical-align: middle;
  line-height: normal;
}

@media (max-width: 820px) {
  .title-bar.frameless:not(.isOsx) .title {
    display: none;
  }

  .menu-bar {
    max-width: calc(100% - 148px);
  }

  .menu-bar-item {
    padding-left: 7px;
    padding-right: 7px;
  }
}
</style>

<style>
.title-item {
  height: 28px;
  line-height: 28px;
  & .front {
    opacity: 0.7;
  }
  & .text {
    margin-left: 10px;
  }
}
</style>
