/**
 * Typed contract for cross-session heading collapse state (v0.7.0 F5/F6).
 *
 * The main process owns the store; renderer windows only ask for and update the
 * record of a document. Records are keyed by file identity, so a path alone can
 * never revive state for a file that was replaced.
 */

export const COLLAPSE_STATE_CHANNELS = {
  load: 'mt::collapse-state::load',
  save: 'mt::collapse-state::save',
  clear: 'mt::collapse-state::clear',
  /** Synchronous, used only by the window's quit flush. */
  saveSync: 'mt::collapse-state::save-sync',
  /** A write deferred while a record read was open; merged on quit. */
  stage: 'mt::collapse-state::stage'
} as const

export interface CollapseHeadingRecordPayload {
  key: string
  level: number
  /** Heading text: the cross-session identity. */
  text: string
  collapsed: boolean
  /** Ancestor heading texts, outermost first. */
  ancestors: string[]
}

export interface CollapseStateRecordPayload {
  version: number
  identity: string
  headings: CollapseHeadingRecordPayload[]
  updatedAt: number
}
