// Keep the artificial startup gap outside the application module. The module
// loader waits for this top-level await before the document finishes loading,
// so the main process cannot send the editor bootstrap event before Vue has
// registered its IPC listeners.
const startupDelay = Number(
  window.electron?.process?.env?.INKIVA_E2E_RENDERER_STARTUP_DELAY_MS ?? 0
)
const shouldDelay =
  window.electron?.process?.env?.PERF_TESTING === 'true' &&
  Number.isFinite(startupDelay) &&
  startupDelay > 0

if (shouldDelay) {
  await new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, startupDelay)
  })
}

await import('./main')

export {}
