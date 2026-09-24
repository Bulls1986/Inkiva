import { ref } from 'vue'
import type { PreferenceChangeHandler } from './types'

export const usePreferenceMutation = <T>(handler: () => PreferenceChangeHandler<T>) => {
  const error = ref('')
  const saved = ref(false)
  const hasAttempt = ref(false)
  let attemptedValue: T

  const commit = async(value: T): Promise<void> => {
    attemptedValue = value
    hasAttempt.value = true
    const result = await handler()(value)
    error.value = result && result.ok === false ? result.error : ''
    saved.value = !error.value
  }

  const retry = (): void => {
    if (hasAttempt.value) {
      void commit(attemptedValue)
    }
  }

  return { error, saved, commit, retry }
}
