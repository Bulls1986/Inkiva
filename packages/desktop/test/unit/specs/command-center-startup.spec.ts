import { describe, expect, it } from 'vitest'

import { installCommandCenterRuntimeListeners } from '@/store/commandCenterRuntime'

describe('command center startup listeners', () => {
  it('registers runtime command listeners before asynchronous command refresh', () => {
    const listeners = new Map<string, (payload?: unknown) => void>()
    const bus = {
      on(event: string, listener: (payload?: unknown) => void): void {
        listeners.set(event, listener)
      }
    }
    const registered: unknown[] = []
    let sorted = 0
    const executed: unknown[] = []

    installCommandCenterRuntimeListeners(bus, {
      register: (command) => registered.push(command),
      sort: () => {
        sorted += 1
      },
      execute: (commandId) => executed.push(commandId)
    })

    listeners.get('cmd::register-command')?.({ id: 'file.quick-open' })
    listeners.get('cmd::sort-commands')?.()
    listeners.get('cmd::execute')?.('file.quick-open')

    expect(registered).toEqual([{ id: 'file.quick-open' }])
    expect(sorted).toBe(1)
    expect(executed).toEqual(['file.quick-open'])
  })
})
