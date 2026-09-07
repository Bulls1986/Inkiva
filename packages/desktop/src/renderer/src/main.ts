import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import i18n from './i18n'
import services from './services'
import '@/assets/styles/index.css'

const envType = window.marktext?.env?.type

const app = createApp({
  template: '<router-view />'
})

app.use(createPinia())
app.use(router)
app.use(i18n)

// Register services globally
;(services as unknown as Array<Record<string, unknown> & { name: string }>).forEach((s) => {
  app.config.globalProperties['$' + s.name] = s[s.name]
})

// Mount the app
app.mount('#app')

/**
 * Warm settings chunks only after the editor has mounted and the browser has
 * spare time. This keeps first paint focused on the editor while making the
 * first Preferences open substantially cheaper on slower machines.
 *
 * We intentionally preload modules, not a hidden BrowserWindow, so there is no
 * extra long-lived renderer process or duplicate Vue application consuming
 * memory in the background.
 */
const preloadSettingsWhenIdle = (): void => {
  if (envType !== 'editor') return

  const preload = (): void => {
    Promise.allSettled([
      import('./pages/preference.vue'),
      import('./prefComponents/general/index.vue'),
      import('./prefComponents/editor/index.vue'),
      import('./prefComponents/markdown/index.vue'),
      import('./prefComponents/spellchecker/index.vue'),
      import('./prefComponents/theme/index.vue'),
      import('./prefComponents/image/index.vue'),
      import('./prefComponents/keybindings/index.vue')
    ])
  }

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(preload, { timeout: 2500 })
  } else {
    globalThis.setTimeout(preload, 1200)
  }
}

preloadSettingsWhenIdle()
