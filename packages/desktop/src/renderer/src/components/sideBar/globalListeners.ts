export interface SidebarGlobalListenerHandlers {
  click: (event: Event) => void
  contextmenu: (event: Event) => void
  keydown: (event: Event) => void
}

export interface SidebarGlobalListenerTarget {
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void
  removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void
}

/**
 * Attach the sidebar's document-level interaction handlers as one owned unit.
 * The returned cleanup is idempotent so a sidebar remount can never multiply
 * global listeners or retain a closed component through an old closure.
 */
export const attachSidebarGlobalListeners = (
  target: SidebarGlobalListenerTarget,
  handlers: SidebarGlobalListenerHandlers
): (() => void) => {
  const registrations: Array<[string, EventListener]> = [
    ['click', handlers.click as EventListener],
    ['contextmenu', handlers.contextmenu as EventListener],
    ['keydown', handlers.keydown as EventListener]
  ]

  for (const [type, listener] of registrations) {
    target.addEventListener(type, listener)
  }

  let attached = true
  return () => {
    if (!attached) return
    attached = false
    for (const [type, listener] of registrations) {
      target.removeEventListener(type, listener)
    }
  }
}
