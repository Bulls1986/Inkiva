import { ref } from 'vue'
import { defineStore } from 'pinia'
import log from 'electron-log'
import bus from '../bus'
import { installCommandCenterRuntimeListeners } from './commandCenterRuntime'
import type { CommandCenterRuntimeBus } from './commandCenterRuntime'
import { isOsx } from '@/util'
import { acceleratorToTokens } from '@/util/accelerator'

import staticCommands, {
  RootCommand,
  getCommandsWithDescriptions,
  type CommandDescriptor
} from '../commands'

type Command = CommandDescriptor
type Root = { subcommands: Command[] }

const staticCommandIds = new Set(staticCommands.map((command) => command.id))
const knownRuntimeCommandIds = new Set(['file.quick-open'])

const mergeDescribedCommands = (root: Root, describedCommands: Command[]): void => {
  // Commands such as Quick Open are registered after the renderer has
  // mounted. Keep those instances alive while refreshing translated static
  // descriptions; replacing them would discard their search index and
  // cancellation state.
  const runtimeCommands = root.subcommands.filter((command) =>
    knownRuntimeCommandIds.has(command.id) || !staticCommandIds.has(command.id))
  const commandsById = new Map<string, Command>()

  for (const command of describedCommands) {
    commandsById.set(command.id, command)
  }
  for (const command of runtimeCommands) {
    commandsById.set(command.id, command)
  }

  root.subcommands = Array.from(commandsById.values())
}

export const useCommandCenterStore = defineStore('commandCenter', () => {
  const rootCommand = ref<Root>(
    new RootCommand(staticCommands as unknown as CommandDescriptor[]) as Root
  )

  function REGISTER_COMMAND(command: Command): void {
    const existingIndex = rootCommand.value.subcommands.findIndex((item) => item.id === command.id)
    if (existingIndex >= 0) {
      rootCommand.value.subcommands.splice(existingIndex, 1, command)
      return
    }
    rootCommand.value.subcommands.push(command)
  }

  function SORT_COMMANDS(): void {
    rootCommand.value.subcommands.sort((a, b) =>
      (a.description ?? '').localeCompare(b.description ?? '')
    )
  }

  async function LISTEN_COMMAND_CENTER_BUS(): Promise<void> {
    let descriptionsRefreshId = 0

    const refreshCommands = async(): Promise<void> => {
      const refreshId = ++descriptionsRefreshId
      const describedCommands = await getCommandsWithDescriptions()
      if (refreshId !== descriptionsRefreshId) return

      mergeDescribedCommands(rootCommand.value, describedCommands)
      SORT_COMMANDS()
    }

    // Install every runtime listener before the translated command catalogue is
    // awaited. Cold startup may emit Quick Open registration during this await.
    bus.on('language-changed', async() => {
      await refreshCommands()
    })

    installCommandCenterRuntimeListeners(
      bus as unknown as CommandCenterRuntimeBus,
      {
        register: (command) => REGISTER_COMMAND(command as Command),
        sort: SORT_COMMANDS,
        execute: (commandId) => executeCommand(rootCommand.value, String(commandId))
      }
    )

    window.electron.ipcRenderer.on('mt::keybindings-response', (_e, keybindingMap) => {
      const map = keybindingMap as Record<string, string>
      const { subcommands } = rootCommand.value
      for (const entry of subcommands) {
        const value = map[entry.id]
        if (value) {
          entry.shortcut = normalizeAccelerator(value)
        }
      }
    })

    window.electron.ipcRenderer.on('mt::execute-command-by-id', (_e, commandId) => {
      executeCommand(rootCommand.value, String(commandId))
    })

    await refreshCommands()
  }

  return {
    rootCommand,
    REGISTER_COMMAND,
    SORT_COMMANDS,
    LISTEN_COMMAND_CENTER_BUS
  }
})

const executeCommand = (root: Root, commandId: string): void => {
  const { subcommands } = root
  const command = subcommands.find((c) => c.id === commandId)
  if (!command) {
    const errorMsg = `Cannot execute command "${commandId}" because it's missing.`
    log.error(errorMsg)
    throw new Error(errorMsg)
  }
  command.execute?.()
}

const normalizeAccelerator = (acc: string): string[] => {
  try {
    return acceleratorToTokens(acc, isOsx)
  } catch {
    return [acc]
  }
}
