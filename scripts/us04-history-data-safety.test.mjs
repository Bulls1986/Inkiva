import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('US04 restore requires a retained rollback point and byte-faithful snapshot restore', () => {
  const service = read('packages/desktop/src/main/documentIntelligence/localHistoryService.ts')
  const sharedTypes = read('packages/desktop/src/shared/types/documentIntelligence.ts')
  const rendererStore = read('packages/desktop/src/renderer/src/store/documentIntelligence.ts')

  assert.match(service, /LocalHistoryRollbackUnavailableError/)
  assert.match(service, /rollback\.id/)
  assert.match(service, /await this\.store\.read\(request\.filePath, rollback\.id\)/)
  assert.match(service, /encodeSnapshotForRestore/)
  assert.match(sharedTypes, /isBom\?: boolean/)
  assert.match(rendererStore, /isBom: tab\.encoding\.isBom/)
})
