import path from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { exec, execFile } from 'child_process'
import fs from 'fs-extra'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import commandExists from 'command-exists'
import { isImageFile } from 'common/filesystem/paths'
import { uploadByPicgoApp } from './picgoApp'

const buildPreferredPathEnv = (): string => {
  const extras =
    process.platform === 'darwin'
      ? ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']
      : process.platform === 'linux'
        ? ['/usr/local/bin', '/usr/bin', '/bin']
        : []
  const cur = (process.env.PATH || '').split(path.delimiter)
  const merged = [...cur]
  for (const p of extras) if (p && !merged.includes(p)) merged.push(p)
  return merged.filter(Boolean).join(path.delimiter)
}

const resolvePicgoBinary = (): string | null => {
  const candidates =
    process.platform === 'win32'
      ? ['picgo', 'picgo.exe']
      : [
        'picgo',
        '/opt/homebrew/bin/picgo',
        '/usr/local/bin/picgo',
        '/usr/bin/picgo',
        `${process.env.HOME}/.npm-global/bin/picgo`,
        `${process.env.HOME}/.npm/bin/picgo`,
        '/usr/local/lib/node_modules/.bin/picgo'
      ]
  for (const c of candidates) {
    try {
      if (commandExists.sync(c)) return c
      if (c.startsWith('/') && fs.pathExistsSync(c)) return c
    } catch {
      /* not found */
    }
  }
  return null
}

// Strip ANSI SGR color codes (CSI parameter ... 'm') from picgo output before
// trying to parse it. \x1b is the ESC byte.
const ANSI_SGR_RE = /\x1b\[[0-9;]*m/g // eslint-disable-line no-control-regex

const parsePicgoOutput = (text: unknown): string | null => {
  const raw = String(text || '')
  const cleaned = raw.replace(ANSI_SGR_RE, '')
  try {
    const lines = cleaned
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    for (const line of lines) {
      if (
        (line.startsWith('{') && line.endsWith('}')) ||
        (line.startsWith('[') && line.endsWith(']'))
      ) {
        try {
          const obj = JSON.parse(line)
          if (obj) {
            if (obj.success === true && typeof obj.imgUrl === 'string') return obj.imgUrl
            if (obj.success === true && Array.isArray(obj.result) && obj.result.length > 0) {
              return String(obj.result[obj.result.length - 1])
            }
            if (obj.success === true && typeof obj.url === 'string') return obj.url
          }
        } catch {
          /* not JSON */
        }
      }
      const kv = line.match(/(?:success|succeeded|uploaded)\s*:?\s*(https?:\/\/\S+)/i)
      if (kv && kv[1]) return kv[1]
    }
  } catch {
    /* outer parse failed */
  }
  const marker = cleaned.split('[PicGo SUCCESS]:')
  if (marker.length >= 2) {
    const candidate = marker[marker.length - 1].trim()
    if (/^https?:\/\//i.test(candidate)) return candidate
  }
  return null
}

const uploadByPicgo = (localPath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const cmd = resolvePicgoBinary()
    if (!cmd) return reject(new Error('PicGo command not found in PATH'))
    exec(
      `${cmd} u "${localPath}"`,
      { env: { ...process.env, PATH: buildPreferredPathEnv() } },
      (err, stdout, stderr) => {
        if (err) return reject(err)
        const text = String(stdout || '') + (stderr ? `\n${String(stderr)}` : '')
        const url = parsePicgoOutput(text)
        if (url) resolve(url)
        else reject(new Error(`PicGo upload error: cannot parse output\n${text.slice(0, 400)}`))
      }
    )
  })

const uploadByCli = (cliScript: string, localPath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile(
      cliScript,
      [localPath],
      { env: { ...process.env, PATH: buildPreferredPathEnv() } },
      (err, data) => {
        if (err) return reject(err)
        resolve(String(data || '').trim())
      }
    )
  })

const writeBinaryToTmp = async(
  data: Uint8Array | number[] | null | undefined,
  suffix: string = ''
): Promise<string> => {
  const buf = data instanceof Uint8Array ? Buffer.from(data) : Buffer.from(data || [])
  const tmpPath = path.join(tmpdir(), `${Date.now()}-${randomUUID()}${suffix}`)
  await fs.writeFile(tmpPath, buf)
  return tmpPath
}

interface UploaderOptions {
  currentUploader: string
  cliScript: string
  picgoAppPath?: string
}

const uploadFromPath = async(
  imagePath: string,
  options: UploaderOptions
): Promise<string> => {
  const { currentUploader, cliScript, picgoAppPath } = options
  if (currentUploader === 'picgo') return uploadByPicgo(imagePath)
  if (currentUploader === 'picgoApp') return uploadByPicgoApp(imagePath, picgoAppPath)
  if (currentUploader === 'cliScript') return uploadByCli(cliScript, imagePath)
  throw new Error(`Unsupported uploader: ${currentUploader}`)
}

interface BufferImagePayload {
  data: Uint8Array | number[]
  name: string
}

const uploadFromBuffer = async(
  { data, name }: BufferImagePayload,
  options: UploaderOptions
): Promise<string> => {
  const suffix = path.extname(name || '') || ''
  const localPath = await writeBinaryToTmp(data, suffix)
  const cleanup = () =>
    fs.unlink(localPath).catch(() => {
      /* ignore */
    })
  try {
    return await uploadFromPath(localPath, options)
  } finally {
    await cleanup()
  }
}

interface UploadRequest {
  pathname: string
  image: string | BufferImagePayload
  isPath: boolean
  preferences: UploaderOptions
}

const PICGO_TEST_IMAGE = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
))

export const registerUploaderHandlers = (): void => {
  ipcMain.handle('mt::uploader::upload', async(_event, req: UploadRequest) => {
    const { pathname, image, isPath, preferences } = req
    if (isPath) {
      const dir = path.dirname(pathname)
      const imagePath = path.resolve(dir, image as string)
      const isImg = isImageFile(imagePath)
      if (!isImg) return image
      return uploadFromPath(imagePath, preferences)
    }
    return uploadFromBuffer(image as BufferImagePayload, preferences)
  })

  ipcMain.handle('mt::uploader::test-picgo-app', async(_event, picgoAppPath: string) => {
    return uploadFromBuffer(
      { data: PICGO_TEST_IMAGE, name: 'marktext-picgo-test.png' },
      { currentUploader: 'picgoApp', cliScript: '', picgoAppPath }
    )
  })

  ipcMain.handle('mt::uploader::pick-picgo-app', async(event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return ''

    const isMac = process.platform === 'darwin'
    const { filePaths } = await dialog.showOpenDialog(win, {
      properties: isMac ? ['openFile', 'openDirectory'] : ['openFile'],
      ...(process.platform === 'win32'
        ? { filters: [{ name: 'PicGo', extensions: ['exe'] }] }
        : {})
    })
    const selectedPath = filePaths?.[0] || ''
    if (isMac && selectedPath.toLowerCase().endsWith('.app')) {
      return path.join(selectedPath, 'Contents', 'MacOS', 'PicGo')
    }
    return selectedPath
  })
}
