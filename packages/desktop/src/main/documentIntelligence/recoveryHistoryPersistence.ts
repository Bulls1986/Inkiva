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

export class RecoveryHistorySnapshotUnavailableError extends Error {
  constructor(filePath: string) {
    super(`Recovery replacement refused because no retained history snapshot is available: ${filePath}`)
    this.name = 'RecoveryHistorySnapshotUnavailableError'
  }
}

export const createRecoveryHistoryPersistence: RecoveryHistoryPersistenceFactory = (
  userDataPath
) => {
  const service = new DocumentIntelligenceService({
    historyRootPath: path.join(userDataPath, 'local-history')
  })

  return {
    async createSnapshot(input): Promise<void> {
      const snapshot = await service.createSnapshot(input)
      const retainedSnapshot = await service.getSnapshot(input.filePath, snapshot.id)
      if (!retainedSnapshot) {
        throw new RecoveryHistorySnapshotUnavailableError(input.filePath)
      }
    }
  }
}
