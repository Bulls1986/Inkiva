import { spawn, type ChildProcess } from 'child_process'
import path from 'path'
import { ipcMain, type WebContents } from 'electron'
import log from 'electron-log'
import { rgPath as bundledRgPath } from '@vscode/ripgrep'
import { BatchGate, type Batch } from './ripgrepBackpressure'
import type { RipgrepRequest, RipgrepSearchOptions } from '@shared/types/ipc'

const resolveRgPath = (): string => {
  if (process.env.INKIVA_RIPGREP_PATH) return process.env.INKIVA_RIPGREP_PATH
  return bundledRgPath.replace(/\bapp\.asar\b/, 'app.asar.unpacked')
}

interface ActiveSearch {
  sender: WebContents
  cancel: () => void
  ack: (batchId: number) => boolean
}

const activeSearches = new Map<string, ActiveSearch>()
const TEXT_MATCH_BATCH_SIZE = 128
const FILE_PATH_BATCH_SIZE = 64
const MAX_IN_FLIGHT_BATCHES = 2
const MAX_QUEUED_BATCHES = 2

const removeActiveSearch = (searchId: string, cancel: () => void): void => {
  const entry = activeSearches.get(searchId)
  if (entry?.cancel === cancel) activeSearches.delete(searchId)
}

const sendIfAlive = (
  sender: WebContents | null | undefined,
  channel: string,
  ...args: unknown[]
): boolean => {
  try {
    if (!sender || sender.isDestroyed()) return false
    sender.send(channel, ...args)
    return true
  } catch {
    /* sender destroyed mid-send */
    return false
  }
}

const terminateChild = (child: ChildProcess): void => {
  try { child.stdout?.pause() } catch { /* stream already closed */ }
  try { child.stdout?.destroy() } catch { /* stream already closed */ }
  try { child.stderr?.destroy() } catch { /* stream already closed */ }
  try { child.stdin?.destroy() } catch { /* stream already closed */ }
  try { child.kill() } catch { /* process already dead */ }
}

const cleanupAtSenderDestroy = (sender: WebContents | null | undefined): void => {
  if (!sender) return
  const handler = (): void => {
    for (const [id, entry] of activeSearches.entries()) {
      if (entry.sender === sender) {
        entry.cancel()
        removeActiveSearch(id, entry.cancel)
      }
    }
  }
  sender.once('destroyed', handler)
}

interface TextInput {
  text?: string
  bytes?: string
}

const getText = (input: TextInput): string =>
  'text' in input && input.text !== undefined
    ? input.text
    : Buffer.from(input.bytes ?? '', 'base64').toString()

const cleanResultLine = (lineText: TextInput): string => {
  const text = getText(lineText)
  return text[text.length - 1] === '\n' ? text.slice(0, -1) : text
}

const getPositionFromColumn = (lines: string[], column: number): [number, number] => {
  let currentLength = 0
  let currentLine = 0
  let previousLength = 0
  while (column >= currentLength) {
    previousLength = currentLength
    currentLength += lines[currentLine].length + 1
    currentLine++
  }
  return [currentLine - 1, column - previousLength]
}

interface RgSubmatch {
  start: number
  end: number
  match: TextInput
}

interface RgMatchData {
  lines: TextInput
  submatches: RgSubmatch[]
  line_number: number
  path: TextInput
}

interface RgMatch {
  matchText: string
  lineText: string
  range: [[number, number], [number, number]]
  leadingContextLines: unknown[]
  trailingContextLines: unknown[]
}

const processUnicodeMatch = (match: RgMatchData): void => {
  const text = getText(match.lines)
  if (text.length === Buffer.byteLength(text)) return
  let remainingBuffer = Buffer.from(text)
  let currentLength = 0
  let previousPosition = 0
  const convertPosition = (position: number): number => {
    const currentBuffer = remainingBuffer.slice(0, position - previousPosition)
    currentLength = currentBuffer.toString().length + currentLength
    remainingBuffer = remainingBuffer.slice(position - previousPosition)
    previousPosition = position
    return currentLength
  }
  for (const submatch of match.submatches) {
    submatch.start = convertPosition(submatch.start)
    submatch.end = convertPosition(submatch.end)
  }
}

const processSubmatch = (
  submatch: RgSubmatch,
  lineText: string,
  offsetRow: number
): { range: [[number, number], [number, number]]; lineText: string } => {
  const lineParts = lineText.split('\n')
  const start = getPositionFromColumn(lineParts, submatch.start)
  const end = getPositionFromColumn(lineParts, submatch.end)
  for (let i = start[0]; i > 0; i--) lineParts.shift()
  while (end[0] < lineParts.length - 1) lineParts.pop()
  start[0] += offsetRow
  end[0] += offsetRow
  return {
    range: [start, end],
    lineText: cleanResultLine({ text: lineParts.join('\n') })
  }
}

const prepareGlobs = (
  globs: string[] | undefined,
  projectRootPath: string,
  sep?: string
): string[] => {
  const output: string[] = []
  for (let pattern of globs || []) {
    pattern = pattern.replace(new RegExp(`\\${sep || path.sep}`, 'g'), '/')
    if (pattern.length === 0) continue
    const projectName = path.basename(projectRootPath)
    if (pattern === projectName) {
      output.push('**/*')
      continue
    }
    if (pattern.startsWith(projectName + '/')) {
      pattern = pattern.slice(projectName.length + 1)
    }
    if (pattern.endsWith('/')) pattern = pattern.slice(0, -1)
    pattern = pattern.startsWith('**/') ? pattern : `**/${pattern}`
    output.push(pattern)
    output.push(pattern.endsWith('/**') ? pattern : `${pattern}/**`)
  }
  return output
}

const prepareRegexp = (regexpStr: string): string => {
  if (regexpStr === '--') return '\\-\\-'
  return regexpStr.replace(/\\\//g, '/')
}

const isMultilineRegexp = (regexpStr: string): boolean => regexpStr.includes('\\n')

interface PausableSource {
  pause: () => unknown
  resume: () => unknown
}

type PendingTextMessage =
  | { type: 'begin'; filePath: string }
  | { type: 'match'; data: RgMatchData; nextSubmatchIndex: number; trailingContextLines: unknown[] }
  | { type: 'end' }

const startTextSearch = (
  sender: WebContents,
  searchId: string,
  directories: string[],
  pattern: string,
  options: RipgrepSearchOptions
): void => {
  const rgPath = resolveRgPath()
  const children: ChildProcess[] = []
  const sources = new Set<PausableSource>()
  const drainers = new Set<() => void>()
  let cancelled = false
  let pendingPaths = 0
  let pendingDirs = directories.length
  let finished = false
  let cancel = (): void => {}

  const pauseSources = (): void => {
    for (const source of sources) source.pause()
  }

  const resumeSources = (): void => {
    if (cancelled || finished || gate.isFull) return
    for (const drain of drainers) drain()
    if (cancelled || finished || gate.isFull) {
      if (gate.isFull) pauseSources()
      return
    }
    for (const source of sources) source.resume()
    maybeFinish()
  }

  const sendProgress = (num: number): boolean => {
    const sent = sendIfAlive(sender, 'mt::rg::progress', { searchId, num })
    if (!sent) cancel()
    return sent
  }

  const maybeFinish = (): void => {
    if (finished || cancelled || pendingDirs !== 0 || !gate.isEmpty) return
    finished = true
    removeActiveSearch(searchId, cancel)
    gate.close()
    sendIfAlive(sender, 'mt::rg::done', { searchId })
  }

  const fail = (err: unknown): void => {
    if (finished || cancelled) return
    cancelled = true
    gate.close()
    for (const child of children) terminateChild(child)
    sources.clear()
    drainers.clear()
    finished = true
    removeActiveSearch(searchId, cancel)
    sendIfAlive(sender, 'mt::rg::error', {
      searchId,
      error: err instanceof Error ? err.message : String(err)
    })
  }

  cancel = (): void => {
    if (finished || cancelled) {
      gate.close()
      return
    }
    cancelled = true
    gate.close()
    for (const child of children) terminateChild(child)
    sources.clear()
    drainers.clear()
    finished = true
    removeActiveSearch(searchId, cancel)
    sendIfAlive(sender, 'mt::rg::cancelled', { searchId })
  }

  const gate = new BatchGate<unknown>(
    (batch: Batch<unknown>) =>
      sendIfAlive(sender, 'mt::rg::match', {
        searchId,
        batchId: batch.batchId,
        payload: batch.payload
      }),
    {
      maxInFlight: MAX_IN_FLIGHT_BATCHES,
      maxQueued: MAX_QUEUED_BATCHES,
      onCapacity: resumeSources,
      onSendFailure: cancel
    }
  )

  activeSearches.set(searchId, { sender, cancel, ack: (batchId) => gate.ack(batchId) })

  for (const directoryPath of directories) {
    let regexpStr: string | null = null
    let textPattern: string | null = null
    const args = ['--json']
    if (options.isRegexp) {
      regexpStr = prepareRegexp(pattern)
      args.push('--regexp', regexpStr)
    } else {
      args.push('--fixed-strings')
      textPattern = pattern
    }
    if (regexpStr && isMultilineRegexp(regexpStr)) args.push('--multiline')
    if (options.isCaseSensitive) args.push('--case-sensitive')
    else args.push('--ignore-case')
    if (options.isWholeWord) args.push('--word-regexp')
    if (options.followSymlinks) args.push('--follow')
    if (options.maxFileSize) args.push('--max-filesize', options.maxFileSize + '')
    if (options.includeHidden) args.push('--hidden')
    if (options.noIgnore) args.push('--no-ignore')
    if (options.leadingContextLineCount) { args.push('--before-context', String(options.leadingContextLineCount)) }
    if (options.trailingContextLineCount) { args.push('--after-context', String(options.trailingContextLineCount)) }
    for (const inclusion of prepareGlobs(options.inclusions, directoryPath)) { args.push('--iglob', inclusion) }
    for (const exclusion of prepareGlobs(options.exclusions, directoryPath)) { args.push('--iglob', '!' + exclusion) }
    args.push('--')
    if (textPattern) args.push(textPattern)
    args.push(directoryPath)

    let child: ChildProcess
    try {
      child = spawn(rgPath, args, { cwd: directoryPath, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (err) {
      fail(err)
      return
    }
    children.push(child)
    if (child.stdout) sources.add(child.stdout)

    let buffer = ''
    let bufferError = ''
    let pendingEvent: { filePath: string; matches: RgMatch[] } | null = null
    let pendingLeadingContext: unknown[] = []
    let pendingMessage: PendingTextMessage | null = null
    let outputEnded = !child.stdout
    let processClosed = false
    let childFinished = false
    let draining = false

    const flushPendingEvent = (afterSend?: () => boolean | void): boolean => {
      if (cancelled || !pendingEvent || pendingEvent.matches.length === 0) return true
      const event = pendingEvent
      const batchId = gate.enqueue(event, { afterSend })
      if (batchId === null) return false
      pendingEvent = { filePath: event.filePath, matches: [] }
      return true
    }

    const drainPendingMessage = (): boolean => {
      if (!pendingMessage) return true

      if (pendingMessage.type === 'begin') {
        if (!flushPendingEvent()) return false
        pendingEvent = { filePath: pendingMessage.filePath, matches: [] }
        pendingLeadingContext = []
        pendingMessage = null
        return true
      }

      if (pendingMessage.type === 'match') {
        const { data } = pendingMessage
        if (!pendingEvent) {
          pendingEvent = { filePath: getText(data.path), matches: [] }
        }
        while (pendingMessage.nextSubmatchIndex < data.submatches.length) {
          if (pendingEvent.matches.length >= TEXT_MATCH_BATCH_SIZE && !flushPendingEvent()) {
            return false
          }
          const submatch = data.submatches[pendingMessage.nextSubmatchIndex]
          if (!submatch) break
          const { lineText, range } = processSubmatch(
            submatch,
            getText(data.lines),
            data.line_number - 1
          )
          pendingEvent.matches.push({
            matchText: getText(submatch.match),
            lineText,
            range,
            leadingContextLines: [...pendingLeadingContext],
            trailingContextLines: pendingMessage.trailingContextLines
          })
          pendingMessage.nextSubmatchIndex++
        }
        pendingMessage = null
        return true
      }

      if (pendingEvent?.matches.length) {
        const progressNumber = pendingPaths + 1
        if (!flushPendingEvent(() => sendProgress(progressNumber))) return false
      } else if (!sendProgress(pendingPaths + 1)) {
        return false
      }
      pendingPaths++
      pendingEvent = null
      pendingMessage = null
      return true
    }

    const parseLine = (line: string): PendingTextMessage | null => {
      try {
        const message = JSON.parse(line) as {
          type?: string
          data?: RgMatchData
        }
        if (message.type === 'begin') {
          // A well-formed ripgrep stream ends a file before beginning the
          // next one. Flush defensively in case a truncated stream omits it.
          return { type: 'begin', filePath: getText(message.data?.path as TextInput) }
        } else if (message.type === 'match') {
          const data = message.data as RgMatchData
          const trailingContextLines: unknown[] = []
          processUnicodeMatch(data)
          return { type: 'match', data, nextSubmatchIndex: 0, trailingContextLines }
        } else if (message.type === 'end') {
          return { type: 'end' }
        }
      } catch (err) {
        log.warn('Failed to parse ripgrep output line:', line, err)
      }
      return null
    }

    const finishChildIfReady = (): void => {
      if (childFinished || !outputEnded || !processClosed || cancelled || finished) return
      if (pendingMessage && !drainPendingMessage()) return
      if (pendingMessage) return
      if (buffer.length > 0) return
      if (pendingEvent?.matches.length && !flushPendingEvent()) return
      pendingEvent = null
      childFinished = true
      pendingDirs--
      maybeFinish()
    }

    const drain = (): void => {
      if (draining || cancelled || finished) return
      draining = true
      try {
        while (!gate.isFull) {
          if (pendingMessage && !drainPendingMessage()) {
            pauseSources()
            return
          }
          if (pendingMessage) continue

          const newlineIndex = buffer.indexOf('\n')
          let line: string
          if (newlineIndex < 0) {
            if (!outputEnded || !buffer) break
            line = buffer
            buffer = ''
          } else {
            line = buffer.slice(0, newlineIndex)
            buffer = buffer.slice(newlineIndex + 1)
          }
          if (!line) continue
          pendingMessage = parseLine(line)
        }
        if (gate.isFull) pauseSources()
        finishChildIfReady()
        if (gate.isFull) pauseSources()
      } finally {
        draining = false
      }
    }

    drainers.add(drain)

    child.on('close', (code) => {
      if (code !== null && code > 1 && bufferError) {
        log.warn('Ripgrep finished with errors (exit code ' + code + '):', bufferError)
      }
      processClosed = true
      if (child.stdout?.readableEnded) outputEnded = true
      drain()
    })
    child.on('error', (err) => fail(err))
    child.stderr?.on('data', (chunk: Buffer | string) => {
      bufferError += chunk
    })
    child.stdout?.on('end', () => {
      outputEnded = true
      drain()
    })
    child.stdout?.on('data', (chunk: Buffer | string) => {
      if (cancelled) return
      buffer += chunk
      drain()
    })
  }

  if (directories.length === 0) maybeFinish()
}

const startFileSearch = (
  sender: WebContents,
  searchId: string,
  directories: string[],
  options: RipgrepSearchOptions
): void => {
  const rgPath = resolveRgPath()
  const children: ChildProcess[] = []
  const sources = new Set<PausableSource>()
  const drainers = new Set<() => void>()
  let cancelled = false
  let pendingPaths = 0
  let pendingDirs = directories.length
  let finished = false
  let cancel = (): void => {}

  const pauseSources = (): void => {
    for (const source of sources) source.pause()
  }

  const resumeSources = (): void => {
    if (cancelled || finished || gate.isFull) return
    for (const drain of drainers) drain()
    if (cancelled || finished || gate.isFull) {
      if (gate.isFull) pauseSources()
      return
    }
    for (const source of sources) source.resume()
    maybeFinish()
  }

  const sendProgress = (num: number): boolean => {
    const sent = sendIfAlive(sender, 'mt::rg::progress', { searchId, num })
    if (!sent) cancel()
    return sent
  }

  const maybeFinish = (): void => {
    if (finished || cancelled || pendingDirs !== 0 || !gate.isEmpty) return
    finished = true
    removeActiveSearch(searchId, cancel)
    gate.close()
    sendIfAlive(sender, 'mt::rg::done', { searchId })
  }

  const fail = (err: unknown): void => {
    if (finished || cancelled) return
    cancelled = true
    gate.close()
    for (const child of children) terminateChild(child)
    sources.clear()
    drainers.clear()
    finished = true
    removeActiveSearch(searchId, cancel)
    sendIfAlive(sender, 'mt::rg::error', {
      searchId,
      error: err instanceof Error ? err.message : String(err)
    })
  }

  cancel = (): void => {
    if (finished || cancelled) {
      gate.close()
      return
    }
    cancelled = true
    gate.close()
    for (const child of children) terminateChild(child)
    sources.clear()
    drainers.clear()
    finished = true
    removeActiveSearch(searchId, cancel)
    sendIfAlive(sender, 'mt::rg::cancelled', { searchId })
  }

  const gate = new BatchGate<unknown>(
    (batch: Batch<unknown>) =>
      sendIfAlive(sender, 'mt::rg::match', {
        searchId,
        batchId: batch.batchId,
        payload: batch.payload
      }),
    {
      maxInFlight: MAX_IN_FLIGHT_BATCHES,
      maxQueued: MAX_QUEUED_BATCHES,
      onCapacity: resumeSources,
      onSendFailure: cancel
    }
  )

  activeSearches.set(searchId, { sender, cancel, ack: (batchId) => gate.ack(batchId) })

  for (const directoryPath of directories) {
    const args = ['--files']
    if (options.followSymlinks) args.push('--follow')
    if (options.includeHidden) args.push('--hidden')
    if (options.noIgnore) args.push('--no-ignore')
    for (const inclusion of prepareGlobs(options.inclusions, directoryPath)) { args.push('--iglob', inclusion) }
    args.push('--')
    args.push(directoryPath)

    let child: ChildProcess
    try {
      child = spawn(rgPath, args, { cwd: directoryPath, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (err) {
      fail(err)
      return
    }
    children.push(child)
    if (child.stdout) sources.add(child.stdout)

    let buffer = ''
    let bufferError = ''
    const pendingPathBatch: string[] = []
    let outputEnded = !child.stdout
    let processClosed = false
    let childFinished = false
    let draining = false

    const flushPathBatch = (): boolean => {
      if (cancelled || pendingPathBatch.length === 0) return true
      const batch = [...pendingPathBatch]
      const nextPathCount = pendingPaths + batch.length
      const batchId = gate.enqueue(batch, {
        beforeSend: () => sendProgress(nextPathCount)
      })
      if (batchId === null) return false
      pendingPathBatch.splice(0, pendingPathBatch.length)
      pendingPaths = nextPathCount
      return true
    }

    const processPathLine = (line: string): boolean => {
      if (!line) return true
      pendingPathBatch.push(line.endsWith('\r') ? line.slice(0, -1) : line)
      if (pendingPathBatch.length >= FILE_PATH_BATCH_SIZE) return flushPathBatch()
      return true
    }

    const finishChildIfReady = (): void => {
      if (childFinished || !outputEnded || !processClosed || cancelled || finished) return
      if (buffer.length > 0) return
      if (!flushPathBatch()) return
      if (pendingPathBatch.length > 0) return
      childFinished = true
      pendingDirs--
      maybeFinish()
    }

    const drain = (): void => {
      if (draining || cancelled || finished) return
      draining = true
      try {
        while (!gate.isFull) {
          const newlineIndex = buffer.indexOf('\n')
          let line: string
          if (newlineIndex < 0) {
            if (!outputEnded || !buffer) break
            line = buffer
            buffer = ''
          } else {
            line = buffer.slice(0, newlineIndex)
            buffer = buffer.slice(newlineIndex + 1)
          }
          if (!processPathLine(line)) {
            pauseSources()
            return
          }
        }
        if (gate.isFull) pauseSources()
        finishChildIfReady()
        if (gate.isFull) pauseSources()
      } finally {
        draining = false
      }
    }

    drainers.add(drain)

    child.on('close', (code) => {
      if (code !== null && code > 1) {
        fail(new Error(bufferError || `Ripgrep exited with code ${code}`))
        return
      }
      processClosed = true
      if (child.stdout?.readableEnded) outputEnded = true
      drain()
    })
    child.on('error', (err) => fail(err))
    child.stderr?.on('data', (chunk: Buffer | string) => {
      bufferError += chunk
    })
    child.stdout?.on('end', () => {
      outputEnded = true
      drain()
    })
    child.stdout?.on('data', (chunk: Buffer | string) => {
      if (cancelled) return
      buffer += chunk
      drain()
    })
  }

  if (directories.length === 0) maybeFinish()
}

export const registerRipgrepHandlers = (): void => {
  ipcMain.handle('mt::rg::start', (event, req: RipgrepRequest) => {
    const { searchId, mode, directories, pattern, options } = req
    activeSearches.get(searchId)?.cancel()
    cleanupAtSenderDestroy(event.sender)
    if (mode === 'files') startFileSearch(event.sender, searchId, directories, options || {})
    else startTextSearch(event.sender, searchId, directories, pattern, options || {})
    return { searchId }
  })
  ipcMain.on('mt::rg::cancel', (event, searchId: string) => {
    const entry = activeSearches.get(searchId)
    if (entry && entry.sender === event.sender) entry.cancel()
  })
  ipcMain.on('mt::rg::ack', (event, searchId: string, batchId: number) => {
    const entry = activeSearches.get(searchId)
    if (entry && entry.sender === event.sender) entry.ack(batchId)
  })
}
