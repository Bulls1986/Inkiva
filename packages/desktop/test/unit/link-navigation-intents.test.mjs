import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LinkNavigationIntents } from '../../src/main/windows/linkNavigationIntents.ts'

test('LINK-AC06: second click targeting an in-flight file wins exactly once', () => {
  const pending = new LinkNavigationIntents()
  pending.request('guide.md', 'old-heading')
  pending.request('guide.md', 'new-heading')
  assert.equal(pending.consume('guide.md'), 'new-heading')
  assert.equal(pending.consume('guide.md'), null)
})

test('LINK-AC06: newest click carries its own source revision across in-flight load', () => {
  const pending = new LinkNavigationIntents()
  pending.request('guide.md', 'first-heading', { documentId: 'source', revision: 3 })
  pending.request('guide.md', 'second-heading', { documentId: 'source', revision: 4 })
  assert.deepEqual(pending.consumeRequest('guide.md'), {
    fragment: 'second-heading',
    sourceDocumentId: 'source',
    sourceRevision: 4
  })
  assert.equal(pending.consumeRequest('guide.md'), null)
})

test('LINK-AC06: later target takes precedence over slow earlier file loading', () => {
  const pending = new LinkNavigationIntents()
  pending.request('a.md', 'old')
  pending.request('b.md', 'new')
  assert.equal(pending.consume('a.md'), null)
  assert.equal(pending.consume('b.md'), 'new')
})

test('LINK-AC06: an explicit non-link open invalidates deferred navigation', () => {
  const pending = new LinkNavigationIntents()
  pending.request('a.md', 'old')
  pending.supersede()
  assert.equal(pending.consume('a.md'), null)
  pending.request('b.md', 'ready')
  pending.discard('b.md')
  assert.equal(pending.consume('b.md'), null)
  pending.request('c.md', 'pending')
  pending.clear()
  assert.equal(pending.consume('c.md'), null)
})
