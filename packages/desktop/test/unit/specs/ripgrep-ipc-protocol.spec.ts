import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (...args: unknown[]) => unknown

const { handlers, listeners, spawn } = vi.hoisted(() => ({
  handlers: new Map<string, IpcHandler>(),
  listeners: new Map<string, IpcHandler>(),
  spawn: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: IpcHandler) => handlers.set(channel, listener),
    on: (channel: string, listener: IpcHandler) => listeners.set(channel, listener)
  }
}))
vi.mock('child_process', () => ({ default: { spawn }, spawn }))
vi.mock('@vscode/ripgrep', () => ({ rgPath: '/fake/rg' }))
vi.mock('electron-log', () => ({ default: { warn: vi.fn() } }))

const { registerRipgrepHandlers } = await import('main_renderer/ipc/ripgrep')

class FakeReadable extends EventEmitter {
  paused = false
  pending: Array<Buffer | string> = []
  pause = vi.fn(() => {
    this.paused = true
  })

  destroy = vi.fn(() => {
    this.paused = true
    this.pending.splice(0, this.pending.length)
  })

  resume = vi.fn(() => {
    this.paused = false
    const pending = this.pending.splice(0, this.pending.length)
    for (const chunk of pending) {
      if (this.paused) {
        this.pending.push(chunk)
        break
      }
      this.emit('data', chunk)
    }
  })

  pushData(chunk: string): void {
    if (this.paused) this.pending.push(chunk)
    else this.emit('data', chunk)
  }
}

class FakeChild extends EventEmitter {
  stdout = new FakeReadable()
  stderr = new FakeReadable()
  kill = vi.fn()
}

class FakeSender extends EventEmitter {
  destroyed = false
  messages: Array<{ channel: string; args: unknown[] }> = []
  isDestroyed = vi.fn(() => this.destroyed)
  send = vi.fn((channel: string, ...args: unknown[]) => {
    this.messages.push({ channel, args })
  })
}

const textResult = (filePath: string): string =>
  [
    JSON.stringify({ type: 'begin', data: { path: { text: filePath } } }),
    JSON.stringify({
      type: 'match',
      data: {
        lines: { text: 'needle\n' },
        submatches: [{ start: 0, end: 6, match: { text: 'needle' } }],
        line_number: 1,
        path: { text: filePath }
      }
    }),
    JSON.stringify({ type: 'end', data: { path: { text: filePath } } })
  ].join('\n') + '\n'

const textResultWithMatches = (filePath: string, matchCount: number): string =>
  [
    JSON.stringify({ type: 'begin', data: { path: { text: filePath } } }),
    JSON.stringify({
      type: 'match',
      data: {
        lines: { text: 'needle\n' },
        submatches: Array.from({ length: matchCount }, (_, index) => ({
          start: 0,
          end: 6,
          match: { text: `needle-${index}` }
        })),
        line_number: 1,
        path: { text: filePath }
      }
    }),
    JSON.stringify({ type: 'end', data: { path: { text: filePath } } })
  ].join('\n') + '\n'

const getHandler = (channel: string): IpcHandler => {
  const handler = handlers.get(channel)
  if (!handler) throw new Error(`Missing IPC handler: ${channel}`)
  return handler
}

const matchEnvelopes = (
  sender: FakeSender
): Array<{ searchId: string; batchId: number; payload: unknown }> =>
  sender.messages
    .filter(({ channel }) => channel === 'mt::rg::match')
    .map(({ args }) => args[0] as { searchId: string; batchId: number; payload: unknown })

describe('main ripgrep IPC backpressure protocol', () => {
  beforeEach(() => {
    handlers.clear()
    listeners.clear()
    spawn.mockReset()
    registerRipgrepHandlers()
  })

  it('pauses the source at the batch bound, resumes on ACK, and preserves every batch', async() => {
    const sender = new FakeSender()
    const child = new FakeChild()
    spawn.mockReturnValue(child)
    const searchId = 'ipc-backpressure'

    await getHandler('mt::rg::start')(
      { sender },
      {
        searchId,
        mode: 'text',
        directories: ['/workspace'],
        pattern: 'needle',
        options: {}
      }
    )

    child.stdout.pushData(
      Array.from({ length: 5 }, (_, index) => textResult(`/workspace/file-${index + 1}.md`)).join('')
    )

    const initial = matchEnvelopes(sender)
    expect(initial).toHaveLength(2)
    expect(child.stdout.pause).toHaveBeenCalled()
    child.stdout.emit('end')
    child.emit('close', 0)
    expect(sender.messages.filter(({ channel }) => channel === 'mt::rg::done')).toHaveLength(0)

    const ack = listeners.get('mt::rg::ack')
    if (!ack) throw new Error('Missing IPC handler: mt::rg::ack')
    ack({ sender }, searchId, 999)
    ack({ sender: new FakeSender() }, searchId, initial[0]?.batchId)
    expect(matchEnvelopes(sender)).toHaveLength(2)

    for (let index = 0; index < 5; index++) {
      const batch = matchEnvelopes(sender)[index]
      if (batch) ack({ sender }, searchId, batch.batchId)
    }

    const all = matchEnvelopes(sender)
    expect(all).toHaveLength(5)
    expect(all.map(({ batchId }) => batchId)).toEqual([1, 2, 3, 4, 5])
    expect(all.map(({ payload }) => (payload as { filePath: string }).filePath)).toEqual([
      '/workspace/file-1.md',
      '/workspace/file-2.md',
      '/workspace/file-3.md',
      '/workspace/file-4.md',
      '/workspace/file-5.md'
    ])
    expect(child.stdout.resume).toHaveBeenCalled()

    expect(sender.messages.filter(({ channel }) => channel === 'mt::rg::done')).toHaveLength(1)
  })

  it('keeps batches from multiple directories independent while sharing the bound', async() => {
    const sender = new FakeSender()
    const children = [new FakeChild(), new FakeChild()]
    spawn.mockImplementation(() => children.shift())
    const searchId = 'ipc-multiple-directories'

    await getHandler('mt::rg::start')(
      { sender },
      {
        searchId,
        mode: 'text',
        directories: ['/workspace/one', '/workspace/two'],
        pattern: 'needle',
        options: {}
      }
    )

    // `spawn` consumed both children; retain them through the mock results so
    // each independent source can be fed below.
    const spawnedChildren = (spawn.mock.results as Array<{ value: FakeChild }>).map(
      ({ value }) => value
    )
    for (let index = 1; index <= 3; index++) {
      spawnedChildren[0]?.stdout.pushData(textResult(`/workspace/one/file-${index}.md`))
      spawnedChildren[1]?.stdout.pushData(textResult(`/workspace/two/file-${index}.md`))
    }

    expect(matchEnvelopes(sender)).toHaveLength(2)
    for (const child of spawnedChildren) child.stdout.emit('end')
    for (const child of spawnedChildren) child.emit('close', 0)
    expect(sender.messages.filter(({ channel }) => channel === 'mt::rg::done')).toHaveLength(0)
    const ack = listeners.get('mt::rg::ack')
    if (!ack) throw new Error('Missing IPC handler: mt::rg::ack')
    for (let index = 0; index < 6; index++) {
      const batch = matchEnvelopes(sender)[index]
      if (batch) ack({ sender }, searchId, batch.batchId)
    }

    const paths = matchEnvelopes(sender).map(
      ({ payload }) => (payload as { filePath: string }).filePath
    )
    expect(paths).toHaveLength(6)
    expect(new Set(paths)).toEqual(
      new Set([
        '/workspace/one/file-1.md',
        '/workspace/one/file-2.md',
        '/workspace/one/file-3.md',
        '/workspace/two/file-1.md',
        '/workspace/two/file-2.md',
        '/workspace/two/file-3.md'
      ])
    )
    expect(sender.messages.filter(({ channel }) => channel === 'mt::rg::done')).toHaveLength(1)
  })

  it('keeps text batches at or below 128 matches across queued output', async() => {
    const sender = new FakeSender()
    const child = new FakeChild()
    spawn.mockReturnValue(child)
    const searchId = 'ipc-text-batches'

    await getHandler('mt::rg::start')(
      { sender },
      { searchId, mode: 'text', directories: ['/workspace'], pattern: 'needle', options: {} }
    )
    child.stdout.pushData(textResultWithMatches('/workspace/many.md', 300))
    child.stdout.emit('end')
    child.emit('close', 0)

    const ack = listeners.get('mt::rg::ack')
    if (!ack) throw new Error('Missing IPC handler: mt::rg::ack')
    let ackIndex = 0
    while (ackIndex < matchEnvelopes(sender).length) {
      const batch = matchEnvelopes(sender)[ackIndex]
      if (batch) ack({ sender }, searchId, batch.batchId)
      ackIndex++
    }

    const matches = matchEnvelopes(sender).flatMap(
      ({ payload }) => (payload as { matches: Array<{ matchText: string }> }).matches
    )
    expect(matchEnvelopes(sender).map(({ payload }) => (payload as { matches: unknown[] }).matches.length)).toEqual([
      128,
      128,
      44
    ])
    expect(matches).toHaveLength(300)
    expect(matches.map(({ matchText }) => matchText)).toEqual(
      Array.from({ length: 300 }, (_, index) => `needle-${index}`)
    )
    expect(sender.messages.filter(({ channel }) => channel === 'mt::rg::done')).toHaveLength(1)
  })

  it('keeps file batches at or below 64 paths while draining queued output', async() => {
    const sender = new FakeSender()
    const child = new FakeChild()
    spawn.mockReturnValue(child)
    const searchId = 'ipc-file-batches'
    const expectedPaths = Array.from({ length: 258 }, (_, index) => `/workspace/file-${index}.md`)

    await getHandler('mt::rg::start')(
      { sender },
      { searchId, mode: 'files', directories: ['/workspace'], pattern: '', options: {} }
    )
    child.stdout.pushData(expectedPaths.join('\n') + '\n')
    child.stdout.emit('end')
    child.emit('close', 0)

    const initial = matchEnvelopes(sender)
    expect(initial).toHaveLength(2)
    expect(child.stdout.pause).toHaveBeenCalled()
    const ack = listeners.get('mt::rg::ack')
    if (!ack) throw new Error('Missing IPC handler: mt::rg::ack')
    let ackIndex = 0
    while (ackIndex < matchEnvelopes(sender).length) {
      const batch = matchEnvelopes(sender)[ackIndex]
      if (batch) ack({ sender }, searchId, batch.batchId)
      ackIndex++
    }

    const batches = matchEnvelopes(sender).map(({ payload }) => payload as string[])
    expect(batches.map((batch) => batch.length)).toEqual([64, 64, 64, 64, 2])
    expect(batches.flat()).toEqual(expectedPaths)
    expect(sender.messages.filter(({ channel }) => channel === 'mt::rg::done')).toHaveLength(1)
  })

  it('cancels the child and drops queued batches', async() => {
    const sender = new FakeSender()
    const child = new FakeChild()
    spawn.mockReturnValue(child)
    const searchId = 'ipc-cancel'

    await getHandler('mt::rg::start')(
      { sender },
      { searchId, mode: 'text', directories: ['/workspace'], pattern: 'needle', options: {} }
    )
    for (let index = 1; index <= 4; index++) { child.stdout.pushData(textResult(`/workspace/file-${index}.md`)) }

    const beforeCancel = matchEnvelopes(sender).length
    const cancel = listeners.get('mt::rg::cancel')
    if (!cancel) throw new Error('Missing IPC handler: mt::rg::cancel')
    cancel({ sender }, searchId)

    expect(child.stdout.pause).toHaveBeenCalled()
    expect(child.stdout.destroy).toHaveBeenCalled()
    expect(child.stderr.destroy).toHaveBeenCalled()
    expect(child.kill).toHaveBeenCalled()
    expect(sender.messages.some(({ channel }) => channel === 'mt::rg::cancelled')).toBe(true)

    child.stdout.pushData(textResult('/workspace/late.md'))
    const ack = listeners.get('mt::rg::ack')
    if (!ack) throw new Error('Missing IPC handler: mt::rg::ack')
    ack({ sender }, searchId, 1)
    expect(matchEnvelopes(sender)).toHaveLength(beforeCancel)
  })

  it('cancels active work when the sender is destroyed', async() => {
    const sender = new FakeSender()
    const child = new FakeChild()
    spawn.mockReturnValue(child)
    const searchId = 'ipc-destroyed'

    await getHandler('mt::rg::start')(
      { sender },
      { searchId, mode: 'text', directories: ['/workspace'], pattern: 'needle', options: {} }
    )
    child.stdout.pushData(textResult('/workspace/file-1.md'))

    sender.destroyed = true
    sender.emit('destroyed')
    child.stdout.pushData(textResult('/workspace/late.md'))

    expect(child.kill).toHaveBeenCalled()
    expect(sender.messages.filter(({ channel }) => channel === 'mt::rg::match')).toHaveLength(1)
  })

  it('releases the sender destroyed listener after a search completes', async() => {
    const sender = new FakeSender()
    const child = new FakeChild()
    spawn.mockReturnValue(child)

    await getHandler('mt::rg::start')(
      { sender },
      {
        searchId: 'ipc-listener-lifecycle',
        mode: 'text',
        directories: ['/workspace'],
        pattern: 'needle',
        options: {}
      }
    )

    expect(sender.listenerCount('destroyed')).toBe(1)

    child.stdout.emit('end')
    child.emit('close', 0)

    expect(sender.messages.filter(({ channel }) => channel === 'mt::rg::done')).toHaveLength(1)
    expect(sender.listenerCount('destroyed')).toBe(0)
  })
})
