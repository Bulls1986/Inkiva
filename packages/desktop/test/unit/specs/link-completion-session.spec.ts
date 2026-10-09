import { describe, expect, it } from 'vitest'
import { LinkCompletionSession } from '@/services/linkCompletion'

describe('V06-03 link completion selection', () => {
  it('allows a manual link destination without a workspace and never spins forever', async() => {
    const lookup = async() => {
      throw new Error('No filesystem lookup is allowed without a workspace')
    }
    const session = new LinkCompletionSession(lookup)
    session.invalidate()
    await session.search('https://example.com')
    expect(session.loading).toBe(false)
    expect(session.candidates).toEqual([])
    expect(session.error).toBeNull()
  })

  it('drops delayed old-document searches and cannot commit while composing', async() => {
    let finishOld!: (entries: Array<{ pathname: string; relativePath: string }>) => void
    const firstResult = new Promise<Array<{ pathname: string; relativePath: string }>>((resolve) => {
      finishOld = resolve
    })
    const session = new LinkCompletionSession(async(source) =>
      source === '/one.md'
        ? firstResult
        : [{ pathname: '/docs/two.md', relativePath: './docs/two.md' }])

    session.open('/one.md', 'doc-one')
    const pending = session.search('one')
    session.open('/two.md', 'doc-two')
    await session.search('two')
    finishOld([{ pathname: '/docs/one.md', relativePath: './docs/one.md' }])
    await pending
    expect(session.candidates.map(({ pathname }) => pathname)).toEqual(['/docs/two.md'])

    session.setComposing(true)
    expect(session.choose(0, 'doc-two', '/two.md')).toBeNull()
    session.setComposing(false)
    expect(session.choose(0, 'doc-one', '/one.md')).toBeNull()
    expect(session.choose(0, 'doc-two', '/two.md')?.relativePath).toBe('./docs/two.md')
    session.invalidate()
    expect(session.choose(0, 'doc-two', '/two.md')).toBeNull()
    await session.search('two')
    expect(session.choose(0, 'doc-two', '/two.md')?.relativePath).toBe('./docs/two.md')
    session.cancel()
    expect(session.choose(0, 'doc-two', '/two.md')).toBeNull()
  })
})
