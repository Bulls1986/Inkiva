import http from 'http'
import https from 'https'
import path from 'path'
import { spawn, type ChildProcess } from 'child_process'
import fs from 'fs-extra'

export const PICGO_SERVER_HOST = '127.0.0.1'
export const PICGO_SERVER_PORT = 36677
export const PICGO_SERVER_URL = `http://${PICGO_SERVER_HOST}:${PICGO_SERVER_PORT}`

const REQUEST_TIMEOUT_MS = 10000
const STARTUP_TIMEOUT_MS = 10000
const STARTUP_POLL_INTERVAL_MS = 250

const normalizePathForComparison = (value: string): string => {
  return value.trim().replace(/[\\/]+$/, '').replaceAll('\\', '/').toLowerCase()
}

const uniquePaths = (paths: string[]): string[] => {
  const seen = new Set<string>()
  return paths.filter((value) => {
    if (!value) return false
    const normalized = normalizePathForComparison(value)
    if (seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

/**
 * The path shown by default in the settings page follows the path used by the
 * standard PicGo desktop installation. The actual launcher also probes the
 * per-user Windows location because PicGo's installer allows users to change
 * the installation directory.
 */
export const getDefaultPicgoAppPath = (platform: NodeJS.Platform = process.platform): string => {
  if (platform === 'win32') return String.raw`C:\Program Files\PicGo\PicGo.exe`
  if (platform === 'darwin') return '/Applications/PicGo.app/Contents/MacOS/PicGo'
  return ''
}

const getPicgoAppPathCandidates = (configuredPath: string): string[] => {
  const configured = configuredPath.trim()
  const candidates = configured ? [configured] : []
  const defaultPath = getDefaultPicgoAppPath()

  // A non-default user path is authoritative. Do not silently launch another
  // PicGo installation when that explicitly configured path is unavailable.
  if (configured && normalizePathForComparison(configured) !== normalizePathForComparison(defaultPath)) {
    return uniquePaths(candidates)
  }

  if (process.platform === 'win32') {
    const programFiles = process.env.ProgramFiles
    const programFilesX86 = process.env['ProgramFiles(x86)']
    const localAppData = process.env.LOCALAPPDATA
    const programW6432 = process.env.ProgramW6432

    candidates.push(defaultPath)
    if (programFiles) candidates.push(path.join(programFiles, 'PicGo', 'PicGo.exe'))
    if (programW6432) candidates.push(path.join(programW6432, 'PicGo', 'PicGo.exe'))
    if (programFilesX86) candidates.push(path.join(programFilesX86, 'PicGo', 'PicGo.exe'))
    if (localAppData) {
      candidates.push(path.join(localAppData, 'Programs', 'PicGo', 'PicGo.exe'))
      candidates.push(path.join(localAppData, 'PicGo', 'PicGo.exe'))
    }
  } else if (process.platform === 'darwin') {
    candidates.push(defaultPath)
    if (process.env.HOME) {
      candidates.push(path.join(process.env.HOME, 'Applications', 'PicGo.app', 'Contents', 'MacOS', 'PicGo'))
    }
    // Allow the macOS application bundle itself to be selected from the
    // settings page; launchPicgoApp converts it to an `open -a` invocation.
    candidates.push('/Applications/PicGo.app')
  }

  return uniquePaths(candidates)
}

const getErrorMessage = (value: unknown, fallback: string): string => {
  if (value instanceof Error && value.message) return value.message
  if (typeof value === 'string' && value.trim()) return value.trim()
  return fallback
}

const requestPicgoServer = async(
  serverUrl: string,
  endpoint: string,
  method: 'GET' | 'POST',
  body?: string
): Promise<unknown> => {
  const url = new URL(endpoint, serverUrl.endsWith('/') ? serverUrl : `${serverUrl}/`)
  const transport = url.protocol === 'https:' ? https : http

  return new Promise((resolve, reject) => {
    const request = transport.request(
      url,
      {
        method,
        headers: {
          Accept: 'application/json',
          ...(body
            ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body)
            }
            : {})
        }
      },
      (response) => {
        let raw = ''
        response.setEncoding('utf8')
        response.on('data', (chunk: string) => {
          raw += chunk
        })
        response.once('end', () => {
          const statusCode = response.statusCode || 0
          if (statusCode < 200 || statusCode >= 300) {
            let detail = raw.trim()
            try {
              const parsed = JSON.parse(detail) as { message?: unknown }
              detail = getErrorMessage(parsed.message, detail)
            } catch {
              // Keep the raw response when the server did not return JSON.
            }
            detail = detail ? `: ${detail.slice(0, 300)}` : ''
            reject(new Error(`PicGo Server returned HTTP ${statusCode}${detail}`))
            return
          }

          if (!raw.trim()) {
            resolve(null)
            return
          }

          try {
            resolve(JSON.parse(raw))
          } catch {
            resolve(raw)
          }
        })
      }
    )

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error('PicGo Server request timed out'))
    })
    request.once('error', reject)
    if (body) request.write(body)
    request.end()
  })
}

export const isPicgoServerAvailable = async(serverUrl: string = PICGO_SERVER_URL): Promise<boolean> => {
  try {
    await requestPicgoServer(serverUrl, '/heartbeat', 'POST')
    return true
  } catch {
    return false
  }
}

const launchPicgoApp = async(appPath: string): Promise<void> => {
  const isMacApplicationBundle = process.platform === 'darwin' && appPath.toLowerCase().endsWith('.app')
  const command = isMacApplicationBundle ? 'open' : appPath
  const args = isMacApplicationBundle ? ['-a', appPath] : []

  await new Promise<void>((resolve, reject) => {
    let settled = false
    let child: ChildProcess
    try {
      // Passing the executable and arguments separately avoids invoking a
      // shell with a user-controlled PicGo path.
      child = spawn(command, args, { detached: true, stdio: 'ignore' })
    } catch (error) {
      reject(error)
      return
    }

    child.once('error', (error) => {
      if (!settled) {
        settled = true
        reject(error)
      }
    })
    child.once('spawn', () => {
      settled = true
      child.unref()
      resolve()
    })
  })
}

const resolvePicgoAppPath = (configuredPath: string): string | null => {
  for (const candidate of getPicgoAppPathCandidates(configuredPath)) {
    try {
      if (fs.pathExistsSync(candidate)) return candidate
    } catch {
      // Continue probing the other standard locations.
    }
  }
  return null
}

const delay = (milliseconds: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

let startPicgoServerPromise: Promise<void> | null = null

const startPicgoServerAndWait = async(
  configuredPath: string,
  serverUrl: string
): Promise<void> => {
  const appPath = resolvePicgoAppPath(configuredPath)
  if (!appPath) {
    throw new Error(
      `PicGo App executable not found. Please set PicGo Path (default: ${getDefaultPicgoAppPath() || 'not available on this platform'}).`
    )
  }

  await launchPicgoApp(appPath)

  const deadline = Date.now() + STARTUP_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (await isPicgoServerAvailable(serverUrl)) return
    await delay(STARTUP_POLL_INTERVAL_MS)
  }

  throw new Error(`PicGo Server did not become available at ${serverUrl}.`)
}

/**
 * Make sure the PicGo Server is ready before an upload request is sent.
 * Concurrent paste operations share one startup promise so they cannot spawn
 * multiple PicGo App instances.
 */
export const ensurePicgoServer = async(
  configuredPath: string = '',
  serverUrl: string = PICGO_SERVER_URL
): Promise<void> => {
  if (await isPicgoServerAvailable(serverUrl)) return

  if (!startPicgoServerPromise) {
    startPicgoServerPromise = startPicgoServerAndWait(configuredPath, serverUrl).finally(() => {
      startPicgoServerPromise = null
    })
  }
  return startPicgoServerPromise
}

interface PicgoUploadResponse {
  success?: unknown
  result?: unknown
  message?: unknown
}

const getPicgoUploadUrl = (payload: unknown): string => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('PicGo Server returned an invalid response.')
  }

  const response = payload as PicgoUploadResponse
  if (response.success !== true) {
    throw new Error(getErrorMessage(response.message, 'PicGo upload failed.'))
  }

  const result = Array.isArray(response.result) ? response.result[0] : response.result
  if (typeof result !== 'string' || !result.trim()) {
    throw new Error('PicGo Server returned no image URL.')
  }
  return result.trim()
}

export const uploadByPicgoApp = async(
  localPath: string,
  configuredPath: string = '',
  serverUrl: string = PICGO_SERVER_URL
): Promise<string> => {
  await ensurePicgoServer(configuredPath, serverUrl)
  const response = await requestPicgoServer(
    serverUrl,
    '/upload',
    'POST',
    JSON.stringify({ list: [localPath] })
  )
  return getPicgoUploadUrl(response)
}
