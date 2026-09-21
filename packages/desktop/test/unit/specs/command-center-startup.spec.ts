import mitt from 'mitt'
import { describe, expect, it } from 'vitest'

import { installCommandCenterRuntimeListeners } from '@/store/commandCenterRuntime'
import type { BusEvents } from '@shared/types/bus'

describe('command center startup listeners', () => {
  it('registers runtime command listeners before asynchronous command refresh', () => {
    const bus = mitt<BusEvents>()
    const registered: BusEvents['cmd::register-command'][] = []
    let sorted = 0
    const executed: BusEvents['cmd::execute'][] = []

    installCommandCenterRuntimeListeners(bus, {
      register: (command) => registered.push(command),
      sort: () => {
        sorted += 1
      },
      execute: (commandId) => executed.push(commandId)
    })

    bus.emit('cmd::register-command', { id: 'file.quick-open' })
    bus.emit('cmd::sort-commands')
    bus.emit('cmd::execute', 'file.quick-open')

    expect(registered).toEqual([{ id: 'file.quick-open' }])
    expect(sorted).toBe(1)
    expect(executed).toEqual(['file.quick-open'])
  })
})
