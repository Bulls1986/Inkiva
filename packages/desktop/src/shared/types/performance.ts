/**
 * Shared performance trace contract for the main and renderer processes.
 *
 * This is a JSON-safe contract plus boundary validation helpers. A trace can
 * be collected without telemetry and written as a local artifact when
 * performance capture is explicitly enabled.
 */

export const PERFORMANCE_TRACE_SCHEMA_VERSION = 1 as const

export const PERFORMANCE_EVENT_CHANNEL = 'mt::performance-event' as const

export const PERFORMANCE_MAX_IDENTIFIER_LENGTH = 128
export const PERFORMANCE_MAX_METADATA_ENTRIES = 32
export const PERFORMANCE_MAX_METADATA_KEY_LENGTH = 128
export const PERFORMANCE_MAX_METADATA_STRING_LENGTH = 1_024
export const PERFORMANCE_MAX_METADATA_SERIALIZED_LENGTH = 4_096
export const PERFORMANCE_MAX_EVENT_SERIALIZED_LENGTH = 16_384

export const PERFORMANCE_EVENT_NAMES = [
  // Main-process startup
  'process_entry',
  'electron_ready',
  'create_window_start',
  'browser_window_created',
  'load_url_start',
  // Renderer startup
  'renderer_bootstrap_start',
  'initial_state_received',
  'theme_applied',
  'app_shell_mounted',
  'editor_shell_mounted',
  // Document/editor work
  'document_open_start',
  'muya_init_start',
  'muya_init_end',
  'first_editor_interactive',
  'document_editable',
  // Runtime signals
  'long_task',
  'metric_sample'
] as const

export type PerformanceEventName = (typeof PERFORMANCE_EVENT_NAMES)[number]
export type PerformanceSampleUnit = 'ms' | 'count' | 'bytes' | 'ratio'
export type PerformanceProcess = 'main' | 'renderer'
export type PerformancePhase =
  | 'startup'
  | 'document-open'
  | 'editor'
  | 'diagram'
  | 'search'
  | 'autosave'
  | 'memory'

export type PerformanceMetadataValue = string | number | boolean | null
export type PerformanceMetadata = Record<string, PerformanceMetadataValue>

export interface PerformanceEvent {
  schemaVersion: typeof PERFORMANCE_TRACE_SCHEMA_VERSION
  name: PerformanceEventName
  process: PerformanceProcess
  phase: PerformancePhase
  traceId: string
  operationId?: string
  documentId?: string
  timestampEpochMs: number
  elapsedMs?: number
  durationMs?: number
  metadata?: PerformanceMetadata
}

export interface PerformanceTrace {
  schemaVersion: typeof PERFORMANCE_TRACE_SCHEMA_VERSION
  traceId: string
  process: PerformanceProcess
  startedAtEpochMs: number
  timeOriginEpochMs: number
  events: PerformanceEvent[]
  environment?: PerformanceMetadata
}

export interface PerformanceReport {
  schemaVersion: typeof PERFORMANCE_TRACE_SCHEMA_VERSION
  generatedAtEpochMs: number
  traces: PerformanceTrace[]
}

export interface PerformanceBootInfo {
  enabled: boolean
  traceId: string
  mainTimeOriginEpochMs: number
}

const PERFORMANCE_PHASES: ReadonlySet<PerformancePhase> = new Set([
  'startup',
  'document-open',
  'editor',
  'diagram',
  'search',
  'autosave',
  'memory'
])

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

export const isPerformanceEventName = (value: unknown): value is PerformanceEventName =>
  typeof value === 'string' && (PERFORMANCE_EVENT_NAMES as readonly string[]).includes(value)

export const isPerformancePhase = (value: unknown): value is PerformancePhase =>
  typeof value === 'string' && PERFORMANCE_PHASES.has(value as PerformancePhase)

export const isPerformanceSampleUnit = (value: unknown): value is PerformanceSampleUnit =>
  value === 'ms' || value === 'count' || value === 'bytes' || value === 'ratio'

export const sanitizePerformanceIdentifier = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 && value.length <= PERFORMANCE_MAX_IDENTIFIER_LENGTH
    ? value
    : undefined

const isMetadataRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const sanitizePerformanceMetadataValue = (value: unknown): PerformanceMetadataValue | undefined => {
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'number') return isFiniteNumber(value) ? value : undefined
  if (typeof value === 'string') {
    return value.slice(0, PERFORMANCE_MAX_METADATA_STRING_LENGTH)
  }
  return undefined
}

/**
 * Keep diagnostic metadata flat, JSON-safe, and bounded before it crosses an
 * IPC boundary or enters a local report. Accessors and proxies are treated as
 * untrusted input because renderer diagnostics are not an application data
 * channel.
 */
export const sanitizePerformanceMetadata = (value: unknown): PerformanceMetadata | undefined => {
  if (!isMetadataRecord(value)) return undefined

  let keys: string[]
  try {
    keys = Object.keys(value)
  } catch {
    return undefined
  }

  const metadata: PerformanceMetadata = {}
  let acceptedEntries = 0

  for (const key of keys) {
    if (acceptedEntries >= PERFORMANCE_MAX_METADATA_ENTRIES) break
    if (
      key.length === 0 ||
      key.length > PERFORMANCE_MAX_METADATA_KEY_LENGTH ||
      key === '__proto__' ||
      key === 'constructor' ||
      key === 'prototype'
    ) {
      continue
    }

    let candidate: unknown
    try {
      candidate = value[key]
    } catch {
      continue
    }

    const safeValue = sanitizePerformanceMetadataValue(candidate)
    if (safeValue === undefined) continue

    let serializedLength: number
    try {
      serializedLength = JSON.stringify({ ...metadata, [key]: safeValue }).length
    } catch {
      continue
    }
    if (serializedLength > PERFORMANCE_MAX_METADATA_SERIALIZED_LENGTH) continue

    Object.defineProperty(metadata, key, {
      configurable: true,
      enumerable: true,
      value: safeValue,
      writable: true
    })
    acceptedEntries += 1
  }

  return acceptedEntries > 0 ? metadata : undefined
}

export interface PerformanceEventValidationOptions {
  expectedProcess?: PerformanceProcess
  expectedTraceId?: string
}

/**
 * Normalize untrusted event-shaped data at the main-process IPC boundary.
 * Invalid optional fields are rejected rather than allowed to enter the
 * report store; metadata values are normalized by the same bounded helper
 * used by the recorders.
 */
export const normalizePerformanceEvent = (
  value: unknown,
  options: PerformanceEventValidationOptions = {}
): PerformanceEvent | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined

  try {
    const candidate = value as Record<string, unknown>
    if (candidate.schemaVersion !== PERFORMANCE_TRACE_SCHEMA_VERSION) return undefined
    if (candidate.process !== 'main' && candidate.process !== 'renderer') return undefined
    if (options.expectedProcess !== undefined && candidate.process !== options.expectedProcess) {
      return undefined
    }
    if (!isPerformanceEventName(candidate.name) || !isPerformancePhase(candidate.phase)) {
      return undefined
    }

    const traceId = sanitizePerformanceIdentifier(candidate.traceId)
    if (
      !traceId ||
      (options.expectedTraceId !== undefined && traceId !== options.expectedTraceId)
    ) {
      return undefined
    }
    if (!isFiniteNumber(candidate.timestampEpochMs)) return undefined

    const event: PerformanceEvent = {
      schemaVersion: PERFORMANCE_TRACE_SCHEMA_VERSION,
      name: candidate.name,
      process: candidate.process,
      phase: candidate.phase,
      traceId,
      timestampEpochMs: candidate.timestampEpochMs
    }

    for (const key of ['operationId', 'documentId'] as const) {
      if (candidate[key] === undefined) continue
      const identifier = sanitizePerformanceIdentifier(candidate[key])
      if (identifier === undefined) return undefined
      event[key] = identifier
    }

    for (const key of ['elapsedMs', 'durationMs'] as const) {
      if (candidate[key] === undefined) continue
      if (!isFiniteNumber(candidate[key]) || candidate[key] < 0) return undefined
      event[key] = candidate[key]
    }

    if (candidate.metadata !== undefined) {
      const metadata = sanitizePerformanceMetadata(candidate.metadata)
      if (metadata === undefined) return undefined
      event.metadata = metadata
    }

    if (JSON.stringify(event).length > PERFORMANCE_MAX_EVENT_SERIALIZED_LENGTH) return undefined
    return event
  } catch {
    return undefined
  }
}
