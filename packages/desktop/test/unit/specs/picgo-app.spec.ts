import { EventEmitter } from 'events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }))

vi.mock('http', () => ({ default: { request: requestMock } }))
vi.mock('https', () => ({ default: { request: vi.fn() } }))

const { getDefaultPicgoAppPath, uploadByPicgoApp } = await import('main_renderer/ipc/picgoApp')

interface FakeResponse extends EventEmitter {
  statusCode: number
  setEncoding: ReturnType<typeof vi.fn>
}

interface RequestCall {
  url: string
  method: string
  body: string
}

const createResponse = (statusCode: number): FakeResponse => {
  const response = new EventEmitter() as FakeResponse
  response.statusCode = statusCode
  response.setEncoding = vi.fn()
  return response
}

describe('PicGo App integration', () => {
  let requestCalls: RequestCall[]
  let uploadResponse: { success: boolean; result: string[]; message?: string } = {
    success: true,
    result: ['https://cdn.example/image.png']
  }

  beforeEach(() => {
    requestCalls = []
    uploadResponse = { success: true, result: ['https://cdn.example/image.png'] }
    requestMock.mockReset()
    requestMock.mockImplementation(
      (
        url: URL,
        options: { method: string },
        callback: (response: FakeResponse) => void
      ) => {
        let body = ''
        const request = {
          setTimeout: vi.fn(),
          destroy: vi.fn(),
          once: vi.fn(),
          write: vi.fn((chunk: string) => {
            body += chunk
          }),
          end: vi.fn(() => {
            const isHeartbeat = requestCalls.length === 0
            requestCalls.push({
              url: url.toString(),
              method: options.method,
              body
            })
            const response = createResponse(200)
            callback(response)
            response.emit('data', isHeartbeat ? 'ok' : JSON.stringify(uploadResponse))
            response.emit('end')
          })
        }
        return request
      }
    )
  })

  it('uses the standard Windows and macOS default paths', () => {
    expect(getDefaultPicgoAppPath('win32')).toBe('C:\\Program Files\\PicGo\\PicGo.exe')
    expect(getDefaultPicgoAppPath('darwin')).toBe('/Applications/PicGo.app/Contents/MacOS/PicGo')
  })

  it('checks the service before uploading and returns the URL', async() => {
    const url = await uploadByPicgoApp('/tmp/pasted-image.png', '/not-used', 'http://picgo.test')

    expect(url).toBe('https://cdn.example/image.png')
    expect(requestCalls.map((request) => request.url)).toEqual([
      'http://picgo.test/heartbeat',
      'http://picgo.test/upload'
    ])
    expect(JSON.parse(requestCalls[1].body)).toEqual({ list: ['/tmp/pasted-image.png'] })
  })

  it('surfaces the PicGo error message', async() => {
    uploadResponse = { success: false, result: [], message: 'No uploader configured' }

    await expect(
      uploadByPicgoApp('/tmp/pasted-image.png', '/not-used', 'http://picgo.test')
    ).rejects.toThrow('No uploader configured')
  })
})
