// Copy from https://github.com/utatti/simple-pandoc/blob/master/index.js
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import type { Readable } from 'stream'
import { isFile2 } from 'common/filesystem'

const pandocCommand = 'pandoc'

const getCommand = (): string => {
  if (envPathExists()) {
    return process.env.INKIVA_PANDOC as string
  }
  return pandocCommand
}

interface PandocConverter {
  (): Promise<string>
  stream: (srcStream: NodeJS.ReadableStream) => Readable | null
}

interface PandocFn {
  (from: string, to: string, ...args: string[]): PandocConverter
  exists: () => boolean
}

const pandoc = ((from: string, to: string, ...args: string[]): PandocConverter => {
  const command = getCommand()
  const option = ['-s', from, '-t', to].concat(args)

  const converter = ((): Promise<string> =>
    new Promise((resolve, reject) => {
      const proc = spawn(command, option)
      proc.on('error', reject)
      let data = ''
      proc.stdout.on('data', (chunk: Buffer | string) => {
        data += chunk.toString()
      })
      proc.stdout.on('end', () => resolve(data))
      proc.stdout.on('error', reject)
      proc.stdin.end()
    })) as PandocConverter

  converter.stream = (srcStream: NodeJS.ReadableStream): Readable | null => {
    const proc = spawn(command, option)
    srcStream.pipe(proc.stdin)
    return proc.stdout
  }

  return converter
}) as PandocFn

const isExecutableFile = (filename: string): boolean => {
  try {
    fs.accessSync(filename, fs.constants.X_OK)
    return fs.statSync(filename).isFile()
  } catch {
    return false
  }
}

const commandExistsOnPath = (command: string): boolean => {
  const pathValue = process.env.PATH
  if (!pathValue) return false

  const extensions =
    process.platform === 'win32'
      ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
      : ['']

  for (const dir of pathValue.split(path.delimiter)) {
    if (!dir) continue
    for (const extension of extensions) {
      const candidate = path.join(dir.replace(/^"|"$/g, ''), `${command}${extension}`)
      if (isExecutableFile(candidate)) return true
    }
  }
  return false
}

pandoc.exists = (): boolean => {
  if (envPathExists()) {
    return true
  }
  // Avoid eagerly loading the command-exists dependency through the File menu
  // module on every application launch. PATH probing is only performed when
  // Import is actually invoked or a Pandoc-compatible file is dropped.
  return commandExistsOnPath(pandocCommand)
}

const envPathExists = (): boolean => {
  return !!process.env.INKIVA_PANDOC && isFile2(process.env.INKIVA_PANDOC)
}

export default pandoc
