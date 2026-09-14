export interface CommandCenterRuntimeBus {
  on(event: string, listener: (payload?: unknown) => void): void
}

export interface CommandCenterRuntimeHandlers {
  register: (command: unknown) => void
  sort: () => void
  execute: (commandId: unknown) => void
}

export function installCommandCenterRuntimeListeners(
  bus: CommandCenterRuntimeBus,
  handlers: CommandCenterRuntimeHandlers
): void {
  bus.on('cmd::register-command', handlers.register)
  bus.on('cmd::sort-commands', handlers.sort)
  bus.on('cmd::execute', handlers.execute)
}
