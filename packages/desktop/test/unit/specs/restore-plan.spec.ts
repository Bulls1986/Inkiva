import { describe, expect, it } from 'vitest'
import {
  buildRestorePlan,
  migrateRestoreState,
  type RecoverySource
} from 'main_renderer/session/restorePlan'

const source = (id: string): RecoverySource => ({
  id,
  filePath: `/tmp/inkiva-states/${id}_editor_buffer_store.json`
})

describe('restore plan', () => {
  it('reads, migrates, validates, canonicalizes, deduplicates, and filters before UI creation', async() => {
    const payloads = new Map<string, unknown>([
      [
        'a-dirty',
        {
          editor: {
            currentFileId: 'dirty',
            tabs: [
              {
                id: 'dirty',
                pathname: 'c:/Docs/Note.md',
                markdown: '# Unsaved',
                isSaved: false
              },
              { id: 42, pathname: 'c:/Docs/invalid.md', markdown: 'skip me' }
            ]
          },
          project: { rootDirectory: 'c:/Docs/.' }
        }
      ],
      [
        'b-clean',
        {
          currentFileId: 'clean',
          tabs: [
            {
              id: 'clean',
              pathname: 'C:\\Docs\\Note.md',
              markdown: '# On disk',
              isSaved: true
            },
            { id: 'second', pathname: 'C:/Docs/Second.md', markdown: '# Second' }
          ]
        }
      ]
    ])

    const plan = await buildRestorePlan(
      [source('corrupt'), source('b-clean'), source('a-dirty')],
      async({ id }) => {
        if (id === 'corrupt') throw new Error('invalid JSON')
        return payloads.get(id)
      },
      { platform: 'win32' }
    )

    expect(plan.kind).toBe('restore')
    expect(plan.windows).toHaveLength(1)
    expect(plan.windows[0]?.tabs.map(({ canonicalPath }) => canonicalPath)).toEqual([
      'C:\\Docs\\Note.md',
      'C:\\Docs\\Second.md'
    ])
    expect(plan.windows[0]?.activeTab).toBe('dirty')
    expect(plan.state?.tabs.map(({ markdown }) => markdown)).toEqual(['# Unsaved', '# Second'])
    expect(plan.state?.project).toEqual({ rootDirectory: 'C:\\Docs' })
    expect(plan.sources.map(({ id }) => id)).toEqual(['a-dirty', 'b-clean'])
    expect(plan.skippedSources).toEqual([
      expect.objectContaining({ id: 'corrupt', reason: 'read-failed' })
    ])
  })

  it('returns a blank plan when every recovery source is corrupt', async() => {
    const plan = await buildRestorePlan([source('broken')], async() => {
      throw new Error('invalid JSON')
    })

    expect(plan.kind).toBe('blank')
    expect(plan.windows).toEqual([])
    expect(plan.state).toBeNull()
    expect(plan.skippedSources).toEqual([
      expect.objectContaining({ id: 'broken', reason: 'read-failed' })
    ])
  })

  it('filters an empty recovery state before creating the editor window', async() => {
    const plan = await buildRestorePlan([source('empty')], async() => ({ tabs: [] }))

    expect(plan.kind).toBe('blank')
    expect(plan.skippedSources).toEqual([
      expect.objectContaining({ id: 'empty', reason: 'invalid-state' })
    ])
  })

  it('migrates the legacy nested editor state without throwing', () => {
    expect(
      migrateRestoreState({ editor: { tabs: [], currentFileId: null }, project: null })
    ).toEqual({ tabs: [], currentFileId: null, project: null })
  })
})
