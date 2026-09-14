import { describe, expect, it, vi } from 'vitest'
import { routeStartupOpenRequest } from 'main_renderer/session/startupOpenTarget'

describe('startup open target', () => {
  it('routes the first explicit startup request into the existing shell', () => {
    const target = {
      openFolder: vi.fn(),
      openTabsFromPaths: vi.fn()
    }

    routeStartupOpenRequest(target, {
      source: 'argv',
      newWindow: true,
      paths: [
        { isDir: false, path: '/docs/first.md' },
        { isDir: false, path: '/docs/second.md' },
        { isDir: true, path: '/docs' }
      ]
    })

    expect(target.openFolder).toHaveBeenCalledWith('/docs')
    expect(target.openTabsFromPaths).toHaveBeenCalledWith([
      '/docs/first.md',
      '/docs/second.md'
    ])
  })

  it('does not create an extra target for a directory-only request', () => {
    const target = {
      openFolder: vi.fn(),
      openTabsFromPaths: vi.fn()
    }

    routeStartupOpenRequest(target, {
      source: 'startup-preference',
      newWindow: false,
      paths: [{ isDir: true, path: '/workspace' }]
    })

    expect(target.openFolder).toHaveBeenCalledOnce()
    expect(target.openTabsFromPaths).not.toHaveBeenCalled()
  })
})
