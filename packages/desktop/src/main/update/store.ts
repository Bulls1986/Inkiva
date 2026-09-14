import Store from 'electron-store'
import type { UpdateCheckStore } from './types'

interface UpdateStoreSchema {
  lastSuccessfulUpdateCheck?: number
}

let store: Store<UpdateStoreSchema> | undefined

const getStore = (): Store<UpdateStoreSchema> => {
  store ??= new Store<UpdateStoreSchema>({ name: 'update-state' })
  return store
}

export class ElectronUpdateCheckStore implements UpdateCheckStore {
  get(): number | undefined {
    return getStore().get('lastSuccessfulUpdateCheck')
  }

  set(value: number): void {
    getStore().set('lastSuccessfulUpdateCheck', value)
  }
}
