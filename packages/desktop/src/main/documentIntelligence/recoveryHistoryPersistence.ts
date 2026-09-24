import path from 'node:path'

import { DocumentIntelligenceService } from './documentIntelligenceService'

export interface RecoveryHistoryPersistence {
  createSnapshot(input: {
    filePath: string
    content: string
    reason: 'before-external-change'
  }): Promise<void>
}

export type RecoveryHistoryPersistenceFactory = (
  userDataPath: string
) => RecoveryHistoryPersistence

export const createRecoveryHistoryPersistence: RecoveryHistoryPersistenceFactory = (
  userDataPath
) => {
  const service = new DocumentIntelligenceService({
    historyRootPath: path.join(userDataPath, 'local-history')
  })

  return {
    async createSnapshot(input): Promise<void> {
      await service.createSnapshot(input)
    }
  }
}
