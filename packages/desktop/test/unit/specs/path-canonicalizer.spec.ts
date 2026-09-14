import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { canonicalizePath, canonicalPathKey } from 'main_renderer/session/pathCanonicalizer'

describe('session path canonicalization', () => {
  it('treats Windows separators, case, and dot segments as the same path', () => {
    const first = canonicalizePath('C:\\Docs\\Notes\\..\\Draft.md', 'win32')
    const second = canonicalizePath('c:/docs/draft.md', 'win32')

    expect(first.key).toBe(second.key)
    expect(first.path).toBe('C:\\Docs\\Draft.md')
  })

  it('does not collapse case-sensitive POSIX paths', () => {
    expect(canonicalPathKey('/tmp/Inkiva.md', 'linux')).not.toBe(
      canonicalPathKey('/tmp/inkiva.md', 'linux')
    )
  })

  it('resolves a relative path against the selected platform', () => {
    expect(canonicalizePath('./notes/../README.md', 'linux').path).toBe(
      path.posix.resolve('./notes/../README.md')
    )
  })
})
