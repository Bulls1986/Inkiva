export interface InputParseProbeOptions {
  enabled: boolean
  now: () => number
  record: (durationMs: number) => void
}

export interface InputParseProbe {
  readonly begin: () => void
  finish: () => number | undefined
  cancel: () => void
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

export const createInputParseProbe = (
  options: InputParseProbeOptions
): InputParseProbe => {
  let startedAt: number | undefined

  const begin = (): void => {
    if (!options.enabled) return
    const now = options.now()
    if (!isFiniteNumber(now)) return
    startedAt = now
  }

  const finish = (): number | undefined => {
    if (!options.enabled || startedAt === undefined) return undefined

    const start = startedAt
    startedAt = undefined
    const now = options.now()
    if (!isFiniteNumber(now) || now < start) return undefined

    const durationMs = now - start
    options.record(durationMs)
    return durationMs
  }

  const cancel = (): void => {
    startedAt = undefined
  }

  return { begin, finish, cancel }
}
