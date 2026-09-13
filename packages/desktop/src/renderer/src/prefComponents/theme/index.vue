<template>
  <div class="pref-theme">
    <h4>{{ t('preferences.theme.title') }}</h4>
    <section class="official-themes">
      <div
        v-for="themeItem of themes"
        :key="themeItem.name"
        class="theme"
        :class="[
          themeItem.name,
          {
            active: themeItem.name === theme,
            disabled: followSystemTheme
          }
        ]"
        @click="!followSystemTheme && onSelectChange('theme', themeItem.name)"
      >
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-html="themeItem.html" />
      </div>
    </section>
    <separator />

    <Bool
      :description="t('preferences.theme.followSystemTheme')"
      :bool="followSystemTheme"
      :on-change="(value) => onSelectChange('followSystemTheme', value)"
    />

    <compound v-if="followSystemTheme">
      <template #head>
        <h6 class="title">
          {{ t('preferences.theme.modeThemes') }}
        </h6>
      </template>
      <template #children>
        <cur-select
          :description="t('preferences.theme.lightModeTheme')"
          :value="lightModeTheme"
          :options="themeOptions"
          :on-change="(value) => onSelectChange('lightModeTheme', value)"
        />

        <cur-select
          :description="t('preferences.theme.darkModeTheme')"
          :value="darkModeTheme"
          :options="themeOptions"
          :on-change="(value) => onSelectChange('darkModeTheme', value)"
        />
      </template>
    </compound>

    <div class="custom-css">
      <div class="description">
        {{ t('preferences.theme.customCss') }}
      </div>
      <textarea
        class="custom-css-input"
        rows="10"
        :value="customCss"
        @change="
          (event: Event) =>
            onSelectChange('customCss', (event.target as HTMLTextAreaElement).value)
        "
      />
    </div>
    <separator v-show="false" />
    <section
      v-show="false"
      class="import-themes ag-underdevelop"
    >
      <div>
        <span>{{ t('preferences.theme.openThemesFolder') }}</span>
        <el-button size="small">
          {{ t('preferences.theme.openFolder') }}
        </el-button>
      </div>

      <div>
        <span>{{ t('preferences.theme.importCustomThemes') }}</span>
        <el-button size="small">
          {{ t('preferences.theme.importTheme') }}
        </el-button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { usePreferencesStore } from '@/store/preferences'
import type { PreferencesState } from '@/store/preferences'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import themeMd from './theme.md?raw'
import { themes as configThemes } from './config'
import markdownToHtml from '@/util/markdownToHtml'
import Bool from '../common/bool/index.vue'
import CurSelect from '../common/select/index.vue'
import Separator from '../common/separator/index.vue'
import Compound from '../common/compound/index.vue'
import type { PrefSelectOption } from '../common/types'

interface ThemePreview {
  name: string
  html: string
}

const themes = ref<ThemePreview[]>([])

const { t } = useI18n()
const preferenceStore = usePreferencesStore()

const { followSystemTheme, lightModeTheme, darkModeTheme, theme, customCss } =
  storeToRefs(preferenceStore)

// Generate dropdown options from configThemes
const themeOptions: PrefSelectOption<string>[] = configThemes.map((theme) => ({
  label: theme.name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' '),
  value: theme.name
}))

onMounted(async () => {
  const newThemes: ThemePreview[] = []
  for (const theme of configThemes) {
    const html = await markdownToHtml(themeMd.replace(/{theme}/, theme.name))
    newThemes.push({
      name: theme.name,
      html
    })
  }
  themes.value = newThemes
})

const onSelectChange = (type: keyof PreferencesState, value: unknown): void => {
  preferenceStore.SET_SINGLE_PREFERENCE({ type, value })
}
</script>

<style>
.official-themes {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
  margin-top: var(--space-3);
}

.official-themes .theme {
  box-sizing: border-box;
  width: 100%;
  height: 110px;
  margin: 0;
  padding: var(--space-4) 18px var(--space-4) 32px;
  overflow: hidden;
  cursor: pointer;
  color: var(--text-secondary);
  background: var(--surface-editor);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  transition:
    color var(--motion-fast) ease,
    background-color var(--motion-fast) ease,
    border-color var(--motion-fast) ease,
    opacity var(--motion-fast) ease;
}

.official-themes .theme:hover {
  background: var(--surface-hover);
  border-color: var(--border-default);
}

.official-themes .theme.light {
  color: #59636e;
  background: #fff;
}

.official-themes .theme.light a {
  color: #0b63e5;
}

.official-themes .theme.dark {
  color: #e8ebf0;
  background: #1b1d21;
}

.official-themes .theme.dark a {
  color: #5b9cff;
}

.official-themes .theme.paper {
  color: #6e665b;
  background: #fffdf8;
}

.official-themes .theme.paper a {
  color: #0b63e5;
}

.official-themes .theme.disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.official-themes .theme.disabled:hover {
  background: initial;
  border-color: var(--border-subtle);
}

.official-themes .theme.active {
  border-color: var(--color-accent);
  outline: 2px solid var(--color-accent-soft);
  outline-offset: -2px;
}

.official-themes .theme.disabled.active {
  opacity: 0.72;
}

.official-themes h3 {
  position: relative;
  margin: 0;
  color: currentColor;
  cursor: pointer;
  font-size: var(--font-ui-lg);
}

.official-themes h3::before {
  position: absolute;
  top: 4px;
  left: -20px;
  display: block;
  width: 10px;
  height: 10px;
  color: currentColor;
  content: 'h3';
  font-size: var(--font-ui-sm);
  opacity: 0.5;
}

.official-themes p {
  display: -webkit-box;
  margin: var(--space-1) 0 0;
  overflow: hidden;
  color: currentColor;
  font-size: var(--font-ui-sm);
  line-height: 1.5;
  text-overflow: ellipsis;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.custom-css {
  margin: var(--space-6) 0;
  color: var(--text-primary);
  font-size: var(--font-ui-lg);
}

.custom-css .description {
  margin-bottom: var(--space-2);
}

.custom-css .custom-css-input {
  box-sizing: border-box;
  width: 100%;
  padding: var(--space-2) 10px;
  resize: vertical;
  color: var(--text-primary);
  background: var(--surface-editor);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  font-family: 'DejaVu Sans Mono', 'Source Code Pro', 'Droid Sans Mono', Consolas, monospace;
  font-size: var(--font-ui-sm);
  line-height: 1.5;
  transition:
    border-color var(--motion-fast) ease,
    background-color var(--motion-fast) ease;
}

.custom-css .custom-css-input:focus {
  outline: none;
  border-color: var(--border-focus);
  box-shadow: var(--focus-ring);
}

.import-themes {
  display: flex;
  justify-content: space-around;
  padding: 10px 0;
  color: var(--text-secondary);
}

.import-themes > div {
  display: flex;
  flex-direction: column;
}

.import-themes > div > span {
  display: inline-block;
  margin-bottom: var(--space-6);
}
</style>
