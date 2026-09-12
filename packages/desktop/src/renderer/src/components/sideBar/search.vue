<template>
  <div class="side-bar-search">
    <div class="search-wrapper">
      <input
        ref="searchEl"
        v-model="keyword"
        type="text"
        class="search-input"
        :placeholder="t('sideBar.search.searchInFolder')"
        @input="handleSearchInput"
      >
      <div class="controls">
        <span
          :title="t('search.caseSensitive')"
          class="is-case-sensitive"
          :class="{ active: isCaseSensitive }"
          @click.stop="caseSensitiveClicked()"
        >
          <FindCaseIcon aria-hidden="true" />
        </span>
        <span
          :title="t('search.wholeWord')"
          class="is-whole-word"
          :class="{ active: isWholeWord }"
          @click.stop="wholeWordClicked()"
        >
          <FindWordIcon aria-hidden="true" />
        </span>
        <span
          :title="t('search.useRegex')"
          class="is-regex"
          :class="{ active: isRegexp }"
          @click.stop="regexpClicked()"
        >
          <FindRegexIcon aria-hidden="true" />
        </span>
      </div>
    </div>

    <div
      v-if="showNoFolderOpenedMessage"
      class="search-message-section"
    >
      <span>{{ t('sideBar.search.noFolderOpen') }}</span>
    </div>
    <div
      v-if="showNoResultFoundMessage"
      class="search-message-section"
    >
      {{ t('sideBar.search.noResultsFound') }}
    </div>
    <div
      v-if="searchErrorString"
      class="search-message-section"
    >
      {{ searchErrorString }}
    </div>

    <div
      v-show="showSearchCancelArea"
      class="cancel-area"
    >
      <el-button
        type="primary"
        size="mini"
        @click="cancelSearcher"
      >
        {{ t('sideBar.search.cancel') }} <VideoPause />
      </el-button>
    </div>
    <div
      v-if="searchResult.length"
      class="search-result-info"
    >
      {{ searchResultInfo }}
    </div>
    <div
      v-if="searchResult.length"
      class="search-result"
    >
      <search-result-item
        v-for="(item, index) of searchResult"
        :key="index"
        :search-result="item"
      />
    </div>
    <div
      v-else
      class="empty"
    >
      <div class="no-data">
        <el-button
          v-if="showNoFolderOpenedMessage"
          text
          bg
          type="primary"
          @click="openFolder"
        >
          {{ t('sideBar.search.openFolder') }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useLayoutStore } from '@/store/layout'
import { useProjectStore } from '@/store/project'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import { storeToRefs } from 'pinia'
import bus from '../../bus'
import log from 'electron-log'
import SearchResultItem from './searchResultItem.vue'
import RipgrepDirectorySearcher from '../../node/ripgrepSearcher'
import FindCaseIcon from '@/assets/icons/searchIcons/iconCase.svg'
import FindWordIcon from '@/assets/icons/searchIcons/iconWord.svg'
import FindRegexIcon from '@/assets/icons/searchIcons/iconRegex.svg'
import { VideoPause } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import type { SearchResult } from './types'

const { t } = useI18n()
const layoutStore = useLayoutStore()
const projectStore = useProjectStore()
const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()

let searcherCancelCallback: (() => void) | null = null
const ripgrepDirectorySearcher = new RipgrepDirectorySearcher()
let searchTimer: ReturnType<typeof setTimeout> | null = null
let searchGeneration = 0

const keyword = ref('')
const searchResult = ref<SearchResult[]>([])
const searcherRunning = ref(false)
const showSearchCancelArea = ref(false)
const searchErrorString = ref('')
const isCaseSensitive = ref(false)
const isWholeWord = ref(false)
const isRegexp = ref(false)
const searchEl = ref<HTMLInputElement | null>(null)

const { rightColumn, showSideBar } = storeToRefs(layoutStore)
const { currentFile } = storeToRefs(editorStore)
const { projectTree } = storeToRefs(projectStore)
const {
  searchExclusions,
  searchMaxFileSize,
  searchIncludeHidden,
  searchNoIgnore,
  searchFollowSymlinks
} = storeToRefs(preferencesStore)

const searchMatches = computed(() => currentFile.value?.searchMatches)

const searchRootPath = computed(() => {
  if (projectTree.value?.pathname) return projectTree.value.pathname
  const currentPath = currentFile.value?.pathname
  return currentPath ? window.path.dirname(currentPath) : ''
})

const searchResultInfo = computed(() => {
  const fileCount = searchResult.value.length
  const matchCount = searchResult.value.reduce((acc, item) => {
    return acc + item.matches.length
  }, 0)

  return t('search.searchResultInfo', { matchCount, fileCount })
})

const showNoFolderOpenedMessage = computed(() => {
  return !searchRootPath.value
})

const showNoResultFoundMessage = computed(() => {
  return (
    searchResult.value.length === 0 && searcherRunning.value === false && keyword.value.length > 0
  )
})

const clearSearchTimer = (): void => {
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
}

const cancelActiveSearch = (): void => {
  if (searcherCancelCallback) {
    searcherCancelCallback()
    searcherCancelCallback = null
  }
  searcherRunning.value = false
  stopShowSearchCancelAreaTimer()
}

const finishSearch = (
  generation: number,
  resultMap: Map<string, SearchResult>
): void => {
  if (generation !== searchGeneration) return
  searchResult.value = Array.from(resultMap.values())
  searcherRunning.value = false
  searcherCancelCallback = null
  stopShowSearchCancelAreaTimer()
}

const performSearch = (generation: number): void => {
  searchTimer = null
  if (generation !== searchGeneration) return

  const rootDirectoryPath = searchRootPath.value
  if (!rootDirectoryPath || !keyword.value.trim()) {
    searcherRunning.value = false
    return
  }

  let canceled = false
  const resultMap = new Map<string, SearchResult>()
  searcherRunning.value = true
  startShowSearchCancelAreaTimer()

  const appendResult = (raw: unknown): void => {
    if (!raw || typeof raw !== 'object') return
    const result = raw as Partial<SearchResult>
    if (typeof result.filePath !== 'string' || !Array.isArray(result.matches)) return
    const existing = resultMap.get(result.filePath)
    if (existing) {
      existing.matches.push(...result.matches)
    } else {
      resultMap.set(result.filePath, {
        filePath: result.filePath,
        matches: [...result.matches]
      })
    }
  }

  const cancellable = ripgrepDirectorySearcher.search([rootDirectoryPath], keyword.value, {
    didMatch: (res: unknown) => {
      if (canceled || generation !== searchGeneration) return
      appendResult(res)
    },
    didSearchPaths: (numPathsFound: unknown) => {
      if (
        !canceled &&
        generation === searchGeneration &&
        typeof numPathsFound === 'number' &&
        numPathsFound > 100
      ) {
        canceled = true
        searchErrorString.value = t('search.searchLimited', { count: 100 })
        cancellable.cancel()
        finishSearch(generation, resultMap)
      }
    },

    isCaseSensitive: isCaseSensitive.value,
    isWholeWord: isWholeWord.value,
    isRegexp: isRegexp.value,
    exclusions: searchExclusions.value,
    maxFileSize: searchMaxFileSize.value || null,
    includeHidden: searchIncludeHidden.value,
    noIgnore: searchNoIgnore.value,
    followSymlinks: searchFollowSymlinks.value,
    inclusions: window.fileUtils.MARKDOWN_INCLUSIONS
  })

  cancellable
    .then(() => {
      if (canceled) return
      finishSearch(generation, resultMap)
    })
    .catch((err) => {
      if (generation !== searchGeneration || canceled) return
      log.error('Error while searching in directory:', err)
      searchResult.value = []
      searcherRunning.value = false
      searcherCancelCallback = null
      stopShowSearchCancelAreaTimer()
    })

  searcherCancelCallback = () => {
    canceled = true
    cancellable.cancel()
  }
}

const scheduleSearch = (immediate = false): void => {
  searchGeneration++
  const generation = searchGeneration
  clearSearchTimer()
  cancelActiveSearch()
  searchErrorString.value = ''
  searchResult.value = []

  if (!keyword.value.trim() || !searchRootPath.value) {
    return
  }

  searcherRunning.value = true
  if (immediate) {
    performSearch(generation)
  } else {
    searchTimer = setTimeout(() => performSearch(generation), 180)
  }
}

const search = (): void => {
  scheduleSearch(true)
}

const handleSearchInput = (): void => {
  scheduleSearch()
}

const handleFindInFolder = (executeSearch: boolean | unknown = true): void => {
  nextTick(() => {
    if (searchEl.value) {
      searchEl.value.focus()
      // `searchMatches.value` may carry a `selectedText` populated elsewhere
      // (legacy contract from CodeMirror / find-in-page). Narrow defensively.
      const selectedText = (searchMatches.value as { selectedText?: string } | undefined)
        ?.selectedText
      if (selectedText) {
        keyword.value = selectedText
        if (executeSearch) {
          search()
        }
      }
    }
  })
}

const openFolder = (): void => {
  projectStore.ASK_FOR_OPEN_PROJECT()
}

const caseSensitiveClicked = (): void => {
  isCaseSensitive.value = !isCaseSensitive.value
  search()
}

const wholeWordClicked = (): void => {
  isWholeWord.value = !isWholeWord.value
  search()
}

const regexpClicked = (): void => {
  isRegexp.value = !isRegexp.value
  search()
}

let searchCancelTimer: ReturnType<typeof setTimeout> | null = null
const startShowSearchCancelAreaTimer = (): void => {
  if (searchCancelTimer) {
    clearTimeout(searchCancelTimer)
    searchCancelTimer = null
  }
  searchCancelTimer = setTimeout(() => {
    showSearchCancelArea.value = true
  }, 500)
}

const stopShowSearchCancelAreaTimer = (): void => {
  if (searchCancelTimer) {
    clearTimeout(searchCancelTimer)
    searchCancelTimer = null
  }
  showSearchCancelArea.value = false
}

const cancelSearcher = (): void => {
  searchGeneration++
  clearSearchTimer()
  cancelActiveSearch()
}

watch(showSideBar, (value, oldValue) => {
  if (rightColumn.value === 'search') {
    if (value && !oldValue) {
      handleFindInFolder(false)
    } else {
      cancelSearcher()
      bus.emit('search-blur')
    }
  }
})

watch(searchRootPath, () => {
  if (keyword.value.trim()) scheduleSearch()
})

const handleProjectTreeChanged = (payload: unknown): void => {
  const type =
    payload && typeof payload === 'object' && 'type' in payload
      ? String((payload as { type?: unknown }).type)
      : ''
  if (
    (type === 'add' || type === 'unlink' || type === 'addDir' || type === 'unlinkDir') &&
    keyword.value.trim()
  ) {
    scheduleSearch()
  }
}

onMounted(() => {
  handleFindInFolder()
  bus.on('findInFolder', handleFindInFolder)
  bus.on('project-tree-changed', handleProjectTreeChanged)
  if (keyword.value.length > 0 && searcherRunning.value === false) {
    search()
  }
})

onBeforeUnmount(() => {
  searchGeneration++
  clearSearchTimer()
  cancelActiveSearch()
  bus.off('findInFolder', handleFindInFolder)
  bus.off('project-tree-changed', handleProjectTreeChanged)
})
</script>

<style scoped>
.side-bar-search {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.search-wrapper {
  display: flex;
  margin: 37px 8px 10px 8px;
  padding: 0 6px;
  border-radius: 4px;
  height: 28px;
  border: 1px solid var(--border-default);
  background: var(--surface-editor);
  box-sizing: border-box;
  align-items: center;
  transition: border-color var(--motion-fast), background-color var(--motion-fast);
  &:focus-within {
    border-color: var(--border-focus);
  }
  & > input {
    color: var(--text-primary);
    background: transparent;
    height: 100%;
    flex: 1;
    border: none;
    outline: none;
    padding: 0;
    font-size: 13px;
    width: 50%;
  }
  & > .controls {
    display: flex;
    flex-shrink: 0;
    margin-top: 0;
    & > span {
      cursor: pointer;
      width: 18px;
      height: 18px;
      margin-left: 0;
      margin-right: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      &:hover {
        color: var(--icon-primary);
      }
      & > svg {
        width: 14px;
        height: 14px;
        fill: var(--icon-secondary);
        &:hover {
          fill: var(--color-accent);
        }
      }
      &.active svg {
        fill: var(--color-accent);
      }
    }
  }

  & > svg {
    cursor: pointer;
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    margin-right: 10px;
    &:hover {
      color: var(--icon-primary);
    }
  }
}
.cancel-area {
  text-align: center;
  margin-bottom: 16px;
}
.search-message-section {
  overflow-wrap: break-word;
}
.search-result-info,
.search-message-section {
  padding-left: 15px;
  margin-bottom: 5px;
  font-size: 12px;
  color: var(--text-secondary);
}
.empty,
.search-result {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  &::-webkit-scrollbar:vertical {
    width: 8px;
  }
}
.empty {
  font-size: 14px;
  text-align: center;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  padding-bottom: 100px;
  & .no-data {
    display: flex;
    align-items: center;
    flex-direction: column;
  }
  & .no-data .el-button {
    margin-top: 20px;
  }
  & .no-data .el-button.is-text.is-has-bg {
    background-color: var(--buttonPrimaryBgColor);
    color: var(--buttonPrimaryFontColor);
    border-color: transparent;
    box-shadow: none;
    transition: background-color var(--motion-fast), color var(--motion-fast);
  }
  & .no-data .el-button.is-text.is-has-bg:hover,
  & .no-data .el-button.is-text.is-has-bg:focus {
    background-color: var(--buttonPrimaryBgColorHover);
    color: var(--buttonPrimaryFontColorHover);
  }
}
</style>
