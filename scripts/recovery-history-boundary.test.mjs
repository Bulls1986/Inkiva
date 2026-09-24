import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('recovery center persists rollback history through a narrow external boundary', () => {
  const boundaryPath =
    '../packages/desktop/src/main/documentIntelligence/recoveryHistoryPersistence.ts'
  const boundaryUrl = new URL(boundaryPath, import.meta.url)

  assert.equal(
    existsSync(boundaryUrl),
    true,
    'Recovery Center history persistence must be owned by an explicit external boundary'
  )

  const recoveryCenter = read('packages/desktop/src/main/session/recoveryCenter.ts')
  const boundary = read('packages/desktop/src/main/documentIntelligence/recoveryHistoryPersistence.ts')

  assert.doesNotMatch(recoveryCenter, /DocumentIntelligenceService/)
  assert.doesNotMatch(recoveryCenter, /local-history/)
  assert.match(recoveryCenter, /RecoveryHistoryPersistenceFactory/)
  assert.match(recoveryCenter, /createRecoveryHistoryPersistence/)

  assert.match(boundary, /interface RecoveryHistoryPersistence/)
  assert.match(boundary, /DocumentIntelligenceService/)
  assert.match(boundary, /historyRootPath:\s*path\.join\(userDataPath, 'local-history'\)/)
  assert.match(boundary, /createSnapshot/)
})
