<template>
  <div
    class="editor-wrapper"
    :class="[{ typewriter: typewriter, focus: focus, source: sourceCode }]"
    :dir="textDirection"
  >
    <div
      ref="editorRef"
      class="editor-component"
    />
    <div
      v-show="imageViewerVisible"
      class="image-viewer"
    >
      <span
        class="icon-close"
        @click="setImageViewerVisible(false)"
      >
        <CloseIcon />
      </span>
      <div ref="imageViewerRef" />
    </div>
    <el-dialog
      v-model="dialogTableVisible"
      :show-close="isShowClose"
      :modal="true"
      class="ag-insert-table-dialog"
      width="454px"
      center
      dir="ltr"
    >
      <template #title>
        <div class="dialog-title">
          {{ t('editor.insertTable.title') }}
        </div>
      </template>
      <el-form
        :model="tableChecker"
        :inline="true"
      >
        <el-form-item :label="t('editor.insertTable.rows')">
          <el-input-number
            ref="rowInput"
            v-model="tableChecker.rows"
            size="mini"
            controls-position="right"
            :min="1"
            :max="30"
          />
        </el-form-item>
        <el-form-item :label="t('editor.insertTable.columns')">
          <el-input-number
            v-model="tableChecker.columns"
            size="mini"
            controls-position="right"
            :min="1"
            :max="20"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="dialogTableVisible = false">
            {{ t('common.cancel') }}
          </el-button>
          <el-button
            type="primary"
            @click="handleDialogTableConfirm"
          >
            {{ t('common.ok') }}
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onMounted, onBeforeUnmount, nextTick, markRaw, toRaw } from 'vue'
import log from 'electron-log'
import {
  Muya,
  CodeBlockLanguageSelector,
  EmojiSelector,
  FootnoteTool,
  ImageEditTool,
  ImagePathPicker,
  ImageResizeBar,
  ImageToolBar,
  InlineFormatToolbar,
  LinkTools,
  ParagraphFrontButton,
  ParagraphFrontMenu,
  ParagraphQuickInsertMenu,
  PreviewToolBar,
  TableChessboard,
  TableColumnToolbar,
  TableDragBar,
  TableRowColumMenu,
  CONTENT_SWITCH_PROGRESSIVE_RENDER_START_DELAY_MS,
  wordCount as muyaWordCount,
  en,
  de,
  es,
  fr,
  ja,
  ko,
  pt,
  tr,
  zhCN,
  zhTW,
  type ILocale
} from '@muyajs/core'
import { exportStyledHTML, type HeaderFooterPart } from '@/util/exportHtml'
import { applyCursor, isIndexCursor } from '@/util/cursor'
import bus, { type BusEvents } from '@/bus'
import type { Handler } from 'mitt'
import { DEFAULT_EDITOR_FONT_FAMILY, DEFAULT_CODE_FONT_FAMILY } from '@/config'
import notice from '@/services/notification'
import { DocumentEditorRuntime } from '@/services/documentEditorRuntime'
import Printer from '@/services/printService'
import { SpellcheckerLanguageCommand } from '@/commands'
import { SpellChecker } from '@/spellchecker'
import { isOsx, animatedScrollTo } from '@/util'
import { moveImageToFolder, uploadImage } from '@/util/fileSystem'
import { guessClipboardFilePath } from '@/util/clipboard'
import { dataUrlToFile } from '@/util/imageData'
import { getCssForOptions, getHtmlToc, type PdfCssOptions, type HtmlTocOptions } from '@/util/pdf'
import { resolveTocHeadingElement } from '@/util/tocNavigation'
import { createTocRefreshScheduler, createTocScrollSync } from '@/util/tocOutline'
import { createEditorLayoutReconciler } from '@/util/editorLayout'
import { createDocumentGeometryProjection } from '@/util/documentGeometry'
import { createRestoreInteractionFence } from '@/util/restoreInteractionFence'
import { addCommonStyle, setEditorWidth } from '@/util/theme'
import { usePreferencesStore } from '@/store/preferences'
import { useEditorStore } from '@/store/editor'
import { useProjectStore } from '@/store/project'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { getApplicationAppearance } from 'common/theme'
import { SyntheticHistory, type IFileHistoryLike } from './syntheticHistory'
import { isStaleEditorEvent } from './editorEventGuard'
import {
  EditorSnapshotScheduler,
  getEditorMutationPolicy,
  shouldCaptureEditorBlocks,
  type EditorSnapshotMode
} from './editorHotPath'
import { rendererPerformance, rendererPerformanceMonitor } from '@/services/performance/runtime'
import { createInputParseProbe } from '@/services/performance/inputParse'
import { scheduleEditorPerformanceMilestones } from './editorPerformanceMilestones'
import { markEditorScrollInteraction } from '@/services/editorInteraction'
import { BACKGROUND_PRIORITY, BackgroundTaskScheduler } from '@/util/backgroundScheduler'

// Importing the engine entrypoint auto-injects its editor CSS (the muya.ts
// module imports its stylesheets at load time). Inkiva owns the application
// appearance layer; the engine remains responsible for editor primitives.
import '@muyajs/core'
import { Close as CloseIcon } from '@element-plus/icons-vue'
import { type InputNumberInstance } from 'element-plus'

const { t } = useI18n()
const STANDAR_Y = 320

// Map the desktop language preference to the engine's bundled locale objects.
const MUYA_LOCALES: Record<string, ILocale> = {
  en,
  de,
  es,
  fr,
  ja,
  ko,
  pt,
  tr,
  'zh-CN': zhCN,
  'zh-TW': zhTW
}

const getMuyaLocale = (language: string): ILocale => MUYA_LOCALES[language] ?? en

// `Muya.use(...)` appends to the static `Muya.plugins` array, and every
// `init()` instantiates the full list. Registration is process-global, so guard
// it with a module-level flag — otherwise remounting this component in the same
// renderer (window reuse / HMR) would register duplicate plugins and spawn
// duplicate UI handlers. The per-plugin option closures (imageAction/jumpClick)
// only read app-singleton Pinia stores, so capturing them once is correct.
let muyaPluginsRegistered = false

// The `@muyajs/core` `Muya` surface is deliberately permissive (`[key: string]:
// any` in muya-core.d.ts); everything that crosses the editor boundary leans on
// it, so the instance handle stays `any` until the engine ships built typings.
type MuyaInstance = any

// The engine's `selection-change` / `json-change` payload. The consumed
// `@muyajs/core` declaration does not re-export this shape, so describe the
// fields the desktop reads (each is re-cast in the body); the index signature
// keeps the boundary permissive for anything not enumerated here.
interface MuyaChange {
  anchorPath?: Array<string | number>
  focusPath?: Array<string | number>
  anchorBlock?: { text?: string } | null
  focusBlock?: { text?: string } | null
  anchorBlockInfo?: { type?: string; functionType?: string } | null
  focusBlockInfo?: { type?: string; functionType?: string } | null
  affiliation?: EngineAffiliationEntry[]
  anchor?: { offset?: number } | null
  focus?: { offset?: number } | null
  cursorCoords?: { y?: number } | null
  formats?: SelectionFormatLike[]
  tocChanged?: boolean
  mutationKind?: 'text-only' | 'structural' | 'diagram'
  [key: string]: unknown
}

const props = defineProps<{
  markdown?: string
  cursor?: unknown
  textDirection: string
  platform?: string
}>()

// Get stores
const preferencesStore = usePreferencesStore()
const editorStore = useEditorStore()
const projectStore = useProjectStore()

// Use storeToRefs to extract reactive properties from the stores
const {
  // Preferences
  preferLooseListItem,
  autoPairBracket,
  autoPairMarkdownSyntax,
  autoPairQuote,
  bulletListMarker,
  orderListDelimiter,
  tabSize,
  listIndentation,
  frontmatterType,
  superSubScript,
  footnote,
  isHtmlEnabled,
  isGitlabCompatibilityEnabled,
  lineHeight,
  fontSize,
  paragraphSpacing,
  codeFontSize,
  codeFontFamily,
  codeBlockLineNumbers,
  trimUnnecessaryCodeBlockEmptyLines,
  editorFontFamily,
  hideQuickInsertHint,
  hideLinkPopup,
  autoCheck,
  editorLineWidth,
  wrapCodeBlocks,
  imageInsertAction,
  imagePreferRelativeDirectory,
  imageRelativeDirectoryBase,
  imageRelativeDirectoryName,
  imageFolderPath,
  theme,
  sequenceTheme,
  hideScrollbar,
  spellcheckerEnabled,
  spellcheckerNoUnderline,
  spellcheckerLanguage,
  language,

  // Edit modes
  typewriter,
  focus,
  sourceCode
} = storeToRefs(preferencesStore)

// Editor store refs
const { currentFile, tabs, listToc } = storeToRefs(editorStore)

// Project store refs
const { projectTree } = storeToRefs(projectStore)

// Component state
const defaultFontFamily = DEFAULT_EDITOR_FONT_FAMILY
const resolveEditorFont = (family: string): string =>
  family ? `${family}, ${defaultFontFamily}` : defaultFontFamily
const resolveCodeFont = (family: string): string => `${family}, ${DEFAULT_CODE_FONT_FAMILY}`
const selectionChange = ref<unknown>(null)
const editor = ref<MuyaInstance>(null)
const isShowClose = ref(false)
const dialogTableVisible = ref(false)
const imageViewerVisible = ref<boolean | null>(null)
const tableChecker = reactive({
  rows: 4,
  columns: 3
})

// Template refs
const editorRef = ref<HTMLDivElement | null>(null)
const imageViewerRef = ref<HTMLDivElement | null>(null)
const rowInput = ref<InputNumberInstance | null>(null)

// Non-reactive variables
let printer: Printer | null = null
let spellchecker: any = null
let switchLanguageCommand: SpellcheckerLanguageCommand | null = null
let imageViewer: SimpleImageViewer | null = null
let editorPerformanceGeneration = 0
// The engine has no `scroll` event; we listen on the scroll container directly.
let scrollHandler: ((e: Event) => void) | null = null
let scrollPerformanceEndTimer: ReturnType<typeof setTimeout> | null = null
let scrollPositionPersistTimer: ReturnType<typeof setTimeout> | null = null
let pendingScrollPosition: { id: string; scrollTop: number } | null = null
let tocScrollSync: ReturnType<typeof createTocScrollSync> | null = null
let editorLayoutReconciler: ReturnType<typeof createEditorLayoutReconciler> | null = null
let editorCompositionActive = false
type EditorCommandReadinessResolve = BusEvents['editor-command-readiness']['resolve']
interface PendingEditorCommandReadiness {
  documentId: string
  resolve: EditorCommandReadinessResolve
}
let editorCommandReadyDocumentId: string | null = null
const pendingEditorCommandReadiness = new Set<PendingEditorCommandReadiness>()

const rejectPendingEditorCommandReadiness = (): void => {
  for (const request of pendingEditorCommandReadiness) request.resolve(false)
  pendingEditorCommandReadiness.clear()
}

const invalidateEditorCommandContext = (nextDocumentId?: string): void => {
  editorCommandReadyDocumentId = null
  for (const request of pendingEditorCommandReadiness) {
    if (nextDocumentId && request.documentId === nextDocumentId) continue
    request.resolve(false)
    pendingEditorCommandReadiness.delete(request)
  }
}

const markEditorCompositionStart = (): void => {
  editorCompositionActive = true
  rejectPendingEditorCommandReadiness()
}
const markEditorCompositionEnd = (): void => { editorCompositionActive = false }

watch(
  () => currentFile.value?.id,
  (id, oldId) => {
    if (id !== oldId) invalidateEditorCommandContext(id)
  },
  { flush: 'sync' }
)
const tocRefreshScheduler = createTocRefreshScheduler()
function disposeEditorInstances (): void {
  if (imageViewer) {
    imageViewer.destroy()
    imageViewer = null
  }

  if (editor.value) {
    editor.value.destroy()
    editor.value = null
  }
}

function disposeEditorPresentationResources (): void {
  document.removeEventListener('keyup', keyup)

  // Engine `on(...)` listeners are torn down by Muya destroy. Runtime-owned
  // DOM listeners/timers/layout resources are released here as one ordered
  // group so Vue does not need to understand their individual lifecycle.
  const inputContainer = getScrollContainer()
  if (inputContainer) {
    for (const eventName of ['beforeinput', 'compositionend', 'paste'] as const) {
      inputContainer.removeEventListener(eventName, inputParseProbe.begin, true)
    }
    inputContainer.removeEventListener('compositionstart', markEditorCompositionStart, true)
    inputContainer.removeEventListener('compositionend', markEditorCompositionEnd, true)
  }
  rejectPendingEditorCommandReadiness()
  editorCommandReadyDocumentId = null
  inputParseProbe.cancel()

  if (scrollHandler && editor.value) {
    const container = getScrollContainer()
    container?.removeEventListener('scroll', scrollHandler)
  }
  scrollHandler = null

  flushPendingScrollPosition()

  if (scrollPerformanceEndTimer !== null) {
    clearTimeout(scrollPerformanceEndTimer)
    scrollPerformanceEndTimer = null
  }
  rendererPerformanceMonitor.endScroll()

  tocRefreshScheduler.cancel()
  editorLayoutReconciler?.destroy()
  editorLayoutReconciler = null
  tocScrollSync?.destroy()
  tocScrollSync = null

  clearPendingScrollRestore()
}

const editorRuntime = new DocumentEditorRuntime()
editorRuntime.registerDisposable(disposeEditorInstances)
editorRuntime.registerDisposable(disposeEditorPresentationResources)
const editorSnapshotScheduler = new EditorSnapshotScheduler()
editorRuntime.attachSnapshotScheduler(editorSnapshotScheduler)
const registerBusHandler = <K extends keyof BusEvents>(
  event: K,
  handler: Handler<BusEvents[K]>
): void => {
  bus.on(event, handler)
  editorRuntime.registerDisposable(() => bus.off(event, handler))
}
const inputParseProbe = createInputParseProbe({
  enabled: rendererPerformance.enabled,
  now: () => performance.now(),
  record: (duration) => {
    rendererPerformance.recordSample('parse.inputSync', 'ms', duration, {
      phase: 'editor'
    })
  }
})

const flushPendingScrollPosition = (): void => {
  if (scrollPositionPersistTimer !== null) {
    clearTimeout(scrollPositionPersistTimer)
    scrollPositionPersistTimer = null
  }
  const pending = pendingScrollPosition
  pendingScrollPosition = null
  if (pending) editorStore.updateScrollPosition(pending.id, pending.scrollTop)
}

const scheduleScrollPositionPersistence = (id: string, scrollTop: number): void => {
  pendingScrollPosition = { id, scrollTop }
  if (scrollPositionPersistTimer !== null) clearTimeout(scrollPositionPersistTimer)
  scrollPositionPersistTimer = setTimeout(() => {
    scrollPositionPersistTimer = null
    const pending = pendingScrollPosition
    pendingScrollPosition = null
    if (pending) editorStore.updateScrollPosition(pending.id, pending.scrollTop)
  }, 120)
}

const flushActiveEditor = () => {
  flushPendingScrollPosition()
  const id = currentFile.value?.id
  editor.value?.flush()
  if (id) editorRuntime.flushSnapshot(id)
}

const flushActiveEditorForSave = () => {
  flushPendingScrollPosition()
  const id = currentFile.value?.id
  editor.value?.flush()
  if (id) editorRuntime.flushSnapshot(id, 'persistence')
}

// A tab switch must persist the last queued edit before replacing the Muya
// document, but it does not need to deep-clone the whole block tree in the
// switch handler. Keep the Markdown/history snapshot and invalidate the
// reusable blocks cache; an idle snapshot can repopulate blocks later.
const flushActiveEditorForTabSwitch = () => {
  flushPendingScrollPosition()
  const id = currentFile.value?.id
  editor.value?.flush()
  if (id) editorRuntime.flushSnapshot(id, 'switch')
}

// Engine undo/redo state and the desktop save/dirty history are derived from
// the same authoritative document revision. Keep them in one revision snapshot
// so tab restore and dirty tracking cannot silently observe different content.
interface EditorHistoryRevisionSnapshot {
  engineHistory: unknown
  syntheticHistory: IFileHistoryLike
}

// The WYSIWYG caret captured the instant the user switches INTO source mode.
// Focus moves to CodeMirror while source mode is up, so by the time the tab is
// handed back (`replaceContent`) the live DOM selection no longer points into
// the muya tree. We stash the pre-source caret here and feed it to
// `replaceContent` as the rebuild boundary's restore-selection, so the first
// undo after the handoff returns the caret to where source mode was entered.
let preSourceModeSelection: unknown = null
// Source -> WYSIWYG handoff rebuilds Muya from the canonical Source snapshot.
// `replaceContent` emits a synchronous `json-change` while parsing that snapshot;
// that event is a presentation rebuild, not a new user mutation. Recording it
// would allocate a newer revision and serialize Muya's normalized Markdown back
// over the exact Source text (for example auto-closing an unfinished fence).
let suppressEditorMutationRecording = false

// Per-tab monotonic save-tracking id allocator. The synthetic history entry id
// is a MONOTONIC, never-reused id keyed on the live document content (see
// `syntheticHistory.ts`), NOT the engine undo-stack depth: depth is reused
// across distinct documents at the same stack height, which falsely showed a
// divergently re-edited tab as clean (Phase G — G6). Reset whenever the engine
// reloads the document via `setContent` (which clears the engine history), so
// the reloaded content is the id-0 baseline matching the store's seeded
// `lastSavedHistoryId: 0`.
const syntheticHistoryByTab = new Map<string, SyntheticHistory>()
const getSyntheticHistory = (id: string, baselineContent: string): SyntheticHistory => {
  let tracker = syntheticHistoryByTab.get(id)
  if (!tracker) {
    tracker = new SyntheticHistory(baselineContent)
    syntheticHistoryByTab.set(id, tracker)
  }
  return tracker
}
// Re-baseline a tab's id allocator to the given content (id 0). Called after
// `setContent` reloads the document so the freshly loaded content is clean.
const resetSyntheticHistory = (id: string, baselineContent: string): void => {
  syntheticHistoryByTab.set(id, new SyntheticHistory(baselineContent))
}
const makeSyntheticHistory = (id: string, content: string, revision: number): IFileHistoryLike => {
  return getSyntheticHistory(id, content).build(content, revision)
}

type EditorE2eMetrics = {
  setContentCalls: number
  setContentSources: EditorSetContentSource[]
  markdownSerializationCalls: number
  markdownSerializationRevisions: number[]
  activationPhaseDurations: Record<string, number[]>
}

const getEditorE2eMetrics = (): EditorE2eMetrics | null => {
  if (window.electron?.process?.env?.PERF_TESTING !== 'true') return null

  const globalState = globalThis as typeof globalThis & {
    __inkiva_e2e_editor_metrics__?: EditorE2eMetrics
  }
  const metrics = (globalState.__inkiva_e2e_editor_metrics__ ??= {
    setContentCalls: 0,
    setContentSources: [],
    markdownSerializationCalls: 0,
    markdownSerializationRevisions: [],
    activationPhaseDurations: {}
  })
  metrics.activationPhaseDurations ??= {}
  return metrics
}

const recordEditorActivationPhase = (phase: string, durationMs: number): void => {
  const metrics = getEditorE2eMetrics()
  if (!metrics) return
  const samples = (metrics.activationPhaseDurations[phase] ??= [])
  samples.push(Math.max(0, durationMs))
}

function measureEditorActivationPhase<T> (phase: string, action: () => T): T {
  if (window.electron?.process?.env?.PERF_TESTING !== 'true') return action()
  const startedAt = performance.now()
  try {
    return action()
  } finally {
    recordEditorActivationPhase(phase, performance.now() - startedAt)
  }
}

const editorUiPluginScheduler = new BackgroundTaskScheduler({
  onError: (error) => {
    log.error('Deferred Muya UI plugin initialization failed', error)
  },
  onSlice: (task, durationMs) => {
    recordEditorActivationPhase('muya-ui-plugin-slice', durationMs)
    if (!rendererPerformance.enabled) return
    rendererPerformance.recordSample('background.taskSlice', 'ms', durationMs, {
      phase: 'editor',
      metadata: { task: task.id, priority: task.priority }
    })
  }
})
editorRuntime.registerDisposable(() => editorUiPluginScheduler.close())
let editorUiPluginsReady = false

const scheduleEditorUiPlugins = (): void => {
  if (editorUiPluginsReady) return
  const instance = editor.value
  if (!instance) return

  const enqueueNext = (): void => {
    editorUiPluginScheduler.enqueue({
      id: 'editor-ui-plugin-init',
      priority: BACKGROUND_PRIORITY.backgroundIndexing,
      run: () => {
        if (editor.value !== instance || editorRuntime.isDisposed) return
        const hasMore = instance.initNextUiPlugin()
        if (hasMore) {
          enqueueNext()
          return
        }
        editorUiPluginsReady = true
        if (window.electron?.process?.env?.PERF_TESTING === 'true') {
          const element = getEditorPerformanceElement()
          if (element) element.dataset.editorUiPluginsReadyAt = String(performance.now())
        }
      }
    })
  }

  enqueueNext()
}

const recordEditorMarkdownSerialization = (revision?: number): void => {
  const metrics = getEditorE2eMetrics()
  if (!metrics) return
  metrics.markdownSerializationCalls = (metrics.markdownSerializationCalls ?? 0) + 1
  metrics.markdownSerializationRevisions ??= []
  if (typeof revision === 'number') metrics.markdownSerializationRevisions.push(revision)
}

const serializeEditorMarkdown = (instance: MuyaInstance, revision?: number): string => {
  recordEditorMarkdownSerialization(revision)
  return measureEditorActivationPhase('serialize-markdown', () => instance.getMarkdown())
}

const serializeEditorMarkdownForRevision = (
  id: string,
  revision: number,
  instance: MuyaInstance
): string =>
  editorRuntime.getMarkdown(id, revision, () =>
    serializeEditorMarkdown(instance, revision)
  )

const captureEditorSnapshot = (
  id: string,
  revision: number,
  mode: EditorSnapshotMode = 'full'
): void => {
  if (!currentFile.value || currentFile.value.id !== id || !editor.value) return
  if (editorRuntime.currentRevision(id) !== revision) return

  const instance = editor.value
  const markdown = serializeEditorMarkdownForRevision(id, revision, instance)
  const historySnapshot = editorRuntime.getHistoryMeta<EditorHistoryRevisionSnapshot>(
    id,
    revision,
    () => ({
      engineHistory: instance.getHistory(),
      syntheticHistory: makeSyntheticHistory(id, markdown, revision)
    })
  )
  const includeDerivedMetadata = mode !== 'persistence'
  const virtualizationEnabled = Boolean(
    instance.editor?.scrollPage?.getVirtualizationPrototypeSnapshot?.().enabled
  )
  const includeBlocks = shouldCaptureEditorBlocks(mode, virtualizationEnabled)
  const wordCount = includeDerivedMetadata
    ? editorRuntime.getWordCount(id, revision, () => muyaWordCount(markdown))
    : undefined
  const blocks = includeBlocks
    ? editorRuntime.getBlocks(
      id,
      revision,
      () => instance.getState(),
      Math.max(markdown.length * 2, 1)
    )
    : null

  editorStore.LISTEN_FOR_CONTENT_CHANGE({
    id,
    revision,
    markdown,
    wordCount,
    cursor: serializeCursor(instance.getSelection()),
    history: historySnapshot.syntheticHistory,
    blocks
  })
}
// Drop per-tab bookkeeping for tabs that no longer exist. Tab ids are unique
// over the session, so without pruning these maps (and the content -> id map
// each `SyntheticHistory` holds) would grow unbounded as tabs are opened and
// closed. Driven by a watcher on the store's live tab id set.
const pruneClosedTabState = (liveTabIds: Set<string>): void => {
  for (const id of syntheticHistoryByTab.keys()) {
    if (!liveTabIds.has(id)) syntheticHistoryByTab.delete(id)
  }
  editorRuntime.prune(liveTabIds)
}

interface SelectionFormatLike {
  type: string
  [key: string]: unknown
}

// Container `blockName` → legacy `functionType`. The engine's affiliation
// entries carry `blockName` but not the legacy `functionType` the desktop
// menu-state builder keys off for `pre`/`figure` containers (table detection +
// Format-menu disable). Re-derive it here so `createApplicationMenuState`'s
// existing `pre`/`figure` branches fire. The `code$` / `multiplemath` /
// `frontmatter` / `html` / `table` values match the legacy muyajs vocabulary
// (`createApplicationMenuState`'s `/frontmatter|html|multiplemath|code$/` test
// and `=== 'table'` check).
const CONTAINER_FUNCTION_TYPE: Record<string, string> = {
  'code-block': 'fencecode',
  frontmatter: 'frontmatter',
  table: 'table',
  'html-block': 'html',
  'math-block': 'multiplemath',
  diagram: 'diagram'
}

interface EngineAffiliationEntry {
  type: string
  blockName: string
  listType?: string
  listItemType?: string
  isLooseListItem?: boolean
  [key: string]: unknown
}

// The engine's `selection-change` payload (since #4410) carries an
// `affiliation` chain (shared-ancestor paragraph-type blocks, outermost-first)
// plus per-endpoint `anchorBlockInfo`/`focusBlockInfo` describing the content
// leaf (`type: 'span'` + `functionType`), alongside the live `anchorBlock`/
// `focusBlock` refs (which carry `.text`). The desktop's application-menu state
// builder (`createApplicationMenuState`) and the selected-text derivation in
// `SELECTION_CHANGE` were written against the legacy `{ start, end, affiliation }`
// shape, so map the new payload onto it:
//   - `start.type`/`end.type` from the leaf info (`'span'`) so the
//     `start.type === 'span'` guards fire,
//   - `start.block.functionType`/`end.block.functionType` from the leaf info so
//     code-content / table-cell detection lights up,
//   - `start.block.text`/`end.block.text` from the live block so the store can
//     still slice the selected text (`SELECTION_CHANGE` → search prefill),
//   - `affiliation` straight through (entries already carry `type` +
//     `listType`/`listItemType`/`isLooseListItem`), surfacing a derived
//     `functionType` on `pre`/`figure` containers for table / code-fence keys.
const adaptSelectionChange = (changes: MuyaChange) => {
  const anchorPath = (changes.anchorPath ?? []) as Array<string | number>
  const focusPath = (changes.focusPath ?? anchorPath) as Array<string | number>
  const anchorBlock = changes.anchorBlock as { text?: string } | null | undefined
  const focusBlock = changes.focusBlock as { text?: string } | null | undefined
  const anchorInfo = changes.anchorBlockInfo as
    | { type?: string; functionType?: string }
    | null
    | undefined
  const focusInfo = changes.focusBlockInfo as
    | { type?: string; functionType?: string }
    | null
    | undefined
  const rawAffiliation = (changes.affiliation ?? []) as EngineAffiliationEntry[]
  const affiliation = rawAffiliation.map((entry) => {
    const functionType =
      entry.type === 'pre' || entry.type === 'figure'
        ? CONTAINER_FUNCTION_TYPE[entry.blockName]
        : undefined
    return functionType ? { ...entry, functionType } : entry
  })
  return {
    start: {
      key: anchorPath.join('/'),
      offset: (changes.anchor?.offset ?? 0) as number,
      block: { text: anchorBlock?.text, functionType: anchorInfo?.functionType },
      type: anchorInfo?.type
    },
    end: {
      key: focusPath.join('/'),
      offset: (changes.focus?.offset ?? 0) as number,
      block: { text: focusBlock?.text, functionType: focusInfo?.functionType },
      type: focusInfo?.type
    },
    affiliation
  }
}

// Build a JSON-serializable cursor from the engine selection (drop the live
// block references so it survives the buffered-state round-trip). `setCursor`
// re-resolves the target blocks from `anchorPath`/`focusPath`.
const serializeCursor = (
  selection: {
    anchor?: { offset: number; path?: Array<string | number> }
    focus?: { offset: number; path?: Array<string | number> }
  } | null
) => {
  if (!selection) return null
  return {
    anchor: selection.anchor ? { offset: selection.anchor.offset } : null,
    focus: selection.focus ? { offset: selection.focus.offset } : null,
    anchorPath: selection.anchor?.path,
    focusPath: selection.focus?.path
  }
}

class SimpleImageViewer {
  container: HTMLElement
  scale: number
  translateX: number
  translateY: number
  isDragging: boolean
  startX: number
  startY: number
  img!: HTMLImageElement
  _onWheel!: (e: WheelEvent) => void
  _onMousedown!: (e: MouseEvent) => void
  _onMousemove!: (e: MouseEvent) => void
  _onMouseup!: () => void

  constructor (container: HTMLElement, { url }: { url: string }) {
    this.container = container
    this.scale = 1
    this.translateX = 0
    this.translateY = 0
    this.isDragging = false
    this.startX = 0
    this.startY = 0
    this._init(url)
  }

  _init (url: string) {
    this.container.innerHTML = ''
    this.img = document.createElement('img')
    this.img.src = url
    this.img.style.cssText =
      'max-width:90vw;max-height:90vh;object-fit:contain;transform-origin:center center;user-select:none;display:block;'
    this.img.draggable = false
    this.container.appendChild(this.img)
    this._bindEvents()
  }

  _updateTransform () {
    this.img.style.transform = `translate(${this.translateX}px,${this.translateY}px) scale(${this.scale})`
  }

  _bindEvents () {
    this._onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.1 : 0.9
      this.scale = Math.max(0.1, Math.min(10, this.scale * factor))
      this._updateTransform()
    }
    this._onMousedown = (e: MouseEvent) => {
      if (e.button !== 0) return
      this.isDragging = true
      this.startX = e.clientX - this.translateX
      this.startY = e.clientY - this.translateY
      this.container.style.cursor = 'grabbing'
      e.preventDefault()
    }
    this._onMousemove = (e: MouseEvent) => {
      if (!this.isDragging) return
      this.translateX = e.clientX - this.startX
      this.translateY = e.clientY - this.startY
      this._updateTransform()
    }
    this._onMouseup = () => {
      this.isDragging = false
      this.container.style.cursor = 'grab'
    }
    this.container.addEventListener('wheel', this._onWheel, { passive: false })
    this.container.addEventListener('mousedown', this._onMousedown)
    document.addEventListener('mousemove', this._onMousemove)
    document.addEventListener('mouseup', this._onMouseup)
  }

  destroy () {
    this.container.removeEventListener('wheel', this._onWheel)
    this.container.removeEventListener('mousedown', this._onMousedown)
    document.removeEventListener('mousemove', this._onMousemove)
    document.removeEventListener('mouseup', this._onMouseup)
    this.container.innerHTML = ''
  }
}

// Watchers
// Prune per-tab engine/synthetic history bookkeeping when tabs close, so the
// maps don't accumulate stale entries (and their content -> id maps) over a long
// session. Watching the id set keeps this cheap — it only fires on tab add/close.
watch(
  () => tabs.value.map((t) => t.id),
  (ids) => {
    pruneClosedTabState(new Set(ids))
  }
)

watch(typewriter, (value) => {
  if (value) {
    scrollToCursor()
  }
})

watch(focus, (value) => {
  if (editor.value) {
    editor.value.setFocusMode(value)
  }
})

// In source-code mode the Paragraph and Format menus operate on the hidden
// WYSIWYG engine, so grey them out. On return to WYSIWYG, re-apply the menu
// state for the CURRENT cursor context (a code block/table still disables some
// items) rather than blanket-enabling everything (#3531).
watch(sourceCode, (isSource) => {
  const windowId = window.inkiva?.env?.windowId ?? -1
  if (isSource) {
    window.electron.ipcRenderer.send('mt::set-editor-format-menus-enabled', windowId, false)
    return
  }
  nextTick(() => {
    if (selectionChange.value) {
      pushSelectionMenuState(selectionChange.value as MuyaChange)
    } else {
      window.electron.ipcRenderer.send('mt::set-editor-format-menus-enabled', windowId, true)
    }
  })
})

watch(fontSize, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ fontSize: value })
  }
})

watch(lineHeight, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ lineHeight: value })
  }
})

watch(paragraphSpacing, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    // Appearance-only update: Muya writes one CSS custom property and avoids
    // reparsing or rebuilding the document, which keeps preference changes
    // cheap even for large notes.
    editor.value.setOptions({ paragraphSpacing: value })
  }
})

watch(editorFontFamily, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ editorFontFamily: resolveEditorFont(value) })
  }
})

watch(preferLooseListItem, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({
      preferLooseListItem: value
    })
  }
})

watch(tabSize, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ tabSize: value })
  }
})

watch(theme, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    // Agreement：Any black series theme needs to contain dark `word`.
    if (/dark/i.test(value)) {
      editor.value.setOptions(
        {
          mermaidTheme: 'dark',
          vegaTheme: 'dark'
        },
        true
      )
    } else {
      editor.value.setOptions(
        {
          mermaidTheme: 'default',
          vegaTheme: 'latimes'
        },
        true
      )
    }
  }
})

watch(sequenceTheme, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ sequenceTheme: value }, true)
  }
})

watch(
  () => preferencesStore.plantumlServer,
  (value, oldValue) => {
    if (value !== oldValue && editor.value) {
      editor.value.setOptions({ plantumlServer: value }, true)
    }
  }
)

watch(listIndentation, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setListIndentation(value)
  }
})

watch(frontmatterType, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ frontmatterType: value })
  }
})

watch(superSubScript, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ superSubScript: value }, true)
  }
})

watch(footnote, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ footnote: value }, true)
  }
})

watch(isHtmlEnabled, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ disableHtml: !value }, true)
  }
})

watch(isGitlabCompatibilityEnabled, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ isGitlabCompatibilityEnabled: value }, true)
  }
})

watch(hideQuickInsertHint, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ hideQuickInsertHint: value })
  }
})

watch(editorLineWidth, (value, oldValue) => {
  if (value !== oldValue) {
    setEditorWidth(value)
  }
})

watch(wrapCodeBlocks, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ wrapCodeBlocks: value })
  }
})

watch(autoPairBracket, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ autoPairBracket: value })
  }
})

watch(autoPairMarkdownSyntax, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ autoPairMarkdownSyntax: value })
  }
})

watch(autoPairQuote, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ autoPairQuote: value })
  }
})

watch(trimUnnecessaryCodeBlockEmptyLines, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ trimUnnecessaryCodeBlockEmptyLines: value })
  }
})

watch(bulletListMarker, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ bulletListMarker: value })
  }
})

watch(orderListDelimiter, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ orderListDelimiter: value })
  }
})

watch(hideLinkPopup, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ hideLinkPopup: value })
  }
})

watch(autoCheck, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ autoCheck: value })
  }
})

watch(codeFontSize, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ codeFontSize: value })
    // Source-mode CodeMirror is a separate surface muya doesn't own.
    addCommonStyle({
      codeFontSize: value,
      codeFontFamily: codeFontFamily.value,
      hideScrollbar: hideScrollbar.value
    })
  }
})

watch(codeBlockLineNumbers, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ codeBlockLineNumbers: value }, true)
  }
})

watch(codeFontFamily, (value, oldValue) => {
  if (value !== oldValue && editor.value) {
    editor.value.setOptions({ codeFontFamily: resolveCodeFont(value) })
    // Source-mode CodeMirror is a separate surface muya doesn't own.
    addCommonStyle({
      codeFontSize: codeFontSize.value,
      codeFontFamily: value,
      hideScrollbar: hideScrollbar.value
    })
  }
})

watch(hideScrollbar, (value, oldValue) => {
  if (value !== oldValue) {
    addCommonStyle({
      codeFontSize: codeFontSize.value,
      codeFontFamily: codeFontFamily.value,
      hideScrollbar: value
    })
  }
})

watch(spellcheckerEnabled, (value, oldValue) => {
  if (value !== oldValue) {
    // Set Muya's spellcheck container attribute.
    editor.value.setOptions({ spellcheckEnabled: value })

    // Disable native spell checker
    if (value) {
      spellchecker.activateSpellchecker(spellcheckerLanguage.value)
    } else {
      spellchecker.deactivateSpellchecker()
    }
  }
})

watch(spellcheckerNoUnderline, (value, oldValue) => {
  if (value !== oldValue) {
    // Hide only the spelling squiggle; the native checker (and its right-click
    // suggestions) stays controlled by `spellcheckerEnabled`.
    editor.value.setOptions({ spellcheckHideMarks: value })
  }
})

watch(spellcheckerLanguage, (value, oldValue) => {
  if (value !== oldValue) {
    spellchecker.lang = value
  }
})

watch(currentFile, (value, oldValue) => {
  if (value && value !== oldValue) {
    tocRefreshScheduler.cancel()
    scrollToCursor(0)
    // Hide float tools if needed.
    if (editor.value) {
      editor.value.hideAllFloatTools()
    }
  }
})

watch(
  listToc,
  (value) => {
    tocScrollSync?.update(value)
  },
  { flush: 'post' }
)

watch(
  sourceCode,
  (value, oldValue) => {
    if (value && value !== oldValue) {
      rejectPendingEditorCommandReadiness()
      editorCommandReadyDocumentId = null
      if (editor.value) {
        // Flush the WYSIWYG operation batch and its deferred snapshot before
        // the source editor mounts. The source view reads currentFile.markdown
        // as its initial value, so entering it must not expose a stale frame.
        flushActiveEditor()
        editor.value.hideAllFloatTools()
        // Compute the WYSIWYG caret as a source-markdown `{ line, ch }` index
        // cursor JUST-IN-TIME, only when entering source mode (Phase G — G7),
        // and write it to the tab before sourceCode.vue mounts (`flush: 'sync'`
        // runs this before the `v-if`-gated child reads `props.muyaIndexCursor`
        // in its onMounted). This is the inverse of the `setCursorByOffset`
        // source -> WYSIWYG path. Computing it here rather than on every
        // json-change/selection-change avoids serializing the whole document on
        // each keystroke/caret move, and guarantees a fresh (never stale) value.
        if (currentFile.value) {
          currentFile.value.muyaIndexCursor = editor.value.getCursorOffset() ?? null
        }
        // Capture the block-key caret too (same fresh selection getCursorOffset
        // reads) so the post-handoff undo can restore it — see
        // `preSourceModeSelection`.
        preSourceModeSelection = editor.value.getSelection()
      }
    }
  },
  { flush: 'sync' }
)

// Methods
// muya types the callback as (linkInfo: ILinkInfo | null) and href itself can
// be null when the rendered link has no usable href (see issue #4356).
const jumpClick = (linkInfo: { href?: string | null } | null) => {
  if (!linkInfo) return
  const { href } = linkInfo
  editorStore.FORMAT_LINK_CLICK({ data: { href: href ?? null }, dirname: window.DIRNAME })
}

interface ImagePathSuggestion {
  type: 'directory' | 'file' | string
  file: string
  [key: string]: unknown
}

const imagePathAutoComplete = async (src: string) => {
  const files = (await editorStore.ASK_FOR_IMAGE_AUTO_PATH(src)) as unknown as ImagePathSuggestion[]
  return files.map((f) => {
    const iconClass = f.type === 'directory' ? 'icon-folder' : 'icon-image'
    return Object.assign(f, { iconClass, text: f.file + (f.type === 'directory' ? '/' : '') })
  })
}

const imageAction = async (
  image: string | File,
  id: string | null,
  alt: string = ''
): Promise<string> => {
  // TODO(Refactor): Refactor this method.
  if (!currentFile.value) return ''
  const { filename, pathname: currentPathname } = currentFile.value

  // Figure out the current working directory.
  // Save an image relative to the file, otherwise use the project root when available.
  const isTabSavedOnDisk = !!currentPathname
  let relativeBasePath: string | null = isTabSavedOnDisk
    ? window.path.dirname(currentPathname)
    : null
  if (isTabSavedOnDisk && imageRelativeDirectoryBase.value !== 'file' && projectTree.value) {
    const { pathname: rootPath } = projectTree.value as { pathname?: string }
    if (rootPath && window.fileUtils.isChildOfDirectory(rootPath, currentPathname)) {
      // Save assets relative to root directory.
      relativeBasePath = rootPath
    }
  }

  const getResolvedImagePath = (imagePath: string) => {
    const replacement = isTabSavedOnDisk
      ? filename.replace(/\.[^/.]+$/, '') // Filename w/o extension
      : ''
    return imagePath.replace(/\${filename}/g, replacement)
  }

  const resolvedGlobalImageFolderPath = getResolvedImagePath(imageFolderPath.value)
  const resolvedImageRelativeDirectoryName = getResolvedImagePath(imageRelativeDirectoryName.value) // assets/
  const resolvedImageRelativeFullDirectoryPath = relativeBasePath
    ? window.path.join(relativeBasePath, resolvedImageRelativeDirectoryName)
    : null // /root/dir/assets
  let destImagePath = ''
  switch (imageInsertAction.value) {
    case 'upload': {
      let uploadSource: string | File = image
      try {
        if (typeof image === 'string' && /^data:image\//i.test(image)) {
          uploadSource = await dataUrlToFile(image)
        }
        // Pass the full preferences state object to avoid dereferencing non-existent .value
        destImagePath = (await uploadImage(
          currentPathname,
          uploadSource,
          preferencesStore.$state as unknown as import('@/util/fileSystem').UploadImagePreferences
        )) as string
      } catch (err) {
        notice.notify({
          title: 'Upload Image',
          type: 'warning',
          message: err instanceof Error ? err.message : String(err)
        })
        destImagePath = (await moveImageToFolder(
          currentPathname,
          uploadSource,
          resolvedGlobalImageFolderPath
        )) as string
      }
      break
    }
    case 'folder': {
      if (isTabSavedOnDisk && imagePreferRelativeDirectory.value) {
        // `image` may be a path string (paste/drag/image-selector) — pass
        // `currentPathname` so moveImageToFolder can resolve relative paths
        // via `path.dirname(pathname)` instead of crashing on `dirname(null)`.
        destImagePath = (await moveImageToFolder(
          currentPathname,
          image,
          resolvedImageRelativeFullDirectoryPath as string,
          true,
          currentPathname
        )) as string
      } else {
        destImagePath = (await moveImageToFolder(
          currentPathname,
          image,
          resolvedGlobalImageFolderPath
        )) as string
      }
      break
    }
    case 'path': {
      if (typeof image === 'string') {
        // Input is a local path.
        destImagePath = image
      } else {
        // Save and move image to image folder if input is binary.

        // Respect user preferences if tab exists on disk.
        if (isTabSavedOnDisk && imagePreferRelativeDirectory.value) {
          destImagePath = (await moveImageToFolder(
            null as unknown as string,
            image,
            resolvedImageRelativeFullDirectoryPath as string,
            true,
            currentPathname
          )) as string
        } else {
          destImagePath = (await moveImageToFolder(
            currentPathname,
            image,
            resolvedGlobalImageFolderPath
          )) as string
        }
      }
      break
    }
  }

  if (id && sourceCode.value) {
    bus.emit('image-action', {
      id,
      result: destImagePath,
      alt
    })
  }
  return destImagePath
}

// Adapt the engine's `imageAction` contract (`{ src, alt, title }`) to the
// desktop's `imageAction(image, id, alt)`. The engine handles a single inline
// image edit (no `id` round-trip / source-mode bus event), so we pass `null`
// for `id`.
const muyaImageAction = (state: { src: string; alt?: string; title?: string }): Promise<string> =>
  imageAction(state.src, null, state.alt ?? '')

const imagePathPicker = () => {
  return editorStore.ASK_FOR_IMAGE_PATH()
}

const keyup = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    setImageViewerVisible(false)
  }
}

const setImageViewerVisible = (status: boolean) => {
  imageViewerVisible.value = status
  if (!status && imageViewer) {
    imageViewer.destroy()
    imageViewer = null
  }
}

const switchSpellcheckLanguage = (languageCode: unknown) => {
  const { isEnabled } = spellchecker

  // This method is also called from bus, so validate state before continuing.
  if (!isEnabled) {
    throw new Error(t('editor.spellcheck.disabledError'))
  }

  spellchecker
    .switchLanguage(languageCode)
    .then((langCode: string | null | undefined) => {
      if (!langCode) {
        // Unable to switch language due to missing dictionary. The spell checker is now in an invalid state.
        notice.notify({
          title: t('editor.spellcheck.title'),
          type: 'warning',
          message: t('editor.spellcheck.languageMissing', { languageCode: languageCode as string })
        })
      }
    })
    .catch((error: unknown) => {
      log.error(
        t('editor.spellcheck.errorSwitchingLanguage', { languageCode: languageCode as string })
      )
      log.error(error)

      const errMsg = (error as { message?: string } | null | undefined)?.message ?? String(error)
      notice.notify({
        title: t('editor.spellcheck.title'),
        type: 'error',
        message: t('editor.spellcheck.switchError', {
          languageCode: languageCode as string,
          error: errMsg
        })
      })
    })
}

const handleInvalidateImageCache = () => {
  if (editor.value) {
    editor.value.invalidateImageCache()
  }
}

const openSpellcheckerLanguageCommand = () => {
  if (!isOsx && switchLanguageCommand) {
    bus.emit('show-command-palette', switchLanguageCommand)
  }
}

const replaceMisspelling = (payload: unknown) => {
  const { word, replacement } = payload as { word: string; replacement: string }
  if (editor.value) {
    editor.value.replaceCurrentWordInlineUnsafe(word, replacement)
  }
}

const handleUndo = () => {
  if (sourceCode.value) {
    return
  }

  if (editor.value) {
    editor.value.undo()
  }
}

const handleRedo = () => {
  if (sourceCode.value) {
    return
  }

  if (editor.value) {
    editor.value.redo()
  }
}

const handleSelectAll = () => {
  if (sourceCode.value) {
    return
  }

  if (editor.value && editor.value.hasFocus()) {
    editor.value.selectAll()
  } else {
    const activeElement = document.activeElement as HTMLElement | null
    const nodeName = activeElement?.nodeName
    if (nodeName === 'INPUT' || nodeName === 'TEXTAREA') {
      const selectable = activeElement as HTMLInputElement | HTMLTextAreaElement | null
      if (selectable && typeof selectable.select === 'function') {
        selectable.select()
      }
    }
  }
}

// Custom copyAsRich copyAsMarkdown copyAsHtml pasteAsPlainText.
// `copyAsRich` writes the rendered HTML to `text/html` AND the plain text to
// `text/plain`, so pasting into Word/email yields formatted rich text (whereas
// `copyAsHtml` blanks `text/html` and puts the HTML source into `text/plain`).
const COPY_PASTE_METHOD_MAP: Record<
  string,
  'copyAsRich' | 'copyAsMarkdown' | 'copyAsHtml' | 'pasteAsPlainText'
> = {
  copyAsRich: 'copyAsRich',
  copyAsMarkdown: 'copyAsMarkdown',
  copyAsHtml: 'copyAsHtml',
  pasteAsPlainText: 'pasteAsPlainText'
}
const handleCopyPaste = (type: unknown) => {
  if (editor.value) {
    const method = COPY_PASTE_METHOD_MAP[type as string]
    if (method) editor.value[method]()
  }
}

const insertImage = (src: unknown) => {
  if (!sourceCode.value) {
    editor.value && editor.value.insertImage({ src })
  }
}

// muya's search/replace/find return the live Search instance (circular:
// Search -> muya -> ... -> ScrollPage) and each match carries a live `block`
// reference. The store deep-clones (JSON.stringify) its payload, so extract
// only the plain { index, matches, value } the search UI needs.
const toSearchMatches = (result: unknown) => {
  const r = (result ?? {}) as {
    index?: number
    value?: string
    matches?: Array<{ start: number; end: number; match: string }>
  }
  return {
    index: r.index ?? -1,
    matches: (r.matches ?? []).map((m) => ({ start: m.start, end: m.end, match: m.match })),
    value: r.value ?? ''
  }
}

let searchRequestGeneration = 0

const handleSearch = (payload: unknown) => {
  if (sourceCode.value) return
  const { value, opt } = payload as { value: string; opt: unknown }
  const requestGeneration = ++searchRequestGeneration
  let revealedFirstMatch = false

  editor.value
    .searchAsync(value, opt, (result: ReturnType<typeof toSearchMatches>) => {
      if (requestGeneration !== searchRequestGeneration) return
      editorStore.SEARCH(toSearchMatches(result))
      if (!revealedFirstMatch && result.matches.length > 0) {
        revealedFirstMatch = true
        scrollToHighlight()
      }
    })
    .catch(() => {
      if (requestGeneration !== searchRequestGeneration) return
      editorStore.SEARCH({ index: -1, matches: [], value })
    })
}

const handReplace = (payload: unknown) => {
  if (sourceCode.value) return
  searchRequestGeneration += 1
  const { value, opt } = payload as { value: string; opt: unknown }
  editorStore.SEARCH(toSearchMatches(editor.value.replace(value, opt)))
}

const handleUploadedImage = (url: unknown, deletionUrl?: unknown) => {
  insertImage(url)
  editorStore.SHOW_IMAGE_DELETION_URL(deletionUrl as string)
}

// `muya.domNode` is the contenteditable + scroll container (it inherits the
// `.editor-component` class from the original mount point and `overflow:auto`).
// The legacy engine exposed the same element as `muya.container`.
const getScrollContainer = (): HTMLElement | null =>
  (editor.value?.domNode as HTMLElement | undefined) ?? null

// A semantic restore can wait for progressive rendering. During that wait the
// user may scroll/click/type elsewhere; those explicit actions must supersede
// the queued restore instead of letting it pull the viewport back later.
const restoreInteractionFence = createRestoreInteractionFence(window)

type PendingScrollRestore = {
  container: HTMLElement
  target: number
  frame: number | null
  removeInteractionListeners: () => void
}

// The editor rebuilds its block tree synchronously, but diagrams and other
// media can change the document height after their asynchronous render. Do not
// add synthetic bottom padding to make a saved position writable: that padding
// becomes part of the scrollbar range when a later layout change is not
// observable by ResizeObserver. Instead, clamp to the real range now and retry
// the saved position briefly while the layout settles.
let pendingScrollRestore: PendingScrollRestore | null = null
const documentGeometry = createDocumentGeometryProjection({
  getSurface: () => editor.value?.editor?.scrollPage,
  hasPendingScrollRestore: () => pendingScrollRestore !== null
})

const clearPendingScrollRestore = (): void => {
  const pending = pendingScrollRestore
  if (!pending) return

  if (pending.frame !== null) cancelAnimationFrame(pending.frame)
  pending.removeInteractionListeners()
  pendingScrollRestore = null
}

const getMaxScrollTop = (container: HTMLElement): number =>
  Math.max(0, container.scrollHeight - container.clientHeight)

const checkPendingScrollRestore = (): void => {
  const pending = pendingScrollRestore
  const container = getScrollContainer()
  if (!pending || !container || pending.container !== container) {
    clearPendingScrollRestore()
    return
  }

  const maxScrollTop = getMaxScrollTop(container)
  const restoredScrollTop = Math.min(pending.target, maxScrollTop)
  if (container.scrollTop !== restoredScrollTop) {
    container.scrollTop = restoredScrollTop
  }

  // A restore remains pending only while the requested offset is outside the
  // current real scroll range. Async diagram/image/table geometry is already
  // reported by editorLayoutReconciler, which schedules the next check. Keeping
  // this dormant state costs no polling and avoids guessing a settle timeout.
  if (maxScrollTop >= pending.target) {
    clearPendingScrollRestore()
  }
}

const schedulePendingScrollRestoreCheck = (): void => {
  const pending = pendingScrollRestore
  if (!pending || pending.frame !== null) return

  pending.frame = requestAnimationFrame(() => {
    pending.frame = null
    checkPendingScrollRestore()
  })
}

// Viewport-relative caret rect (mirrors the engine's `Selection.getCursorCoords`
// / legacy `cursorCoords`). Used for typewriter + keep-cursor-visible scrolling
// when we are not inside a `selection-change` event (which already supplies it).
const getCursorY = (): number | null => {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return null
  const range = sel.getRangeAt(0).cloneRange()
  let rects = range.getClientRects()
  if (rects.length === 0 && range.startContainer) {
    const parent =
      range.startContainer.nodeType === Node.ELEMENT_NODE
        ? (range.startContainer as Element)
        : range.startContainer.parentElement
    rects = parent ? parent.getClientRects() : rects
  }
  return rects.length ? rects[0].y : null
}

const scrollToCursor = (duration = 300) => {
  nextTick(() => {
    const container = getScrollContainer()
    if (!container) return
    const y = getCursorY()
    if (y == null) return
    editor.value?.editor?.scrollPage?.prepareForNavigation?.()
    animatedScrollTo(container, container.scrollTop + y - STANDAR_Y, duration)
  })
}

const scrollToCords = (y: number) => {
  const container = getScrollContainer()
  if (!container) return

  // Cancel any restore state from the previous document before reusing the
  // editor root for this document.
  clearPendingScrollRestore()
  editor.value?.editor?.scrollPage?.prepareForNavigation?.()

  const target = Math.max(0, y)
  if (target === 0) {
    // Most tab activations restore the default top position. Avoid creating a
    // pending restore and forcing a post-mount scrollHeight read for this
    // common case; zero is valid regardless of the replacement document's
    // eventual height.
    container.scrollTop = 0
    container.style.visibility = 'visible'
    container.style.pointerEvents = 'auto'
    return
  }
  const pending: PendingScrollRestore = {
    container,
    target,
    // The old document may still occupy a large DOM tree here. Defer the
    // first scrollHeight read until the rAF after the new surface is mounted,
    // when the container is hidden and the browser can calculate one final
    // layout for the replacement document.
    frame: null,
    removeInteractionListeners: () => {}
  }
  pendingScrollRestore = pending
  const cancelOnInteraction = () => {
    if (pendingScrollRestore === pending) clearPendingScrollRestore()
  }
  const interactionEvents = ['wheel', 'touchstart', 'mousedown', 'pointerdown', 'keydown'] as const
  for (const eventName of interactionEvents) {
    container.addEventListener(eventName, cancelOnInteraction)
  }
  pending.removeInteractionListeners = () => {
    for (const eventName of interactionEvents) {
      container.removeEventListener(eventName, cancelOnInteraction)
    }
  }
  pending.frame = requestAnimationFrame(() => {
    if (pendingScrollRestore !== pending) return
    pending.frame = null
    // Reveal after the first real layout. If an async block later increases
    // scrollHeight, the local layout reconciler schedules another check without
    // making the user wait for the renderer.
    container.style.visibility = 'visible'
    container.style.pointerEvents = 'auto'
    checkPendingScrollRestore()
    markEditorCommandContextReady(currentFile.value?.id)
  })
}

// Smoothly scroll the editor so `anchor` sits at the standard top offset.
// Shared by the TOC, search-highlight, and any other "reveal this element"
// caller so the getBoundingClientRect + animatedScrollTo math lives once.
const scrollElementIntoView = (anchor: Element | null | undefined, duration = 300) => {
  const container = getScrollContainer()
  if (!container || !anchor) return
  const { y } = anchor.getBoundingClientRect()
  animatedScrollTo(container, container.scrollTop + y - STANDAR_Y, duration)
}

const scrollToHighlight = () => {
  return scrollToElement('.mu-highlight')
}

/**
 * Scrolls the editor to the heading for a TOC entry. See
 * `resolveTocHeadingElement` for why the slug is resolved by document order
 * against the top-level headings only.
 * @param slug The TOC entry's slug from the `scroll-to-header` bus event.
 */
const scrollToHeader = (slug: unknown) => {
  const container = getScrollContainer()
  if (!container) return
  const tocItem = editorStore.listToc.find((item) => item.slug === slug)
  if (
    typeof tocItem?.blockIndex === 'number' &&
    documentGeometry.revealBlock(tocItem.blockIndex, { viewportOffset: 8 })
  ) {
    return
  }
  scrollElementIntoView(resolveTocHeadingElement(container, editorStore.listToc, slug))
}

// Scrolls to a non-heading in-document anchor target (e.g. a custom
// `<a id="...">`) resolved by `FORMAT_LINK_CLICK` via `getElementById`.
const scrollToAnchorElement = (element: unknown) => {
  if (element instanceof Element) scrollElementIntoView(element)
}

const scrollToElement = (selector: string) => {
  // Scroll to search highlight word
  scrollElementIntoView(document.querySelector(selector))
}

const handleFindAction = (action: unknown) => {
  if (sourceCode.value) return
  editorStore.SEARCH(toSearchMatches(editor.value.find(action)))
  scrollToHighlight()
}

interface ExportOptions {
  type: string
  header?: unknown
  footer?: unknown
  headerFooterStyled?: unknown
  htmlTitle?: string
  pageSize?: string
  pageSizeWidth?: number
  pageSizeHeight?: number
  isLandscape?: boolean
  reuseLastPath?: boolean
  [key: string]: unknown
}

interface LastExportRequest {
  fileId: string
  options: ExportOptions
}

let lastExportRequest: LastExportRequest | null = null

const rememberLastExport = (options: ExportOptions) => {
  if (
    !options.reuseLastPath &&
    (options.type === 'pdf' || options.type === 'styledHtml') &&
    currentFile.value?.id
  ) {
    lastExportRequest = {
      fileId: currentFile.value.id,
      options: { ...options }
    }
  }
}

const getCurrentRevisionMarkdownSnapshot = (): string => {
  const id = currentFile.value?.id
  editor.value.flush()
  if (id) editorRuntime.flushSnapshot(id, 'persistence')
  const revision = id ? editorRuntime.currentRevision(id) : 0
  return id
    ? (editorRuntime.readMarkdown(id, revision) ??
        serializeEditorMarkdownForRevision(id, revision, editor.value))
    : serializeEditorMarkdown(editor.value)
}

if (window.electron?.process?.env?.PERF_TESTING === 'true') {
  ;(
    globalThis as typeof globalThis & {
      __inkiva_get_export_markdown_snapshot__?: () => string
    }
  ).__inkiva_get_export_markdown_snapshot__ = getCurrentRevisionMarkdownSnapshot
}

const handleExport = async (options: unknown) => {
  const opts = options as ExportOptions
  const { type, headerFooterStyled, htmlTitle } = opts

  if (!/^pdf|print|styledHtml$/.test(type)) {
    throw new Error(`Invalid type to export: "${type}".`)
  }

  const extraCss = await getCssForOptions(opts as unknown as PdfCssOptions)
  const htmlToc = getHtmlToc(editor.value.getTOC(), opts as unknown as HtmlTocOptions)
  const markdown = getCurrentRevisionMarkdownSnapshot()
  const header = (opts.header ?? null) as HeaderFooterPart | null
  const footer = (opts.footer ?? null) as HeaderFooterPart | null

  switch (type) {
    case 'styledHtml': {
      try {
        const content = await exportStyledHTML(editor.value, markdown, {
          title: htmlTitle || '',
          printOptimization: false,
          extraCss,
          toc: htmlToc,
          dir: props.textDirection
        })
        rememberLastExport(opts)
        editorStore.EXPORT({ type, content, reuseLastPath: opts.reuseLastPath })
      } catch (err) {
        log.error('Failed to export document:', err)
        notice.notify({
          title: t('editor.export.failed', { type: htmlTitle || 'html' }),
          type: 'error',
          message:
            (err as { message?: string } | null | undefined)?.message ?? t('editor.export.error')
        })
      }
      break
    }
    case 'pdf': {
      // NOTE: We need to set page size via Electron.
      try {
        const { pageSize, pageSizeWidth, pageSizeHeight, isLandscape } = opts
        const pageOptions = {
          pageSize,
          pageSizeWidth,
          pageSizeHeight,
          isLandscape
        }

        const html = await exportStyledHTML(editor.value, markdown, {
          title: '',
          printOptimization: true,
          extraCss,
          toc: htmlToc,
          header,
          footer,
          headerFooterStyled: headerFooterStyled as boolean | undefined,
          dir: props.textDirection
        })
        printer!.renderMarkdown(html, true, props.textDirection)
        rememberLastExport(opts)
        editorStore.EXPORT({ type, pageOptions, reuseLastPath: opts.reuseLastPath })
      } catch (err) {
        log.error('Failed to export document:', err)
        notice.notify({
          title: t('editor.export.failed', { type: 'PDF' }),
          type: 'error',
          message: t('editor.export.errorExporting', { type: htmlTitle || 'PDF' })
        })
        handlePrintServiceClearup()
      }
      break
    }
    case 'print': {
      // NOTE: Print doesn't support page size or orientation.
      try {
        const html = await exportStyledHTML(editor.value, markdown, {
          title: '',
          printOptimization: true,
          extraCss,
          toc: htmlToc,
          header,
          footer,
          headerFooterStyled: headerFooterStyled as boolean | undefined,
          dir: props.textDirection
        })
        printer!.renderMarkdown(html, true, props.textDirection)
        editorStore.PRINT_RESPONSE()
      } catch (err) {
        log.error('Failed to export document:', err)
        notice.notify({
          title: t('editor.print.failed'),
          type: 'error',
          message: t('editor.print.error', { title: htmlTitle || '' })
        })
        handlePrintServiceClearup()
      }
      break
    }
  }
}

const handleExportAgain = () => {
  if (!lastExportRequest || lastExportRequest.fileId !== currentFile.value?.id) {
    notice.notify({
      title: t('exportSettings.title'),
      type: 'warning',
      message: t('exportSettings.noPreviousExport')
    })
    return
  }

  handleExport({ ...lastExportRequest.options, reuseLastPath: true }).catch((err) => {
    log.error('Failed to repeat export:', err)
  })
}

const handlePrintServiceClearup = () => {
  printer!.clearup()
}

// Push the current selection to the application-menu / toolbar state. Called on
// every muya selection-change, and again right after a paragraph action: a no-op
// action (e.g. "Paragraph" inside a list/quote) fires no selection-change, so the
// clicked checkbox menu item's auto-toggled OS checkmark would otherwise linger.
const pushSelectionMenuState = (changes: MuyaChange) => {
  editorStore.SELECTION_CHANGE({
    ...adaptSelectionChange(changes),
    // Read the live block tree (O(1)) rather than getState(), which deep-clones
    // the whole document — this runs on every cursor move.
    hasFrontMatter: editor.value?.editor?.scrollPage?.firstChild?.blockName === 'frontmatter'
  })
  // The active inline formats ride along on selection-change — drive the format
  // menu/toolbar state from them.
  editorStore.SELECTION_FORMATS((changes.formats ?? []) as SelectionFormatLike[])
}

const handleEditParagraph = (type: unknown) => {
  // These commands act on the hidden WYSIWYG engine, so block them in
  // source-code mode (mirrors handleUndo/handleSelectAll) — otherwise e.g. the
  // Insert Table wizard opens and writes to the invisible editor (#3531).
  if (sourceCode.value) {
    return
  }
  if (type === 'table') {
    tableChecker.rows = 4
    tableChecker.columns = 3
    dialogTableVisible.value = true
    nextTick(() => {
      rowInput.value?.focus()
    })
  } else if (editor.value) {
    editor.value.updateParagraph(type)
    // Re-sync the menu so a no-op action (e.g. "Paragraph" inside a list/quote)
    // does not leave the clicked checkbox item checked. A real conversion fires
    // its own selection-change, which resyncs again.
    if (selectionChange.value) {
      pushSelectionMenuState(selectionChange.value as MuyaChange)
    }
  }
}

// handle `duplicate`, `delete`, `create paragraph below`
const handleParagraph = (type: unknown) => {
  if (sourceCode.value) {
    return
  }
  if (editor.value) {
    switch (type) {
      case 'duplicate': {
        return editor.value.duplicate()
      }
      case 'createParagraph': {
        return editor.value.insertParagraph('after', '', true)
      }
      case 'deleteParagraph': {
        return editor.value.deleteParagraph()
      }
      default:
        console.error(`unknow paragraph edit type: ${type}`)
    }
  }
}

const handleInlineFormat = (type: unknown) => {
  if (sourceCode.value) {
    return
  }
  editor.value && editor.value.format(type)
}

const handleDialogTableConfirm = () => {
  dialogTableVisible.value = false
  editor.value && editor.value.createTable(tableChecker)
}

interface FileLoadedPayload {
  id?: string
  markdown?: string
  cursor?: unknown
  contentAlreadyLoaded?: boolean
}

type EditorSetContentSource = 'markdown' | 'blocks'

const recordEditorSetContent = (source: EditorSetContentSource): void => {
  const metrics = getEditorE2eMetrics()
  if (!metrics) return
  metrics.setContentCalls += 1
  metrics.setContentSources.push(source)
}

type TocMetric = 'scheduledRefreshes' | 'refreshCalls'

const recordTocMetric = (metric: TocMetric): void => {
  if (window.electron?.process?.env?.PERF_TESTING !== 'true') return

  const globalState = globalThis as typeof globalThis & {
    __inkiva_e2e_toc_metrics__?: {
      scheduledRefreshes: number
      refreshCalls: number
    }
  }
  const metrics = (globalState.__inkiva_e2e_toc_metrics__ ??= {
    scheduledRefreshes: 0,
    refreshCalls: 0
  })
  metrics[metric] += 1
}

const refreshEditorToc = (force = true): void => {
  if (!editor.value) return
  editorStore.UPDATE_TOC(editor.value.getTOC(), force)
}

const runWhenEditorRenderComplete = (
  id: string | undefined,
  callback: (instance: MuyaInstance) => void
): void => {
  const instance = editor.value
  if (!instance) return

  instance.whenRenderComplete().then(() => {
    if (editor.value !== instance || (id && currentFile.value?.id !== id)) return
    callback(instance)
  })
}

const refreshEditorTocWhenReady = (id?: string): void => {
  // Large documents now mount their block tree progressively. Reading the TOC
  // before that completes would publish a truncated outline and make the
  // sidebar disagree with the authoritative JSON state. Small documents keep
  // the same behavior because their completion promise is already resolved.
  runWhenEditorRenderComplete(id, () => refreshEditorToc())
}

const scheduleTocRefresh = (id: string): void => {
  recordTocMetric('scheduledRefreshes')
  tocRefreshScheduler.schedule(id, () => {
    // A file switch can happen while the debounce timer is pending. The
    // scheduler cancels the common path; this guard is the final protection
    // against applying an old document's TOC to the active tab.
    if (!currentFile.value || currentFile.value.id !== id || !editor.value) return
    recordTocMetric('refreshCalls')
    refreshEditorToc(false)
  })
}

// listen for `open-single-file` event, it will call this method only when open a new file.
const editorPerformanceOperationId = (documentId?: string): string =>
  documentId ? `document-${documentId}` : 'document-initial'

// Muya replaces the Vue mount container with its own DOM root during init.
// Read the live root after init so post-paint milestones remain observable.
const getEditorPerformanceElement = (): HTMLElement | null =>
  (editor.value?.domNode as HTMLElement | undefined) ?? editorRef.value

const beginEditorPerformanceOperation = (documentId?: string): void => {
  editorPerformanceGeneration += 1
  editorUiPluginScheduler.setInteractivePending(true)
  const element = getEditorPerformanceElement()
  if (element) {
    element.dataset.editorOpenStartAt = String(performance.now())
    delete element.dataset.editorFirstScreenAt
    delete element.dataset.editorInteractiveAt
    delete element.dataset.editorEditableAt
  }

  rendererPerformance.mark('document_open_start', {
    phase: 'document-open',
    operationId: editorPerformanceOperationId(documentId),
    documentId
  })
}

const markEditorFirstScreen = (documentId?: string): void => {
  const element = getEditorPerformanceElement()
  if (element) {
    element.dataset.editorFirstScreenAt = String(performance.now())
  }

  rendererPerformance.mark('document_first_screen', {
    phase: 'document-open',
    operationId: editorPerformanceOperationId(documentId),
    documentId
  })
}

const markEditorInteractive = (documentId?: string): void => {
  const element = getEditorPerformanceElement()
  if (element) {
    element.dataset.editorInteractiveAt = String(performance.now())
  }

  rendererPerformance.mark('first_editor_interactive', {
    phase: 'editor',
    operationId: editorPerformanceOperationId(documentId),
    documentId
  })
}

const createMountedBlockPrewarmer = (generation: number): (() => void) => {
  let nodes: HTMLElement[] | null = null
  let cursor = 0
  let passesRemaining = 2

  return () => {
    if (generation !== editorPerformanceGeneration) return
    const container = getScrollContainer()
    if (!container) return

    nodes ??= Array.from(container.querySelectorAll<HTMLElement>('[data-virtual-block-index]'))
    if (cursor >= nodes.length) return

    const remaining = nodes.length - cursor
    const budget = Math.max(1, Math.ceil(remaining / Math.max(1, passesRemaining)))
    passesRemaining = Math.max(0, passesRemaining - 1)
    const end = Math.min(nodes.length, cursor + budget)
    let checksum = 0
    for (; cursor < end; cursor += 1) {
      const node = nodes[cursor]
      const rect = node.getBoundingClientRect()
      checksum += rect.width + rect.height + node.offsetWidth
    }

    // Keep the reads observable to the optimizer without publishing diagnostics
    // or mutating editor state. Split the work across milestone frames so the
    // prewarm cannot create a new long task before editable.
    if (checksum < 0) container.dataset.editorPrewarm = String(checksum)
  }
}

const scheduleEditorMilestones = (
  documentId?: string,
  notifyMainProcess = false,
  afterFirstScreen?: () => void,
  afterEditable?: () => void
): void => {
  const generation = editorPerformanceGeneration
  const prewarmMountedBlocks = createMountedBlockPrewarmer(generation)
  const captureFrameDiagnostics = window.electron?.process?.env?.PERF_TESTING === 'true'
  let frameSequence = 0
  const milestoneFrameTimings: Array<{
    sequence: number
    requestedAt: number
    timerRanAt?: number
    ranAt?: number
  }> = []
  const milestoneLongTasks: Array<{ startTime: number; duration: number }> = []
  const longTaskObserver =
    captureFrameDiagnostics && typeof PerformanceObserver !== 'undefined'
      ? new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          milestoneLongTasks.push({ startTime: entry.startTime, duration: entry.duration })
        }
        getEditorPerformanceElement()?.setAttribute(
          'data-editor-milestone-long-tasks',
          JSON.stringify(milestoneLongTasks)
        )
      })
      : null
  try {
    longTaskObserver?.observe({ entryTypes: ['longtask'] })
  } catch {
    longTaskObserver?.disconnect()
  }

  scheduleEditorPerformanceMilestones({
    requestFrame: (callback) => {
      if (!captureFrameDiagnostics) {
        window.requestAnimationFrame(() => callback())
        return
      }
      const sequence = ++frameSequence
      const entry = { sequence, requestedAt: performance.now() } as {
        sequence: number
        requestedAt: number
        timerRanAt?: number
        ranAt?: number
      }
      milestoneFrameTimings.push(entry)
      window.setTimeout(() => {
        entry.timerRanAt = performance.now()
        getEditorPerformanceElement()?.setAttribute(
          'data-editor-milestone-frame-timings',
          JSON.stringify(milestoneFrameTimings)
        )
      }, 0)
      window.requestAnimationFrame(() => {
        entry.ranAt = performance.now()
        getEditorPerformanceElement()?.setAttribute(
          'data-editor-milestone-frame-timings',
          JSON.stringify(milestoneFrameTimings)
        )
        callback()
      })
    },
    isCurrent: () => generation === editorPerformanceGeneration,
    markFirstScreen: () => markEditorFirstScreen(documentId),
    afterFirstScreen,
    markInteractive: () => markEditorInteractive(documentId),
    afterEditable,
    prewarmFrame: prewarmMountedBlocks,
    markEditable: () => {
      const element = getEditorPerformanceElement()
      if (element) {
        element.dataset.editorEditableAt = String(performance.now())
      }

      rendererPerformance.mark('document_editable', {
        phase: 'startup',
        operationId: editorPerformanceOperationId(documentId),
        documentId
      })
      editorUiPluginScheduler.setInteractivePending(false)
      scheduleEditorUiPlugins()
      longTaskObserver?.disconnect()
    },
    notifyMainProcess: notifyMainProcess
      ? () => window.electron.ipcRenderer.send('mt::document-editable')
      : undefined
  })
}

const setMarkdownToEditor = (payload: unknown) => {
  const {
    id,
    markdown: newMarkdown,
    cursor: newCursor,
    contentAlreadyLoaded
  } = (payload ?? {}) as FileLoadedPayload
  if (isStaleEditorEvent(id, currentFile.value?.id)) return
  if (editor.value) {
    invalidateEditorCommandContext(id)
    if (!contentAlreadyLoaded) {
      beginEditorPerformanceOperation(id)
    }
    // `NEW_UNTITLED_TAB` emits `file-changed` first (which starts the
    // scroll-to-zero restore) and then emits `file-loaded` only to seed the
    // already-mounted document's baseline/focus. Do not cancel that pending
    // restore here: cancelling it leaves the editor hidden until the next tab
    // switch. A genuinely newly opened file has no preceding restore to keep.
    if (!contentAlreadyLoaded) {
      clearPendingScrollRestore()
    }
    if (!contentAlreadyLoaded) {
      // `setContent` resets the document and clears the undo history; only set
      // a cursor afterwards (a freshly-opened file has no history to restore).
      recordEditorSetContent('markdown')
      measureEditorActivationPhase('set-content-markdown', () =>
        editor.value.setContent(newMarkdown ?? '')
      )
      editorLayoutReconciler?.reset(true)
    }
    // The freshly loaded content is this tab's clean baseline (id 0). History
    // comparison needs Muya's normalized serialization, but the authoritative
    // revision Markdown must stay byte-identical to the loaded source until an
    // actual content mutation occurs. Keeping those roles separate prevents a
    // source-mode toggle/save from silently reformatting pristine Markdown.
    if (id) {
      const revision = editorRuntime.currentRevision(id)
      const normalizedMarkdown = serializeEditorMarkdown(editor.value)
      resetSyntheticHistory(id, normalizedMarkdown)
      editorRuntime.seedMarkdown(id, revision, newMarkdown ?? currentFile.value?.markdown ?? '')
    }
    if (newCursor) {
      runWhenEditorRenderComplete(id, (instance) => {
        applyCursor(instance, newCursor)
        // A folder-search jump carries an index cursor; a freshly opened file
        // starts scrolled to the top, so reveal the resolved caret.
        if (isIndexCursor(newCursor)) {
          scrollToCursor()
        }
      })
    }
    // `setContent` fires no `json-change`, so seed the TOC explicitly after any
    // progressive block rendering completes (otherwise a large file would
    // publish a partial outline while its tail is still mounting).
    refreshEditorTocWhenReady(id)
    // A freshly created/opened tab should be ready to type into.
    focusFreshEditor()
    scheduleEditorMilestones(id)
    runWhenEditorRenderComplete(id, () => markEditorCommandContextReady(id))
  }
}

interface FileChangePayload {
  id?: string
  markdown?: string
  cursor?: unknown
  renderCursor?: boolean
  history?: unknown
  scrollTop?: number
  viewportAnchorSlug?: string | null
  muyaIndexCursor?: unknown
  blocks?: unknown
  isReload?: boolean
}

const isReusableBlocksSnapshot = (blocks: unknown): blocks is unknown[] => {
  if (!Array.isArray(blocks)) return false
  return blocks.every((block) => {
    if (block == null || typeof block !== 'object') return false
    return typeof (block as { name?: unknown }).name === 'string'
  })
}

// listen for markdown change form source mode or change tabs etc
const handleFileChange = (payload: unknown) => {
  const {
    id,
    markdown: newMarkdown,
    cursor: newCursor,
    muyaIndexCursor,
    history: payloadHistory,
    scrollTop,
    viewportAnchorSlug,
    blocks,
    isReload
  } = (payload ?? {}) as FileChangePayload
  if (!editor.value) return
  if (isStaleEditorEvent(id, currentFile.value?.id)) return
  const container = getScrollContainer()
  invalidateEditorCommandContext(id)
  if (!container) return

  // Hide the live editor before replacing a large rendered tree. Visibility
  // alone keeps the layout box intact, while preventing the browser from
  // laying out each detach/append operation on the switch's synchronous path.
  const restoresSemanticViewport =
    typeof viewportAnchorSlug === 'string' && viewportAnchorSlug.length > 0
  const restoresScroll = restoresSemanticViewport || (typeof scrollTop === 'number' && scrollTop > 0)
  if (restoresScroll) {
    container.style.visibility = 'hidden'
    container.style.pointerEvents = 'none'
  } else {
    container.style.visibility = 'visible'
    container.style.pointerEvents = 'auto'
  }

  clearPendingScrollRestore()

  const isSourceModeHandoff = isIndexCursor(muyaIndexCursor) && !newCursor && payloadHistory == null
  if (typeof newMarkdown === 'string') {
    beginEditorPerformanceOperation(id)
    // Returning from source-code mode: the WYSIWYG engine is never unmounted
    // while source mode is up (index.vue overlays it via `v-if`), so it still
    // holds the PRE-source-mode document and undo history. Record the bulk
    // source-mode edit as a SINGLE engine undo boundary via `replaceContent`
    // (PG14 parity): the first Ctrl+Z after the handoff reverts the entire
    // source-mode change in one step, matching legacy muyajs' full-state
    // snapshot history. `replaceContent` builds a fully-invertible whole-document
    // ot-json1 op and applies undo/redo via a full block-tree rebuild (never the
    // incremental pick/drop walker), so arbitrary block-type changes round-trip
    // safely.
    //
    // Detection: only sourceCode.vue's onBeforeUnmount emits `file-changed` with
    // a source-mode index cursor AND no block-key `cursor` AND no `history`
    // (see sourceCode.vue ~L368). Every tab-switch / file-reload emitter in
    // editor.ts carries both `cursor` and `history` alongside, so requiring
    // those absent reliably isolates the WYSIWYG<-source handoff from a tab
    // activation that merely replays a tab's persisted `muyaIndexCursor`.

    if (isSourceModeHandoff) {
      // Record the bulk source-mode edit as a single undo boundary. When the
      // document is unchanged this is a no-op (returns false) and the existing
      // history/content already match — either way the caret still needs
      // remapping below.
      suppressEditorMutationRecording = true
      try {
        editor.value.replaceContent(newMarkdown, preSourceModeSelection)
      } finally {
        suppressEditorMutationRecording = false
        preSourceModeSelection = null
      }
      if (id) {
        // `replaceContent` updated the engine history, but its synchronous
        // `json-change` was intentionally suppressed so canonical Source text
        // cannot be normalized back over the document revision. Publish only
        // the save-tracking history metadata against the exact Source Markdown.
        // This keeps Source edits dirty, and lets a later WYSIWYG undo revisit
        // the same synthetic history id that was marked saved in the meantime.
        const revision = editorRuntime.currentRevision(id)
        const normalizedMarkdown = serializeEditorMarkdown(editor.value)
        const history = makeSyntheticHistory(id, normalizedMarkdown, revision)
        editorStore.LISTEN_FOR_CONTENT_CHANGE({
          id,
          revision,
          markdown: newMarkdown,
          history,
          preserveTrailingNewlines: true
        })
      }
      refreshEditorTocWhenReady(id)
      // `replaceContent` can restart progressive/virtual rendering. Restore the
      // source-mode caret at the render-complete boundary so a later render pass
      // cannot overwrite the native DOM Selection on a slower CI machine.
      runWhenEditorRenderComplete(id, (instance) => {
        instance.setCursorByOffset(muyaIndexCursor)
      })
    } else if (isReload) {
      // External disk reload (`loadChange`): the tab is already the live engine
      // document, so record the new on-disk content as a SINGLE invertible undo
      // boundary via `replaceContent` (legacy muyajs full-state-snapshot parity)
      // — the first undo after the reload restores the pre-reload document in one
      // step. `setContent` would clear the engine history and lose that boundary;
      // restoring the per-tab engine history (the tab-switch path) would clobber
      // it too. `replaceContent` preserves the existing undo stack and pushes the
      // boundary on top.
      //
      // The new content is this tab's clean baseline (the store seeds
      // `lastSavedHistoryId: 0`), so re-seed the save-tracking allocator BEFORE
      // applying: `replaceContent` fires a SYNCHRONOUS `json-change` that would
      // otherwise mark the tab dirty against the stale (pre-reload) baseline.
      if (id) {
        resetSyntheticHistory(id, newMarkdown)
      }
      editor.value.replaceContent(newMarkdown)
      refreshEditorTocWhenReady(id)
      if (newCursor) {
        applyCursor(editor.value, newCursor)
      }
    } else {
      // Tab switch / programmatic content swap: `setContent` replaces the
      // document and clears history, so restore the real engine history (kept
      // per-tab) afterwards — preserves undo/redo on in-session tab switch. The
      // `history` in the payload is the synthetic desktop-shaped history used
      // for save tracking, not the engine history.
      // Tabs that have already been edited in WYSIWYG mode carry a serialized
      // block tree in the store. Reusing it avoids parsing the same Markdown
      // again on every return to the tab. Source-mode handoffs and external
      // reloads do not enter this branch, and invalid snapshots fall back to
      // the Markdown path.
      const reusableBlocks = isReusableBlocksSnapshot(blocks) ? blocks : null
      if (reusableBlocks) {
        recordEditorSetContent('blocks')
        // `blocks` came through Pinia and may be reactive. Give Muya the raw
        // snapshot so its document model does not retain Vue proxies.
        measureEditorActivationPhase('set-content-blocks', () =>
          editor.value.setContent(
            toRaw(reusableBlocks),
            false,
            true,
            CONTENT_SWITCH_PROGRESSIVE_RENDER_START_DELAY_MS,
            id ?? null
          )
        )
      } else {
        recordEditorSetContent('markdown')
        measureEditorActivationPhase('set-content-markdown', () =>
          editor.value.setContent(
            newMarkdown,
            false,
            true,
            CONTENT_SWITCH_PROGRESSIVE_RENDER_START_DELAY_MS,
            id ?? null
          )
        )
      }
      // Tab switch swaps content without firing `json-change`, so re-seed the
      // TOC (otherwise returning to an open tab keeps the other tab's TOC).
      refreshEditorTocWhenReady(id)
      if (newCursor || isIndexCursor(muyaIndexCursor)) {
        runWhenEditorRenderComplete(id, (instance) => {
          if (newCursor) {
            applyCursor(instance, newCursor)
          } else {
            // Source-mode handoff for a tab the engine has no history for
            // (e.g. first interaction after load): fall back to a caret-only
            // remap. The engine runs its own synchronous setContent dance
            // internally, so restore the history after.
            instance.setCursorByOffset(muyaIndexCursor)
          }
        })
      }
      if (id) {
        editorRuntime.restoreCurrentHistory<EditorHistoryRevisionSnapshot>(id, (historySnapshot) => {
          if (historySnapshot.engineHistory) editor.value.setHistory(historySnapshot.engineHistory)
        })
      }
      // First activation of a tab the save-tracking allocator has never seen:
      // seed its clean baseline from the payload already held by the store.
      // For a tab that already has a tracker this is a no-op — switching back
      // must keep the existing content -> id map and must not serialize the
      // whole document just to discover that no seed is needed.
      if (id && !syntheticHistoryByTab.has(id)) {
        getSyntheticHistory(id, newMarkdown)
      }
    }
    editorLayoutReconciler?.reset(true)
  } else if (newCursor) {
    applyCursor(editor.value, newCursor)
  }

  if (restoresSemanticViewport) {
    // A persisted pixel offset becomes stale as images/diagrams/fonts settle.
    // Resolve the heading against the freshly rendered TOC, then reveal that
    // semantic location. If the heading disappeared, fall back to the old
    // offset/caret without jumping to an unrelated same-level heading.
    //
    // Progressive rendering can keep this callback queued long enough for the
    // user to make a newer navigation decision. Capture an interaction token
    // at scheduling time and fail closed if any explicit user action happens
    // before the callback runs (US07 / AC-34).
    const restoreInteractionToken = restoreInteractionFence.capture()
    runWhenEditorRenderComplete(id, () => {
      if (!restoreInteractionFence.isCurrent(restoreInteractionToken)) {
        container.style.visibility = 'visible'
        container.style.pointerEvents = 'auto'
        markEditorCommandContextReady(id)
        return
      }

      refreshEditorToc(false)
      const anchorExists = editorStore.listToc.some((item) => item.slug === viewportAnchorSlug)
      if (anchorExists) {
        scrollToHeader(viewportAnchorSlug)
        container.style.visibility = 'visible'
        container.style.pointerEvents = 'auto'
      } else if (typeof scrollTop === 'number') {
        editorStore.UPDATE_ACTIVE_TOC(null)
        scrollToCords(scrollTop)
      } else {
        editorStore.UPDATE_ACTIVE_TOC(null)
        scrollToCursor(0)
      }
    })
  } else if (typeof scrollTop === 'number') {
    scrollToCords(scrollTop)
  } else {
    scrollToCursor(0)
  }

  runWhenEditorRenderComplete(id, () => markEditorCommandContextReady(id))

  if (typeof newMarkdown === 'string') {
    scheduleEditorMilestones(id)
  }
}

const handleInsertParagraph = (location: unknown) => {
  editor.value && editor.value.insertParagraph(location)
}

const blurEditor = () => {
  editor.value?.blur(false, true)
}

const focusEditor = () => {
  editor.value?.focus()
}

const resolveEditorCommandReadiness = (request: PendingEditorCommandReadiness): void => {
  const ed = editor.value
  const currentDocumentId = currentFile.value?.id
  if (
    !ed ||
    !currentDocumentId ||
    request.documentId !== currentDocumentId ||
    sourceCode.value ||
    editorCompositionActive
  ) {
    request.resolve(false)
    return
  }

  const container = getScrollContainer()
  if (
    editorCommandReadyDocumentId !== currentDocumentId ||
    container?.style.visibility === 'hidden'
  ) {
    pendingEditorCommandReadiness.add(request)
    return
  }

  pendingEditorCommandReadiness.delete(request)
  const activeElement = document.activeElement
  const alreadyFocused = ed.hasFocus() && !!activeElement && ed.domNode.contains(activeElement)
  if (!alreadyFocused) {
    ed.domNode.focus()
    ed.focus()
  }

  const resolvedActiveElement = document.activeElement
  request.resolve(
    ed.hasFocus() &&
    !!resolvedActiveElement &&
    ed.domNode.contains(resolvedActiveElement)
  )
}

const markEditorCommandContextReady = (documentId?: string): void => {
  if (!documentId || currentFile.value?.id !== documentId || sourceCode.value) return
  const container = getScrollContainer()
  if (container?.style.visibility === 'hidden') return

  editorCommandReadyDocumentId = documentId
  for (const request of [...pendingEditorCommandReadiness]) {
    if (request.documentId === documentId) resolveEditorCommandReadiness(request)
  }
}

const ensureEditorCommandReadiness = ({ resolve }: BusEvents['editor-command-readiness']) => {
  const documentId = currentFile.value?.id
  if (!documentId || sourceCode.value || editorCompositionActive) {
    resolve(false)
    return
  }
  resolveEditorCommandReadiness({ documentId, resolve })
}

// Focus a freshly opened/created tab's editor. The sibling `file-changed`
// handler (emitted first, while the store commits the tab switch) hides the
// editor and queues a `requestAnimationFrame` via `scrollToCords` to restore
// it, and focus() is a no-op while the container is `visibility:hidden`. Our
// rAF is registered after that restore rAF, so it runs once the editor is
// visible; then take DOM focus (the engine's `focus()` only sets the selection
// range — the contenteditable also needs focus or no caret blinks) and place
// the caret at the document start.
const focusFreshEditor = () => {
  requestAnimationFrame(() => {
    const ed = editor.value
    if (!ed) return
    ed.domNode.focus()
    ed.focus()
  })
}

// When a focus-trapping modal (the command palette) opens, release the editor's
// contenteditable focus first. element-plus's el-dialog restores focus to the
// previously focused element on close; restoring it into the engine's
// contenteditable while its selection is uncommitted makes the focus-trap and
// the engine's selection handling fight, freezing the renderer. Blurring up
// front removes the editor as the restore target and avoids the loop.
const handleModalOpening = () => {
  if (editor.value && editor.value.hasFocus()) {
    editor.value.blur(true, true)
  }
}

// macOS Edit → Screenshot. The main process captures the region, saves it to a
// PNG, and hands us the path. `document.execCommand('paste')` no longer fires in
// Electron 42 Chromium, so insert the saved image at the cursor through the
// engine (routing via `imageAction` → upload/folder/path).
const handleScreenShot = (filePath?: unknown) => {
  if (editor.value && typeof filePath === 'string' && filePath) {
    editor.value.pasteImage(filePath)
  }
}

const handleLanguageChanged = (newLocale?: unknown) => {
  if (editor.value) {
    const locale = typeof newLocale === 'string' ? newLocale : language.value
    editor.value.locale(getMuyaLocale(locale))
  }
}

onMounted(() => {
  const performanceDocumentId = currentFile.value?.id
  const performanceOperationId = performanceDocumentId
    ? `document-${performanceDocumentId}`
    : 'document-initial'

  printer = new Printer()
  const ele = editorRef.value
  if (!ele) return
  beginEditorPerformanceOperation(performanceDocumentId)

  // Register the engine UI plugins once per renderer process (see
  // `muyaPluginsRegistered`). The image-edit tool receives the desktop's image
  // callbacks; LinkTools receives the ctrl/cmd-click jump handler.
  if (!muyaPluginsRegistered) {
    muyaPluginsRegistered = true
    Muya.use(TableChessboard)
    Muya.use(ParagraphQuickInsertMenu)
    Muya.use(CodeBlockLanguageSelector)
    Muya.use(EmojiSelector)
    Muya.use(ImagePathPicker)
    Muya.use(ImageEditTool, {
      imageAction: muyaImageAction,
      imagePathPicker,
      imagePathAutoComplete
    })
    Muya.use(ImageResizeBar)
    Muya.use(ImageToolBar)
    Muya.use(InlineFormatToolbar)
    Muya.use(ParagraphFrontButton)
    Muya.use(ParagraphFrontMenu)
    Muya.use(PreviewToolBar)
    Muya.use(LinkTools, {
      jumpClick
    })
    Muya.use(FootnoteTool)
    Muya.use(TableColumnToolbar)
    Muya.use(TableDragBar)
    Muya.use(TableRowColumMenu)
  }

  const options: Record<string, unknown> = {
    focusMode: focus.value,
    markdown: props.markdown,
    locale: getMuyaLocale(language.value),
    preferLooseListItem: preferLooseListItem.value,
    autoPairBracket: autoPairBracket.value,
    autoPairMarkdownSyntax: autoPairMarkdownSyntax.value,
    trimUnnecessaryCodeBlockEmptyLines: trimUnnecessaryCodeBlockEmptyLines.value,
    autoPairQuote: autoPairQuote.value,
    bulletListMarker: bulletListMarker.value,
    orderListDelimiter: orderListDelimiter.value,
    tabSize: tabSize.value,
    fontSize: fontSize.value,
    lineHeight: lineHeight.value,
    paragraphSpacing: paragraphSpacing.value,
    editorFontFamily: resolveEditorFont(editorFontFamily.value),
    codeFontSize: codeFontSize.value,
    codeFontFamily: resolveCodeFont(codeFontFamily.value),
    wrapCodeBlocks: wrapCodeBlocks.value,
    codeBlockLineNumbers: codeBlockLineNumbers.value,
    listIndentation: listIndentation.value,
    frontmatterType: frontmatterType.value,
    superSubScript: superSubScript.value,
    footnote: footnote.value,
    disableHtml: !isHtmlEnabled.value,
    virtualizeLargeDocuments: true,
    isGitlabCompatibilityEnabled: isGitlabCompatibilityEnabled.value,
    hideQuickInsertHint: hideQuickInsertHint.value,
    hideLinkPopup: hideLinkPopup.value,
    autoCheck: autoCheck.value,
    sequenceTheme: sequenceTheme.value,
    plantumlServer: preferencesStore.plantumlServer,
    spellcheckEnabled: spellcheckerEnabled.value,
    spellcheckHideMarks: spellcheckerNoUnderline.value,
    // Resolve the OS clipboard to a local file path on paste (image-from-file).
    clipboardFilePath: guessClipboardFilePath,
    // Read the OS clipboard's plain text for "Paste as Plain Text" (execCommand('paste') no longer fires).
    clipboardText: () => window.electron.clipboard.readText(),
    // Image-persist callbacks read by the engine's clipboard + drag-drop handlers
    // from `muya.options.*` (distinct from the ImageEditTool plugin option above).
    // Without these, local-file drag-drop, screenshot/binary clipboard paste, and
    // copy-to-assets on a pasted image file silently no-op or insert raw paths.
    imageAction: muyaImageAction,
    getPathForFile: (file: File) => window.electron.webUtils.getPathForFile(file)
  }

  if (getApplicationAppearance(theme.value) === 'dark') {
    Object.assign(options, {
      mermaidTheme: 'dark',
      vegaTheme: 'dark'
    })
  } else {
    Object.assign(options, {
      mermaidTheme: 'default',
      vegaTheme: 'latimes'
    })
  }

  // `markRaw` keeps Vue from wrapping the Muya instance in a reactive Proxy.
  // The engine stores live DOM nodes and block-tree references and patches the
  // DOM via snabbdom; proxying them silently breaks identity checks so the
  // document tree never renders.
  const muya = markRaw(measureEditorActivationPhase('muya-constructor', () => new Muya(ele, options)))
  // The new engine requires an explicit init() after construction (it builds
  // the document tree and instantiates the registered UI plugins).
  rendererPerformance.mark('muya_init_start', {
    phase: 'document-open',
    operationId: performanceOperationId,
    documentId: performanceDocumentId
  })
  measureEditorActivationPhase('muya-init', () =>
    measureEditorActivationPhase('muya-editor-core-init', () => muya.initEditorCore(false))
  )
  rendererPerformance.measure('muya_init_end', 'muya_init_start', {
    phase: 'document-open',
    operationId: performanceOperationId,
    documentId: performanceDocumentId
  })
  editor.value = muya
  runWhenEditorRenderComplete(currentFile.value?.id, () => {
    markEditorCommandContextReady(currentFile.value?.id)
  })
  // The first document's content is set via constructor options, so no
  // `file-loaded` / `setMarkdownToEditor` runs for it — seed its TOC here.
  refreshEditorTocWhenReady(currentFile.value?.id)
  if (currentFile.value?.viewportAnchorSlug) {
    const documentId = currentFile.value.id
    const anchorSlug = currentFile.value.viewportAnchorSlug
    runWhenEditorRenderComplete(documentId, () => {
      refreshEditorToc(false)
      if (editorStore.listToc.some((item) => item.slug === anchorSlug)) {
        scrollToHeader(anchorSlug)
      } else {
        editorStore.UPDATE_ACTIVE_TOC(null)
        scrollToCords(currentFile.value?.scrollTop ?? 0)
      }
    })
  }

  // Seed the save-tracking baseline from Muya's normalized serialization so
  // undo/redo compares against the engine's own representation. Keep the clean
  // revision's authoritative Markdown as the exact store/disk source; otherwise
  // merely entering source mode would rewrite formatting such as table spacing.
  if (currentFile.value?.id) {
    const id = currentFile.value.id
    const revision = editorRuntime.currentRevision(id)
    const normalizedMarkdown = serializeEditorMarkdown(muya)
    getSyntheticHistory(id, normalizedMarkdown)
    editorRuntime.seedMarkdown(id, revision, currentFile.value.markdown)
  }

  const container = getScrollContainer()!

  const inputParseStartEvents = ['beforeinput', 'compositionend', 'paste'] as const
  for (const eventName of inputParseStartEvents) {
    container.addEventListener(eventName, inputParseProbe.begin, true)
  }
  container.addEventListener('compositionstart', markEditorCompositionStart, true)
  container.addEventListener('compositionend', markEditorCompositionEnd, true)

  // Cache top-level heading positions for active-TOC highlighting. The sync
  // reads layout only during outline/DOM rebuilds; scroll events use a binary
  // search over the cache so diagram nodes and large documents do not trigger
  // a forced layout per event.
  tocScrollSync = createTocScrollSync(
    container,
    (slug) => {
      editorStore.UPDATE_ACTIVE_TOC(slug)
    },
    40,
    documentGeometry.getBlockOffset
  )
  tocScrollSync.update(listToc.value)

  const activatePostPaintGeometry = (): void => {
    tocScrollSync?.attach()
    // Reconcile asynchronous block geometry at the editor's direct-child
    // boundary only after editable. Fresh-DOM geometry reads otherwise force
    // Chromium to synchronously lay out the full activation surface.
    editorLayoutReconciler = createEditorLayoutReconciler(container, {
      // Render Surface 2.0 owns scroll anchoring while large-document
      // virtualization is active. The desktop layout reconciler must still
      // observe geometry for TOC/tab restoration, but must not compete with
      // Muya by writing scrollTop on diagram/image/table resize.
      getScrollOwner: documentGeometry.getScrollOwner,
      onChange: (changes) => {
        schedulePendingScrollRestoreCheck()
        tocScrollSync?.reconcile(changes)
      }
    })
  }

  // Listen for language changes and update the engine locale.
  registerBusHandler('language-changed', handleLanguageChanged)

  // Create spell check wrapper and enable spell checking if preferred.
  spellchecker = new SpellChecker(spellcheckerEnabled.value, spellcheckerLanguage.value)

  // Register command palette entry for switching spellchecker language.
  switchLanguageCommand = new SpellcheckerLanguageCommand(spellchecker)
  const spellcheckerLanguageCommand = switchLanguageCommand
  bus.emit('cmd::register-command', spellcheckerLanguageCommand)

  if (typewriter.value) {
    scrollToCursor()
  }

  // listen for bus events.
  registerBusHandler('file-loaded', setMarkdownToEditor)
  registerBusHandler('invalidate-image-cache', handleInvalidateImageCache)
  registerBusHandler('undo', handleUndo)
  registerBusHandler('redo', handleRedo)
  registerBusHandler('selectAll', handleSelectAll)
  registerBusHandler('export', handleExport)
  registerBusHandler('export-again', handleExportAgain)
  registerBusHandler('print-service-clearup', handlePrintServiceClearup)
  registerBusHandler('paragraph', handleEditParagraph)
  registerBusHandler('format', handleInlineFormat)
  registerBusHandler('searchValue', handleSearch)
  registerBusHandler('replaceValue', handReplace)
  registerBusHandler('find-action', handleFindAction)
  registerBusHandler('insert-image', insertImage)
  registerBusHandler('image-uploaded', handleUploadedImage)
  registerBusHandler('file-changed', handleFileChange)
  registerBusHandler('flush-active-editor', flushActiveEditor)
  registerBusHandler('flush-active-editor-for-save', flushActiveEditorForSave)
  registerBusHandler('flush-active-editor-for-tab-switch', flushActiveEditorForTabSwitch)
  registerBusHandler('editor-blur', blurEditor)
  registerBusHandler('editor-focus', focusEditor)
  registerBusHandler('editor-command-readiness', ensureEditorCommandReadiness)
  registerBusHandler('copyAsRich', handleCopyPaste)
  registerBusHandler('copyAsMarkdown', handleCopyPaste)
  registerBusHandler('copyAsHtml', handleCopyPaste)
  registerBusHandler('pasteAsPlainText', handleCopyPaste)
  registerBusHandler('duplicate', handleParagraph)
  registerBusHandler('createParagraph', handleParagraph)
  registerBusHandler('deleteParagraph', handleParagraph)
  registerBusHandler('insertParagraph', handleInsertParagraph)
  registerBusHandler('scroll-to-header', scrollToHeader)
  registerBusHandler('scroll-to-anchor-element', scrollToAnchorElement)
  registerBusHandler('screenshot-captured', handleScreenShot)
  registerBusHandler('show-command-palette', handleModalOpening)
  registerBusHandler('switch-spellchecker-language', switchSpellcheckLanguage)
  registerBusHandler('open-command-spellchecker-switch-language', openSpellcheckerLanguageCommand)
  registerBusHandler('replace-misspelling', replaceMisspelling)

  // The engine emits a low-level `json-change` on every document mutation. Keep
  // the input callback to classification, dirty-revision allocation, and
  // scheduling only. Markdown/history/AST serialization is deferred for text
  // input and only flushed synchronously for structural work or an explicit
  // boundary such as save/tab switch.
  editor.value.on('json-change', (change: MuyaChange = {}) => {
    // Muya emits json-change synchronously while handling beforeinput. This
    // probe records the actual synchronous input-to-model boundary; it never
    // estimates parsing from a timer or a test-side constant.
    inputParseProbe.finish()

    // There is a chance that this event is fired AFTER the tab is switched. If we purely rely on this.currentFile later on
    // it can cause invalid updates. Hence, we need the id to identify changes as part of each tab
    if (!currentFile.value || !editor.value) return
    const { id } = currentFile.value
    if (!id) return
    if (suppressEditorMutationRecording) return
    const policy = getEditorMutationPolicy(change)
    editorRuntime.recordMutation(
      id,
      (documentId) => editorStore.MARK_CONTENT_DIRTY(documentId),
      captureEditorSnapshot,
      policy.snapshot === 'immediate'
    )

    if (policy.refreshToc) scheduleTocRefresh(id)
  })

  // The engine does not emit `scroll`; listen on the scroll container directly
  // so the desktop can persist each tab's scroll position.
  scrollHandler = () => {
    markEditorScrollInteraction()
    const pending = pendingScrollRestore
    if (pending) {
      // A layout pass can clamp scrollTop while diagrams or media settle. The
      // explicit interaction listeners installed by scrollToCords cancel on
      // real user input; the local editor-layout reconciler schedules checks for
      // actual block changes, while this fallback remains a bounded safety net.
      return
    }
    if (currentFile.value) {
      scheduleScrollPositionPersistence(currentFile.value.id, container.scrollTop)
    }

    if (rendererPerformance.enabled) {
      rendererPerformanceMonitor.beginScroll()
      if (scrollPerformanceEndTimer !== null) clearTimeout(scrollPerformanceEndTimer)
      scrollPerformanceEndTimer = setTimeout(() => {
        scrollPerformanceEndTimer = null
        rendererPerformanceMonitor.endScroll()
      }, 120)
    }
  }
  container.addEventListener('scroll', scrollHandler, { passive: true })

  // Clicking the hover-to-copy affordance on a heading emits `heading-copy-link`
  // with the heading's stable slug; copy the matching GitHub anchor to the
  // clipboard (resolved via `listToc.find(i => i.slug === key)`).
  editor.value.on('heading-copy-link', ({ key }: { key: string }) => {
    editorStore.copyGithubSlug(key)
  })

  editor.value.on(
    'format-click',
    ({ event, formatType, data }: { event: MouseEvent; formatType: string; data: unknown }) => {
      const ctrlOrMeta = (isOsx && event.metaKey) || (!isOsx && event.ctrlKey)
      if (formatType === 'link' && ctrlOrMeta) {
        editorStore.FORMAT_LINK_CLICK({
          data: data as { href: string; [key: string]: unknown },
          dirname: window.DIRNAME
        })
      } else if (formatType === 'image' && ctrlOrMeta) {
        if (imageViewer) {
          imageViewer.destroy()
        }
        if (imageViewerRef.value) {
          imageViewer = new SimpleImageViewer(imageViewerRef.value, { url: data as string })
          setImageViewerVisible(true)
        }
      }
    }
  )

  editor.value.on('preview-image', ({ data }: { data: string }) => {
    if (imageViewer) {
      imageViewer.destroy()
    }
    if (imageViewerRef.value) {
      imageViewer = new SimpleImageViewer(imageViewerRef.value, { url: data })
      setImageViewerVisible(true)
    }
  })

  editor.value.on('selection-change', (changes: MuyaChange) => {
    const y = (changes.cursorCoords?.y ?? null) as number | null
    if (y != null) {
      if (typewriter.value) {
        const startPosition = container.scrollTop
        const toPosition = startPosition + y - STANDAR_Y

        // Prevent micro shakes and unnecessary scrolling.
        if (Math.abs(startPosition - toPosition) > 2) {
          animatedScrollTo(container, toPosition, 100)
        }
      }

      // Used to fix #628: auto scroll cursor to visible if the cursor is too low.
      if (container.clientHeight - y < 100) {
        // editableHeight is the lowest cursor position(till to top) that editor allowed.
        const editableHeight = container.clientHeight - 100
        animatedScrollTo(container, container.scrollTop + (y - editableHeight), 0)
      } else if (y < 100) {
        // Symmetric to #628: scroll up when the cursor rises above the top edge
        // (e.g. Arrow-Up), otherwise the caret leaves the viewport (#3329).
        animatedScrollTo(container, container.scrollTop + (y - 100), 0)
      }
    }

    selectionChange.value = changes
    // Persist the caret so a click/arrow-key move (which never fires
    // `json-change`) survives an in-session tab switch — `tab.cursor` is what
    // `handleFileChange` replays on re-activation. Cheap: serialized caret only.
    if (currentFile.value?.id && editor.value) {
      editorStore.PERSIST_CURSOR(currentFile.value.id, serializeCursor(editor.value.getSelection()))
    }
    pushSelectionMenuState(changes)
  })

  document.addEventListener('keyup', keyup)

  setEditorWidth(editorLineWidth.value)
  // The main process uses this milestone—not the earlier bootstrap handshake—
  // to release deferred startup work and safe-restore state. The scheduler
  // crosses a paint boundary before first-screen, then publishes interactive
  // and editable in order.
  scheduleEditorMilestones(
    performanceDocumentId,
    true,
    () => editor.value?.focus(),
    activatePostPaintGeometry
  )
})

onBeforeUnmount(() => {
  editorPerformanceGeneration += 1
  flushActiveEditor()
  restoreInteractionFence.destroy()
  editorRuntime.dispose()
})
</script>

<style>
/* ... existing style ... */
.editor-wrapper {
  height: 100%;
  position: relative;
  /* Contain the editor's z-indexed children (e.g. the math/diagram preview
     popups at z-index 10000) in their own stacking context so they cannot
     paint above modal dialogs rendered outside the editor. */
  isolation: isolate;
  flex: 1;
  min-width: 0;
  color: var(--editorColor);
}

.ag-insert-table-dialog {
  & .el-form--inline {
    display: flex;
    flex-wrap: nowrap;
    justify-content: space-between;
    align-items: center;
  }
  & .el-form--inline .el-form-item {
    margin-right: 0;
  }
  & .el-input-number {
    width: 100px;
    min-width: 0;
  }
  & .el-button {
    font-size: 13px;
    width: 70px;
  }
}

.editor-wrapper.source {
  position: absolute;
  z-index: -1;
  top: 0;
  left: 0;
  overflow: hidden;
  /* `z-index: -1` only hides the editor visually; `document.elementsFromPoint`
     ignores stacking, so muya's mousemove-driven float tools (front button/menu,
     table drag/column toolbars, preview toolbar) still re-trigger over the source
     editor. Drop the subtree from hit-testing too so they cannot (#4731). */
  pointer-events: none;
}

.editor-component {
  height: 100%;
  min-width: 0;
  overflow: auto;
  box-sizing: border-box;
  cursor: default;
  overflow-anchor: none !important;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  background: var(--surface-editor);
  /* Keep the large Markdown scroll surface on an independent compositor layer.
     Without this identity transform Chromium marks the editor RepaintsOnScroll,
     forcing main-thread repaint work instead of accelerated scrolling. */
  transform: translateZ(0);
}

.editor-component .mu-container {
  padding-top: var(--editorContentTopPadding, 40px);
  padding-bottom: 100vh;
}

.editor-component .mu-editor {
  color: var(--markdown-text-primary);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

.editor-component .mu-container > h1:first-child,
.editor-component .mu-container > .mu-virtual-segment[data-virtual-segment-index='0'] > h1:first-child {
  margin-top: 0;
}

.typewriter .editor-component {
  padding-top: calc(50vh - 136px);
  padding-bottom: calc(50vh - 54px);
}

.image-viewer {
  position: fixed;
  backdrop-filter: blur(5px);
  top: 0;
  right: 0;
  left: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  z-index: 11;
  & .icon-close {
    z-index: 1000;
    width: 30px;
    height: 30px;
    position: absolute;
    top: 50px;
    left: 50px;
    display: block;
    color: #efefef;
    & svg {
      width: 100%;
      height: 100%;
    }
  }
}

.image-viewer > div {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  overflow: hidden;
}
</style>
