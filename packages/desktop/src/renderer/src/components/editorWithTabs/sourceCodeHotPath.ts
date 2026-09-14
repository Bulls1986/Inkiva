import {
  EditorSnapshotScheduler,
  type EditorSnapshotSchedulerOptions
} from './editorHotPath'

export interface SourceSnapshotSchedulerOptions extends EditorSnapshotSchedulerOptions {}

/**
 * Source mode has a full CodeMirror document, but reading it on every keypress
 * is an O(document-size) operation. Keep the source-specific revision attached
 * to the coalesced snapshot so dirty state is immediate while serialization is
 * deferred.
 */
export class SourceSnapshotScheduler {
  private readonly scheduler: EditorSnapshotScheduler

  constructor(options: SourceSnapshotSchedulerOptions = {}) {
    this.scheduler = new EditorSnapshotScheduler(options)
  }

  request(
    id: string,
    revision: number,
    capture: (revision: number) => void,
    immediate = false
  ): void {
    this.scheduler.request(id, () => capture(revision), immediate)
  }

  flush(id: string): void {
    this.scheduler.flush(id)
  }

  cancel(id?: string): void {
    this.scheduler.cancel(id)
  }

  dispose(): void {
    this.scheduler.dispose()
  }
}
