import { describe, expect, it } from 'vitest'
import { isMarkdownQuickOpenPath, mergeQuickOpenPathGroups } from '@/commands/quickOpen'

describe('standard Markdown Quick Open priority', () => {
  it('keeps opened documents ahead of recent and indexed candidates', () => {
    expect(
      mergeQuickOpenPathGroups(
        [
          ['/docs/open.md'],
          ['/docs/recent.md', '/docs/open.md'],
          ['/docs/indexed.md', '/docs/recent.md']
        ],
        10
      )
    ).toEqual(['/docs/open.md', '/docs/recent.md', '/docs/indexed.md'])
  })

  it('limits the merged result after de-duplication', () => {
    expect(
      mergeQuickOpenPathGroups(
        [['/docs/open-a.md', '/docs/open-b.md'], ['/docs/recent.md'], ['/docs/indexed.md']],
        2
      )
    ).toEqual(['/docs/open-a.md', '/docs/open-b.md'])
  })

  it('accepts Markdown extensions and rejects non-document paths', () => {
    expect(isMarkdownQuickOpenPath('/docs/readme.md')).toBe(true)
    expect(isMarkdownQuickOpenPath('/docs/readme.markdown')).toBe(true)
    expect(isMarkdownQuickOpenPath('/docs/image.png')).toBe(false)
  })
})
