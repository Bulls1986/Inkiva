<template>
  <div class="pref-sidebar">
    <h3 class="title">
      {{ t('preferences.title') }}
    </h3>
    <section class="search-wrapper">
      <el-autocomplete
        v-model="state"
        popper-class="pref-autocomplete"
        :fetch-suggestions="querySearch"
        :placeholder="t('preferences.search.placeholder')"
        :trigger-on-focus="false"
        @select="handleSelect"
      >
        <template #suffix>
          <Search
            width="16"
            height="16"
          />
        </template>
        <template #default="{ item }">
          <div class="name">
            {{ item.category }}
          </div>
          <span class="addr">{{ item.preference }}</span>
        </template>
      </el-autocomplete>
    </section>
    <section class="category">
      <div
        v-for="c of getCategory()"
        :key="c.name"
        class="item"
        :class="{ active: c.label === currentCategory }"
        @click="handleCategoryItemClick(c)"
      >
        <component :is="c.icon" />
        <span>{{ c.name }}</span>
      </div>
    </section>
  </div>
</template>
<script setup lang="ts">
import { getCategory, getTranslatedSearchContent } from './config'
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'

interface SearchEntry {
  key: string
  category: string
  categoryEn: string
  preference: string
  preferenceEn: string
  routeCategory: string
  description: string
  enum: unknown[] | undefined
}

interface CategoryItem {
  name: string
  path: string
}

const { t } = useI18n()

const router = useRouter()
const route = useRoute()

const currentCategory = ref<string>('general')
const restaurants = ref<SearchEntry[]>([])
const state = ref<string>('')

watch(
  () => route.name,
  (newRouteName) => {
    if (newRouteName) {
      currentCategory.value = String(newRouteName)
    }
  }
)

const querySearch = (queryString: string, cb: (results: SearchEntry[]) => void): void => {
  const results = queryString
    ? restaurants.value.filter(createFilter(queryString))
    : restaurants.value
  cb(results)
}

const createFilter = (queryString: string): ((restaurant: SearchEntry) => boolean) => {
  const q = queryString.toLowerCase()
  return (restaurant: SearchEntry): boolean => {
    // Support both the current language and English keywords
    const fields = [
      restaurant.preference,
      restaurant.category,
      restaurant.preferenceEn,
      restaurant.categoryEn
    ]
      .filter(Boolean)
      .map((s) => String(s).toLowerCase())
    return fields.some((f) => f.indexOf(q) >= 0)
  }
}

const loadAll = (): SearchEntry[] => getTranslatedSearchContent()

const handleSelect = (item: SearchEntry | null | undefined): void => {
  // Use a safe routeCategory to avoid a blank screen caused by invalid categories
  const target =
    item && item.routeCategory ? item.routeCategory : (item?.category || 'general').toLowerCase()
  router.push({ path: `/preference/${target}` }).catch(() => {})
}

const handleCategoryItemClick = (item: CategoryItem): void => {
  if (item.name.toLowerCase() !== currentCategory.value) {
    router.push({
      path: item.path
    })
  }
}

const onIpcCategoryChange = (_event: unknown, category: unknown): void => {
  const categoryName = typeof category === 'string' ? category : ''
  const validRoute =
    categoryName &&
    router.getRoutes().findIndex((r) => r.path.endsWith(`/${categoryName}`)) !== -1
  if (validRoute) {
    router.push({
      path: `/preference/${categoryName}`
    })
  }
}

onMounted(() => {
  restaurants.value = loadAll()
  if (route.name) {
    currentCategory.value = String(route.name)
  }
  window.electron.ipcRenderer.on('settings::change-tab', onIpcCategoryChange)
  // Listen for language changes and refresh the search index
  const languageChanged = (): void => {
    restaurants.value = loadAll()
  }
  window.addEventListener('languageChanged', languageChanged)
  // Remove listener on unmount
  onUnmounted(() => window.removeEventListener('languageChanged', languageChanged))
})

onUnmounted(() => {
  // removeAllListeners takes a single channel argument. The handler ref was
  // passed historically but ignored by the typed bridge; removing only the
  // handler we registered would require holding the unsubscribe callback
  // returned by `.on`, which is not yet plumbed through here.
  window.electron.ipcRenderer.removeAllListeners('settings::change-tab')
})
</script>

<style>
.pref-sidebar {
  -webkit-app-region: drag;
  display: flex;
  flex-direction: column;
  background: var(--surface-chrome);
  border-right: 1px solid var(--border-subtle);
  width: var(--prefSideBarWidth);
  height: 100vh;
  padding-top: 24px;
  box-sizing: border-box;
  & h3 {
    margin: 0;
    padding: 0 20px;
    font-size: 16px;
    font-weight: 600;
    text-align: left;
    color: var(--text-primary);
  }
}
.search-wrapper {
  -webkit-app-region: no-drag;
  padding: 0 12px;
  margin: 16px 0;
}
.el-autocomplete {
  width: 100%;

  & .el-input__wrapper {
    background: var(--surface-editor);
    box-shadow: 0 0 0 1px var(--border-default) inset;
    border-radius: var(--radius-md);
    transition: background-color var(--motion-fast), box-shadow var(--motion-fast);
  }

  & .el-input__inner {
    border: none;
    background: transparent;
    height: 28px;
    line-height: 28px;
    font-size: 13px;
  }
}
.pref-autocomplete {
  background: var(--surface-elevated);
  border-color: var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--elevation-floating);
  & .el-autocomplete-suggestion__wrap li:hover {
    background: var(--surface-hover);
  }
  & .popper__arrow {
    display: none;
  }
  & li {
    line-height: normal;
    padding: 7px;
    opacity: 0.8;

    & .name {
      text-overflow: ellipsis;
      overflow: hidden;
      font-weight: 600;
      color: var(--text-primary);
    }
    & .addr {
      font-size: 12px;
      color: var(--text-secondary);
    }

    & .highlighted .addr {
      color: var(--text-secondary);
    }
  }
}
.category {
  -webkit-app-region: no-drag;
  overflow-y: auto;
  & .item {
    width: calc(100% - 16px);
    height: 36px;
    margin: 4px 8px;
    font-size: 14px;
    color: var(--text-secondary);
    padding: 0 12px;
    box-sizing: border-box;
    display: flex;
    flex-direction: row;
    align-items: center;
    cursor: pointer;
    position: relative;
    user-select: none;
    border-radius: var(--radius-md);
    transition: color var(--motion-fast), background-color var(--motion-fast);
    & > svg {
      width: 16px;
      height: 16px;
      color: var(--icon-secondary);
      margin-right: 8px;
      transition: color var(--motion-fast);
    }
    &.active > svg {
      color: var(--color-accent);
    }
    &:hover {
      background: var(--surface-hover);
      color: var(--text-primary);
    }
    &.active {
      color: var(--text-primary);
      background: var(--color-accent-soft);
    }
  }
}
</style>
