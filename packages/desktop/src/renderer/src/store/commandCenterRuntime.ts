import type { Emitter } from 'mitt'
import type { BusEvents } from '@shared/types/bus'

export type CommandCenterRuntimeBus = Pick<Emitter<BusEvents>, 'on'>

export interface CommandCenterRuntimeHandlers {
  register: (command: BusEvents['cmd::register-command']) => void
  sort: () => void
  execute: (commandId: BusEvents['cmd::execute']) => void
}

export function installCommandCenterRuntimeListeners(
  bus: CommandCenterRuntimeBus,
  handlers: CommandCenterRuntimeHandlers
): void {
  bus.on('cmd::register-command', handlers.register)
  bus.on('cmd::sort-commands', handlers.sort)
  bus.on('cmd::execute', handlers.execute)
}
