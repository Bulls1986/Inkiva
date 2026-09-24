export interface RecoveryCenterItem {
  id: string
  kind: 'revision' | 'damaged-source'
  title: string
  pathname: string
  sourcePath: string
  recoveryMarkdown: string | null
  diskMarkdown: string | null
  diskRevision: string | null
  savedAt: number | null
  differsFromDisk: boolean
  error: string | null
}

export interface RecoveryCenterState {
  safeMode: boolean
  items: RecoveryCenterItem[]
}

export interface RecoveryOpenResult {
  markdown: string
  sourcePath: string
}

export type RecoveryReplaceResult =
  | { ok: true }
  | {
    ok: false
    reason: 'external-change' | 'unavailable'
    diskMarkdown?: string | null
    diskRevision?: string | null
    message?: string
  }
