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
        role="button"
        tabindex="0"
        :aria-label="themeLabel(themeItem.name)"
        :aria-pressed="themeItem.name === theme"
        :aria-disabled="followSystemTheme ? 'true' : undefined"
        @click="!followSystemTheme && commitTheme(themeItem.name)"
        @keydown="handleThemeKeydown($event, themeItem.name)"
      >
        <div class="theme-preview-label">
          {{ themeLabel(themeItem.name) }}
        </div>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div
          class="theme-preview-content"
          v-html="themeItem.html"
        />
      </div>
    </section>
    <separator />
    <preference-status
      :error="themeMutationError"
      :on-retry="retryTheme"
    />

    <Bool
      :description="t('preferences.theme.followSystemTheme')"
      :bool="followSystemTheme"
      :on-change="(value) => onSelectChange('followSystemTheme', value)"
    />

    <div class="custom-css">
      <label
        class="description"
        for="custom-css-input"
      >
        {{ t('preferences.theme.customCss') }}
      </label>
      <div class="custom-css-notes">
        {{ t('preferences.theme.customCssNotes') }}
      </div>
      <textarea
        id="custom-css-input"
        class="custom-css-input"
        rows="14"
        spellcheck="false"
        autocomplete="off"
        :aria-label="t('preferences.theme.customCss')"
        placeholder=":root {\n  --color-accent: #0B63E5;\n}"
        :value="customCss"
        @change="
          (event: Event) => commitCustomCss((event.target as HTMLTextAreaElement).value)
        "
      />
    </div>
    <separator v-show="false" />
      <preference-status
        :error="customCssMutationError"
        :on-retry="retryCustomCss"
      />
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
import Separator from '../common/separator/index.vue'
import PreferenceStatus from '../common/preferenceStatus.vue'
import { usePreferenceMutation } from '../common/usePreferenceMutation'

interface ThemePreview {
  name: string
  html: string
}

const themes = ref<ThemePreview[]>([])

const { t } = useI18n()
const preferenceStore = usePreferencesStore()
const {
  error: themeMutationError,
  commit: commitTheme,
  retry: retryTheme
} = usePreferenceMutation<string>(() => (value) =>
  preferenceStore.SET_SINGLE_PREFERENCE({ type: 'theme', value })
)
const {
  error: customCssMutationError,
  commit: commitCustomCss,
  retry: retryCustomCss
} = usePreferenceMutation<string>(() => (value) =>
  preferenceStore.SET_SINGLE_PREFERENCE({ type: 'customCss', value })
)

const { followSystemTheme, theme, customCss } = storeToRefs(preferenceStore)

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

const onSelectChange = (type: keyof PreferencesState, value: unknown) =>
  preferenceStore.SET_SINGLE_PREFERENCE({ type, value })

const themeLabel = (name: string): string => t(`preferences.theme.options.${name}`)

const handleThemeKeydown = (event: KeyboardEvent, name: string): void => {
  if (event.target !== event.currentTarget) return
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  if (!followSystemTheme.value) commitTheme(name)
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
  padding: var(--space-4) 18px var(--space-4) 28px;
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
  border-color: var(--border-default);
}

.official-themes .theme:focus-visible {
  outline: 2px solid var(--color-accent-focus);
  outline-offset: -2px;
}

.official-themes .theme.light {
  color: #59636e;
  background: #fff;
}

.official-themes .theme.light :is(h1, h2, h3, h4, h5, h6) {
  color: #1f2329;
}

.official-themes .theme.light a {
  color: #0b63e5;
}

.official-themes .theme.dark {
  color: #e8ebf0;
  background: #1b1d21;
}

.official-themes .theme.dark :is(h1, h2, h3, h4, h5, h6) {
  color: #e8ebf0;
}

.official-themes .theme.dark a {
  color: #5b9cff;
}

.official-themes .theme.paper {
  color: #666a70;
  background: #f8f8f6;
}

.official-themes .theme.paper :is(h1, h2, h3, h4, h5, h6) {
  color: #303236;
}

.official-themes .theme.paper a {
  color: #0b63e5;
}

.official-themes .theme.disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.official-themes .theme.disabled:hover {
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

.theme-preview-label {
  margin-bottom: var(--space-2);
  color: currentColor;
  font-size: var(--font-size-secondary);
  font-weight: var(--font-weight-medium);
  line-height: 18px;
}

.theme-preview-content {
  min-width: 0;
}

.theme-preview-content h1,
.theme-preview-content h3 {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.official-themes h3::before {
  position: absolute;
  top: 50%;
  left: -14px;
  display: block;
  width: 4px;
  height: 4px;
  color: currentColor;
  content: '';
  background: currentColor;
  border-radius: 50%;
  transform: translateY(-50%);
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
  display: block;
  margin-bottom: var(--space-2);
}

.custom-css .custom-css-notes {
  margin: 0 0 var(--space-2);
  color: var(--text-tertiary);
  font-size: var(--font-ui-sm);
  line-height: 1.5;
}

.custom-css .custom-css-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 220px;
  padding: 10px 12px;
  resize: vertical;
  color: var(--text-primary);
  background: var(--surface-editor);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  font-family: 'DejaVu Sans Mono', 'Source Code Pro', 'Droid Sans Mono', Consolas, monospace;
  font-size: var(--font-ui-sm);
  line-height: 1.5;
  transition:
    border-color var(--motion-fast) ease,
    background-color var(--motion-fast) ease;
}

.custom-css .custom-css-input:focus {
  border-color: var(--border-focus);
  outline: none;
  box-shadow: 0 0 0 1px var(--border-focus) inset;
}

.custom-css .custom-css-input:focus-visible {
  outline: none;
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
