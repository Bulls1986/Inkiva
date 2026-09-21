import { createApp, type App } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import bootstrapRenderer from './bootstrap'
import axios from './axios'
import pinia from './store'
import './assets/symbolIcon'

// Element Plus instead of Element UI for Vue 3
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import en from 'element-plus/es/locale/lang/en'

// I18n translation system
import i18nPlugin from './i18n'
import { rendererPerformance } from './services/performance/runtime'

// something is wrong here! \/
import services from './services/index'
import routes from './router'
import Main from './Main.vue'

import './assets/styles/index.css'
import './assets/styles/printService.css'

// -----------------------------------------------

window.inkiva = {}
rendererPerformance.mark('renderer_bootstrap_start', { phase: 'startup' })
bootstrapRenderer()

// -----------------------------------------------
// Be careful when changing code before this line!

// Create Vue app
const app: App<Element> = createApp(Main)

// Configure Element Plus with locale
app.use(ElementPlus, {
  locale: en
})

const envType = window.inkiva?.env?.type as string | undefined

const router = createRouter({
  history: createWebHashHistory(),
  // it seems like something might have changed in vue-router? it uses the full "file path" instead of
  // links like /editor if we use the old createWebHistory()
  routes: routes(envType)
})

app.use(router)
app.use(pinia)
app.use(i18nPlugin)

// Configure axios globally
app.config.globalProperties.$http = axios

// Register services globally
;(services as unknown as Array<Record<string, unknown> & { name: string }>).forEach((s) => {
  app.config.globalProperties['$' + s.name] = s[s.name]
})

const mountApp = (): void => {
  app.mount('#app')
  rendererPerformance.mark('app_shell_mounted', { phase: 'startup' })
}

// Keep a deterministic gap between the inline shell and Vue mounting for the
// startup E2E test. The variable is only exposed through the test environment.
const startupDelay = Number(
  window.electron?.process?.env?.INKIVA_E2E_RENDERER_STARTUP_DELAY_MS ?? 0
)
if (window.electron?.process?.env?.PERF_TESTING === 'true' && startupDelay > 0) {
  globalThis.setTimeout(mountApp, startupDelay)
} else {
  mountApp()
}

// Preferences remain route-lazy. Do not preload their dependency graph from the
// editor renderer: requestIdleCallback can fire between scroll frames and large
// settings dependencies (including diagram engines) must never compete with editing.
