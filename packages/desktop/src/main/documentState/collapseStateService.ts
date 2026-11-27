import path from 'node:path'
import { app } from 'electron'
import { writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { promises as fs } from 'node:fs'

import { CollapseStateStore, fileIdentity } from './collapseStateStore'

/**
 * Application-wide collapse-state store.
 *
 * It lives here rather than in the IPC layer because the file write path also
 * needs it: an app-initiated atomic save replaces the inode, and the record for
 * that document has to follow the file it just wrote.
 */
let store: CollapseStateStore | null = null

export const getCollapseStateStore = (): CollapseStateStore => {
  if (!store) {
    store = new CollapseStateStore({
      filePath: path.join(app.getPath('userData'), 'collapse-state.json'),
      readFile: (filePath) => fs.readFile(filePath, 'utf8'),
      writeFile: (filePath, text) => {
        // Synchronous on purpose: the write happens while main handles the IPC
        // message, so collapsing and quitting immediately cannot lose it. The
        // record is tiny and this never runs on an editor hot path.
        mkdirSync(path.dirname(filePath), { recursive: true })
        const temp = filePath + '.tmp'
        writeFileSync(temp, text)
        renameSync(temp, filePath)
        return Promise.resolve()
      },
      identity: fileIdentity
    })
  }
  return store
}

/**
 * Keep a document's collapse record attached across an application save.
 *
 * write-file-atomic replaces the file, so the identity changes even though the
 * user saved the same document. Only the identity pair of that one write is
 * migrated; nothing is inferred from a path, and if either side is unknown the
 * record is left alone (the document then opens expanded).
 */
export interface RekeyDeps {
  identity(path: string): Promise<string | null>
  rekey(previous: string, next: string): Promise<void>
}

/**
 * Decide whether the record may follow an application save.
 *
 * `capturedIdentity` was read before the write and `identityAtWrite` right
 * before it. They must exist and be equal: a difference means the file was
 * replaced externally in that window, so the record belongs to a document that is
 * no longer at this path and must not be adopted by the new one.
 */
export const rekeyIfSameDocument = async(
  pathname: string,
  capturedIdentity: string | null,
  identityAtWrite: string | null,
  deps: RekeyDeps
): Promise<boolean> => {
  if (!capturedIdentity || capturedIdentity !== identityAtWrite) return false
  const nextIdentity = await deps.identity(pathname)
  if (!nextIdentity || nextIdentity === capturedIdentity) return false
  await deps.rekey(capturedIdentity, nextIdentity)
  return true
}

export const rekeyAfterAppSave = async(
  pathname: string,
  capturedIdentity: string | null,
  identityAtWrite: string | null
): Promise<void> => {
  await rekeyIfSameDocument(pathname, capturedIdentity, identityAtWrite, {
    identity: fileIdentity,
    rekey: (previous, next) => getCollapseStateStore().rekey(previous, next)
  })
}
