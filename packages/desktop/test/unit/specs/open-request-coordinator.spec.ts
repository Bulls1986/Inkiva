import { describe, expect, it } from 'vitest'
import {
  OpenRequestCoordinator,
  type OpenRequest
} from 'main_renderer/session/openRequestCoordinator'

const request = (source: string, paths: string[], newWindow = false): OpenRequest => ({
  source,
  newWindow,
  paths: paths.map((path) => ({ path, isDir: false }))
})

describe('OpenRequestCoordinator', () => {
  it('coalesces canonical duplicates while requests wait for restore', () => {
    const dispatched: OpenRequest[] = []
    const coordinator = new OpenRequestCoordinator({
      platform: 'win32',
      dispatch: (next) => dispatched.push(next)
    })

    coordinator.enqueue(request('argv', ['C:\\Docs\\A.md']))
    coordinator.enqueue(request('open-file', ['c:/docs/a.md', 'C:/Docs/B.md']))

    expect(coordinator.getPhase()).toBe('booting')
    expect(coordinator.getPendingRequestCount()).toBe(2)

    coordinator.beginRestore()
    expect(dispatched).toHaveLength(0)

    coordinator.completeRestore()

    expect(dispatched).toHaveLength(2)
    expect(dispatched.flatMap(({ paths }) => paths.map(({ path }) => path))).toEqual([
      'C:\\Docs\\A.md',
      'C:/Docs/B.md'
    ])
  })

  it('keeps requests arriving during restore queued and preserves new-window intent', () => {
    const dispatched: OpenRequest[] = []
    const coordinator = new OpenRequestCoordinator({
      dispatch: (next) => dispatched.push(next)
    })

    coordinator.beginRestore()
    coordinator.enqueue(request('second-instance', ['/tmp/one.md', '/tmp/two.md'], true))

    expect(coordinator.getPhase()).toBe('restoring')
    expect(coordinator.getPendingRequestCount()).toBe(1)
    expect(dispatched).toHaveLength(0)

    coordinator.completeRestore()

    expect(coordinator.getPhase()).toBe('ready')
    expect(dispatched).toEqual([request('second-instance', ['/tmp/one.md', '/tmp/two.md'], true)])
  })
})
