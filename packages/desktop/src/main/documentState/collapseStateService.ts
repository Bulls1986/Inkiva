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
export const rekeyAfterAppSave = async(
  pathname: string,
  previousIdentity: string | null
): Promise<void> => {
  if (!previousIdentity) return
  const nextIdentity = await fileIdentity(pathname)
  if (!nextIdentity || nextIdentity === previousIdentity) return
  await getCollapseStateStore().rekey(previousIdentity, nextIdentity)
}
