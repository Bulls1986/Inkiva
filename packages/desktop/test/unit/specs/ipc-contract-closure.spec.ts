import { describe, expect, it } from 'vitest'
import type { IpcInvokeChannels, IpcSendChannels } from '@shared/types/ipc'

describe('IPC contract closure', () => {
  it('keeps search requests structurally typed', () => {
    type Args = IpcInvokeChannels['mt::rg::start']['args']

    const valid: Args = [
      {
        searchId: 'search-1',
        mode: 'text',
        directories: ['/workspace'],
        pattern: 'needle',
        options: { isCaseSensitive: true }
      }
    ]

    const invalidMode: Args = [
      {
        searchId: 'search-1',
        // @ts-expect-error invalid search mode must be rejected by the shared IPC contract
        mode: 'invalid',
        directories: ['/workspace'],
        pattern: 'needle',
        options: {}
      }
    ]

    expect(valid[0]).toMatchObject({ mode: 'text', pattern: 'needle' })
    expect(invalidMode).toBeDefined()
  })

  it('keeps preference patches object-shaped', () => {
    type Args = IpcSendChannels['mt::set-user-preference']

    const valid: Args = [{ theme: 'light' }]

    // @ts-expect-error primitive preference payloads must not cross the IPC boundary
    const invalid: Args = ['theme']

    expect(valid[0]).toEqual({ theme: 'light' })
    expect(invalid).toBeDefined()
  })

  it('exposes an acknowledged preference mutation contract for Settings', () => {
    type Contract = IpcInvokeChannels['mt::preferences::set']
    type Args = Contract['args']
    type Result = Contract['ret']

    const valid: Args = [{ autoSaveDelay: 6200 }]
    const success: Result = { ok: true, applied: { autoSaveDelay: 6200 } }
    const failure: Result = { ok: false, error: 'Preference could not be saved' }

    expect(valid[0]).toEqual({ autoSaveDelay: 6200 })
    expect(success.ok).toBe(true)
    expect(failure.ok).toBe(false)
  })

  it('keeps open-file options object-shaped', () => {
    type Args = IpcSendChannels['mt::open-file-by-window-id']

    const valid: Args = [1, '/workspace/readme.md', { selected: true }]

    // @ts-expect-error numeric options are not a valid open-file contract
    const invalid: Args = [1, '/workspace/readme.md', 42]

    expect(valid[1]).toContain('readme.md')
    expect(invalid).toBeDefined()
  })

  it('keeps save-tab payloads structurally typed', () => {
    type Args = IpcSendChannels['mt::save-tabs']

    const valid: Args = [[{
      id: 'tab-1',
      filename: 'readme.md',
      markdown: '# Inkiva',
      options: {},
      defaultPath: '/workspace'
    }]]

    // @ts-expect-error save payload entries must be UnsavedFile objects
    const invalid: Args = [['not-a-tab']]

    expect(valid[0][0]).toMatchObject({ id: 'tab-1', filename: 'readme.md' })
    expect(invalid).toBeDefined()
  })

  it('keeps buffered state structurally typed', () => {
    type Args = IpcInvokeChannels['update-buffer-state']['args']

    const valid: Args = [{ editor: { tabs: [] }, project: {}, layout: {} }]

    // @ts-expect-error buffered state must be an object snapshot
    const invalid: Args = ['not-a-buffered-state']

    expect(valid[0]).toBeTypeOf('object')
    expect(invalid).toBeDefined()
  })

  it('removes the legacy renderer window-add-file-path channel', () => {
    type SendChannel = keyof IpcSendChannels

    // @ts-expect-error the HACK renderer channel must not remain in the public renderer IPC contract
    const legacyChannel: SendChannel = 'mt::window-add-file-path'

    expect(legacyChannel).toBe('mt::window-add-file-path')
  })
})
