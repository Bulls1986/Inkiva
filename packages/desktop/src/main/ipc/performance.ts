import { ipcMain } from 'electron'
import { PERFORMANCE_EVENT_CHANNEL } from '@shared/types/performance'
import { mainPerformance } from '../performance/runtime'

/**
 * Renderer diagnostics are untrusted IPC input. The coordinator performs the
 * schema, trace ownership, and bounded-event checks; this handler must remain
 * a non-throwing boundary so malformed diagnostics cannot crash the app.
 */
export const registerPerformanceHandlers = (): void => {
  ipcMain.on(PERFORMANCE_EVENT_CHANNEL, (_event, event: unknown) => {
    try {
      mainPerformance.recordRendererEvent(event)
    } catch {
      // Performance diagnostics are best-effort and must never affect editing.
    }
  })
}
