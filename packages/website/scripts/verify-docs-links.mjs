import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.pdf'])

function inRoot(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
}

export function registeredDocFiles(navSource) {
  const files = [...navSource.matchAll(/\bfile:\s*'([^']+)'/g)].map((match) => match[1])
  if (!files.length) throw new Error('No public documentation pages found in docs-nav.ts')
  if (new Set(files.map((file) => file.toLowerCase())).size !== files.length) {
    throw new Error('Duplicate documentation source file in docs-nav.ts')
  }
  return files
}

function plainLine(line) {
  return line.replace(/(`+)[^`]*\1/g, '')
}

function headingIds(source) {
  const ids = new Set()
  const duplicates = new Map()
  let fence = null
  for (const line of source.split(/\r?\n/)) {
    const mark = line.match(/^\s*(`{3,}|~{3,})/)
    if (mark) {
      if (!fence) fence = mark[1][0]
      else if (mark[1][0] === fence) fence = null
      continue
    }
    if (fence) continue
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/)
    if (!heading) continue
    const title = heading[1].replace(/<[^>]*>/g, '').replace(/[\*`~]/g, '').trim()
    const base = title.toLowerCase().replace(/[^\p{L}\p{N}\p{M}_ -]/gu, '').replace(/ /g, '-')
    if (!base) continue
    const number = duplicates.get(base) ?? 0
    duplicates.set(base, number + 1)
    ids.add(number ? base + '-' + number : base)
  }
  for (const [, , id] of source.matchAll(/<(?:a|span)\b[^>]*\b(?:id|name)=["']([^"']+)["'][^>]*>/gi)) {
    ids.add(id)
  }
  return ids
}

function localReferences(source) {
  const references = []
  let fence = null
  for (const [index, original] of source.split(/\r?\n/).entries()) {
    const mark = original.match(/^\s*(`{3,}|~{3,})/)
    if (mark) {
      if (!fence) fence = mark[1][0]
      else if (mark[1][0] === fence) fence = null
      continue
    }
    if (fence || /^ {4,}\S/.test(original)) continue
    const line = plainLine(original)
    const links = /(!?)\[[^\]]*\]\((<[^>]+>|[^)\n]+)\)/g
    for (const match of line.matchAll(links)) {
      const target = match[2].trim().replace(/^<([^>]+)>$/, '$1').split(/\s+["']/)[0].trim()
      if (target) references.push({ line: index + 1, target, image: match[1] === '!' })
    }
    const definition = line.match(/^\s{0,3}\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))/)
    if (definition && !definition[1].startsWith('^')) {
      references.push({ line: index + 1, target: definition[2] ?? definition[3], image: false })
    }
  }
  return references
}

export function checkDocumentation({ contentRoot, assetRoot, pageFiles }) {
  const errors = []
  const indexed = new Set(pageFiles.map((file) => file.toLowerCase()))
  const headings = new Map()
  for (const file of pageFiles) {
    const absolute = path.resolve(contentRoot, file)
    if (!inRoot(contentRoot, absolute)) {
      errors.push({ file, line: 0, reason: 'unsafe-page-path', target: file })
      continue
    }
    if (!fs.existsSync(absolute)) {
      errors.push({ file, line: 0, reason: 'missing-page-source', target: file })
      continue
    }
    const body = fs.readFileSync(absolute, 'utf8')
    headings.set(file.toLowerCase(), headingIds(body))
  }

  for (const file of pageFiles) {
    const absolute = path.resolve(contentRoot, file)
    if (!inRoot(contentRoot, absolute) || !fs.existsSync(absolute)) continue
    const references = localReferences(fs.readFileSync(absolute, 'utf8'))
    for (const { line, target, image } of references) {
      if (target.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(target)) continue
      const [raw, hash] = target.split('#', 2)
      let localPath, anchor
      try {
        localPath = decodeURIComponent(raw.split('?')[0])
        anchor = hash ? decodeURIComponent(hash) : null
      } catch {
        errors.push({ file, line, reason: 'invalid-uri', target })
        continue
      }
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), localPath || '.'))
      const ext = path.posix.extname(resolved).toLowerCase()
      const targetFile = localPath ? resolved : file
      if (image || IMAGE_EXTENSIONS.has(ext)) {
        const asset = path.resolve(assetRoot, resolved)
        if (!inRoot(assetRoot, asset) || !fs.existsSync(asset)) {
          errors.push({ file, line, reason: 'missing-asset', target })
        }
      } else if (ext === '.md' || ext === '.markdown' || !localPath) {
        const docFile = path.resolve(contentRoot, targetFile)
        if (!inRoot(contentRoot, docFile) || !fs.existsSync(docFile)) {
          errors.push({ file, line, reason: 'missing-page-source', target })
          continue
        }
        if (!indexed.has(targetFile.toLowerCase())) {
          errors.push({ file, line, reason: 'unregistered-page', target })
          continue
        }
        if (anchor && !headings.get(targetFile.toLowerCase())?.has(anchor.toLowerCase())) {
          errors.push({ file, line, reason: 'missing-heading', target })
        }
      } else {
        const plainFile = path.resolve(contentRoot, resolved)
        if (!inRoot(contentRoot, plainFile) || !fs.existsSync(plainFile)) {
          errors.push({ file, line, reason: 'unresolved-relative-link', target })
        }
      }
    }
  }
  return errors
}

function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url))
  const packageRoot = path.resolve(scriptDir, '..')
  const contentRoot = path.join(packageRoot, 'content', 'docs')
  const assetRoot = path.join(packageRoot, 'public', 'docs')
  const navSource = fs.readFileSync(path.join(packageRoot, 'src', 'lib', 'docs-nav.ts'), 'utf8')
  const pages = registeredDocFiles(navSource)
  const errors = checkDocumentation({ contentRoot, assetRoot, pageFiles: pages })
  if (errors.length) {
    for (const error of errors) {
      console.error('[docs] ' + error.file + ':' + error.line + ' ' + error.reason + ': ' + error.target)
    }
    process.exitCode = 1
  } else {
    console.log('[docs] verified ' + pages.length + ' registered pages, local links, assets and heading anchors')
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
