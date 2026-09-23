<template>
  <div
    ref="sourceCodeContainer"
    class="source-code"
  />
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import { findMarkdownHeadingLine, scrollSourceEditorToLine } from '@/util/sourceModeToc'
import { storeToRefs } from 'pinia'
import codeMirror, { setCursorAtFirstLine, setTextDirection } from '../../codeMirror'
import { wordCount as getWordCount } from '@muyajs/core'
import { adjustCursor } from '../../util'
import bus from '../../bus'
import { getApplicationAppearance } from 'common/theme'
import { EXTREME_DOCUMENT_VIEWPORT_MARGIN } from '@/util/largeDocumentMode'
import { SourceSnapshotScheduler } from './sourceCodeHotPath'
import { documentRevisionSnapshots } from '@/services/documentRevisionSnapshot'

// CodeMirror 5 ships no first-party types; the wrapper in src/renderer/src/
// codeMirror/index.ts also keeps the surface intentionally loose.
type CMInstance = any
type CMCursor = any

interface MuyaIndexCursorLike {
  anchor: CMCursor
  focus: CMCursor
}

const props = defineProps<{
  markdown?: string
  muyaIndexCursor?: unknown
  textDirection: string
  degraded?: boolean
}>()

const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()

const sourceCodeContainer = ref<HTMLDivElement | null>(null)

const editor = ref<CMInstance>(null)
const commitTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const viewDestroyed = ref(false)
const tabId = ref<string | null>(null)
let applyingFileChange = false
const sourceSnapshotScheduler = new SourceSnapshotScheduler()
let latestMarkdown = props.markdown ?? ''
let latestWordCount: ReturnType<typeof getWordCount> | undefined

const { theme, sourceCode } = storeToRefs(preferencesStore)

const isSourceSurface = (): boolean => sourceCode.value || props.degraded === true
const { currentFile: currentTab } = storeToRefs(editorStore)

type SourceSearchOptions = {
  isCaseSensitive?: boolean
  isWholeWord?: boolean
  isRegexp?: boolean
}

type SourceSearchMatch = { start: number; end: number; match: string }
let sourceSearchValue = ''
let sourceSearchMatches: SourceSearchMatch[] = []
let sourceSearchIndex = -1

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const revealSourceSearchMatch = (index: number): void => {
  const cm = editor.value
  const match = sourceSearchMatches[index]
  if (!cm || !match) return
  const from = cm.posFromIndex(match.start)
  const to = cm.posFromIndex(match.end)
  cm.setSelection(from, to)
  scrollSourceEditorToLine(cm, from.line, sourceCodeContainer.value)
}

const publishSourceSearch = (): void => {
  editorStore.SEARCH({
    index: sourceSearchIndex,
    matches: sourceSearchMatches,
    value: sourceSearchValue
  })
}

const handleSourceSearch = (payload: unknown): void => {
  if (!isSourceSurface() || !editor.value) return
  const { value, opt } = payload as { value: string; opt?: SourceSearchOptions }
  sourceSearchValue = value ?? ''
  sourceSearchMatches = []
  sourceSearchIndex = -1
  if (!sourceSearchValue) {
    publishSourceSearch()
    return
  }

  const options = opt ?? {}
  const pattern = options.isRegexp ? sourceSearchValue : escapeRegExp(sourceSearchValue)
  const boundedPattern = options.isWholeWord ? `\\b(?:${pattern})\\b` : pattern
  const flags = options.isCaseSensitive ? 'g' : 'gi'
  const regex = new RegExp(boundedPattern, flags)
  const markdown = editor.value.getValue() as string
  let match: RegExpExecArray | null
  while ((match = regex.exec(markdown)) !== null) {
    if (match[0].length === 0) break
    sourceSearchMatches.push({
      start: match.index,
      end: match.index + match[0].length,
      match: match[0]
    })
  }
  sourceSearchIndex = sourceSearchMatches.length ? 0 : -1
  publishSourceSearch()
  if (sourceSearchIndex >= 0) revealSourceSearchMatch(sourceSearchIndex)
}

const handleSourceFindAction = (action: unknown): void => {
  if (!isSourceSurface() || sourceSearchMatches.length === 0) return
  const delta = action === 'previous' ? -1 : 1
  sourceSearchIndex = (sourceSearchIndex + delta + sourceSearchMatches.length) % sourceSearchMatches.length
  publishSourceSearch()
  revealSourceSearchMatch(sourceSearchIndex)
}

const isValidMuyaIndexCursor = (cursor: unknown): cursor is MuyaIndexCursorLike => {
  const c = cursor as MuyaIndexCursorLike | null | undefined
  return !!(c && c.anchor && c.focus)
}

watch(
  () => props.textDirection,
  (value, oldValue) => {
    if (value !== oldValue && editor.value) {
      setTextDirection(editor.value, value)
    }
  }
)

const getCursor = (cm: CMInstance) => {
  let focus = cm.getCursor('head')
  let anchor = cm.getCursor('anchor')

  const convertToMuyaCursor = (cursor: CMCursor) => {
    const line = cm.getLine(cursor.line)
    const preLine = cm.getLine(cursor.line - 1)
    const nextLine = cm.getLine(cursor.line + 1)
    return adjustCursor(
      cursor,
      preLine,
      line,
      nextLine,
      (lineNumber) => {
        return cm.getLine(lineNumber)
      },
      cm.lineCount()
    )
  }

  anchor = convertToMuyaCursor(anchor) // Selection start as Muya cursor
  focus = convertToMuyaCursor(focus) // Selection end as Muya cursor

  // Normalize cursor that `anchor` is always before `focus` because
  // this is the expected behavior in Muya.
  if (anchor && focus && anchor.line > focus.line) {
    const tmpCursor = focus
    focus = anchor
    anchor = tmpCursor
  }
  return { focus, anchor }
}

const getMarkdownAndCursor = (cm: CMInstance) => {
  return { cursor: getCursor(cm), markdown: latestMarkdown }
}

const commitWordCount = (id: string, markdown: string): void => {
  const revision = documentRevisionSnapshots.currentRevision(id)
  const wordCount = documentRevisionSnapshots.getWordCount(id, revision, () =>
    getWordCount(markdown)
  )
  latestWordCount = wordCount
  editorStore.LISTEN_FOR_CONTENT_CHANGE({
    id,
    revision,
    markdown: documentRevisionSnapshots.readMarkdown(id, revision) ?? markdown,
    wordCount,
    preserveTrailingNewlines: true
  })
}

const captureSourceSnapshot = (id: string, revision: number, cm: CMInstance): void => {
  if (viewDestroyed.value || tabId.value !== id) return
  if (documentRevisionSnapshots.currentRevision(id) !== revision) return
  const markdown = cm.getValue() as string
  latestMarkdown = markdown
  documentRevisionSnapshots.seedMarkdown(id, revision, markdown)
  editorStore.LISTEN_FOR_CONTENT_CHANGE({
    id,
    markdown,
    revision,
    muyaIndexCursor: getCursor(cm),
    preserveTrailingNewlines: true
  })
}

const flushSourceSnapshot = (): void => {
  if (tabId.value) sourceSnapshotScheduler.flush(tabId.value)
}

/**
 * This is to write the OLD content of the editor before switching to another tab
 * @param id
 */
const prepareTabSwitch = () => {
  if (commitTimer.value) {
    clearTimeout(commitTimer.value)
    commitTimer.value = null
  }
  if (tabId.value) {
    const id = tabId.value
    flushSourceSnapshot()
    const { cursor, markdown: newMarkdown } = getMarkdownAndCursor(editor.value)
    const revision = documentRevisionSnapshots.currentRevision(id)
    editorStore.LISTEN_FOR_CONTENT_CHANGE({
      id,
      revision,
      markdown: documentRevisionSnapshots.readMarkdown(id, revision) ?? newMarkdown,
      muyaIndexCursor: cursor,
      // The word-count timer is metadata-only. Reuse the last completed value
      // at a tab boundary so a large source document does not pay another full
      // text scan in the tab-switch critical path.
      wordCount: documentRevisionSnapshots.readWordCount(id, revision) ?? latestWordCount,
      preserveTrailingNewlines: true
    })
    tabId.value = null
  }
}

interface FileChangePayloadLike {
  id: string
  markdown?: string
  muyaIndexCursor?: unknown
}

const handleFileChange = (payload: unknown) => {
  const { id, markdown: newMarkdown, muyaIndexCursor } = payload as FileChangePayloadLike
  if (!editor.value) return

  // On same-tab reload (external file change), preserve scroll across
  // setValue. Snapshot every plausible scroll element (the outer
  // .source-code div, CodeMirror's own scroller, and the nearest scrollable
  // ancestor) and restore each, since which one is actually active depends
  // on CodeMirror's height:auto + outer overflow:auto interplay. Re-apply
  // on nextTick and the next animation frame to outlast layout side-effects
  // from sibling handlers: muya editor.vue also listens for file-changed.
  // A cross-tab switch must instead commit the outgoing tab's state; the
  // fresh markdown from disk would otherwise overwrite uncommitted edits.
  const isSameTabReload = tabId.value && tabId.value === id
  const scrollTargets: Array<{ el: HTMLElement; top: number }> = []
  if (isSameTabReload) {
    const seen = new Set<HTMLElement>()
    const consider = (el: HTMLElement | null | undefined) => {
      if (el && !seen.has(el)) {
        seen.add(el)
        scrollTargets.push({ el, top: el.scrollTop })
      }
    }
    consider(sourceCodeContainer.value)
    consider(editor.value.getScrollerElement?.() as HTMLElement | null | undefined)
    let node: HTMLElement | null = sourceCodeContainer.value?.parentElement ?? null
    while (node && node !== document.body) {
      const overflowY = window.getComputedStyle(node).overflowY
      if (
        (overflowY === 'auto' || overflowY === 'scroll') &&
        node.scrollHeight > node.clientHeight
      ) {
        consider(node)
        break
      }
      node = node.parentElement
    }
  } else {
    prepareTabSwitch()
    tabId.value = id
  }

  if (typeof newMarkdown === 'string') {
    latestMarkdown = newMarkdown
    applyingFileChange = true
    try {
      editor.value.setValue(newMarkdown)
    } finally {
      applyingFileChange = false
    }
  }

  // t('editor.sourceCode.cursorNullComment')
  if (isValidMuyaIndexCursor(muyaIndexCursor)) {
    const { anchor, focus } = muyaIndexCursor

    editor.value.setSelection(anchor, focus, { scroll: true }) // Scroll the focus into view.
  } else if (scrollTargets.length) {
    const restoreScroll = () => {
      for (const { el, top } of scrollTargets) el.scrollTop = top
    }
    restoreScroll()
    nextTick(restoreScroll)
    requestAnimationFrame(restoreScroll)
  } else {
    setCursorAtFirstLine(editor.value)
  }
}

const handleInvalidateImageCache = () => {
  if (editor.value) {
    editor.value.invalidateImageCache()
  }
}

const handleSelectAll = () => {
  if (!isSourceSurface()) {
    return
  }

  if (editor.value && editor.value.hasFocus()) {
    editor.value.execCommand('selectAll')
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

const handleUndo = () => {
  if (!isSourceSurface()) {
    return
  }

  if (editor.value) {
    editor.value.execCommand('undo')
  }
}

const handleRedo = () => {
  if (!isSourceSurface()) {
    return
  }

  if (editor.value) {
    editor.value.execCommand('redo')
  }
}

interface ImageActionPayload {
  id: string
  result: string
  alt: string
}

const handleImageAction = (payload: unknown) => {
  const { id, result, alt } = payload as ImageActionPayload
  const value: string = editor.value.getValue()
  const focus = editor.value.getCursor('focus')
  const anchor = editor.value.getCursor('anchor')
  const lines: string[] = value.split('\n')
  const index = lines.findIndex((line: string) => line.indexOf(id) > 0)

  if (index > -1) {
    const oldLine = lines[index]
    lines[index] = oldLine.replace(new RegExp(`!\\[${id}\\]\\(.*\\)`), `![${alt}](${result})`)
    const newValue = lines.join('\n')
    editor.value.setValue(newValue)
    const match = /(!\[.*\]\(.*\))/.exec(oldLine)
    if (!match) {
      // t('editor.sourceCode.imageStructureDeletedComment')
      return
    }
    const range = {
      start: match.index,
      end: match.index + match[1].length
    }
    const delta = alt.length + result.length + 5 - match[1].length

    const adjustPointer = (pointer: CMCursor) => {
      if (!pointer) {
        return
      }
      if (pointer.line !== index) {
        return
      }
      if (pointer.ch <= range.start) {
        // do nothing.
      } else if (pointer.ch > range.start && pointer.ch < range.end) {
        pointer.ch = range.start + alt.length + result.length + 5
      } else {
        pointer.ch += delta
      }
    }

    adjustPointer(focus)
    adjustPointer(anchor)
    if (focus && anchor) {
      editor.value.setSelection(anchor, focus, { scroll: true })
    } else {
      setCursorAtFirstLine(editor.value)
    }
  }
}

const saveContent = (cm: CMInstance) => {
  // The CodeMirror change event is the P0 input boundary. Mark the tab dirty
  // and persist the caret synchronously, but defer the O(document-size)
  // `getValue()` snapshot until the coalesced idle timer or a hard boundary.
  if (!viewDestroyed.value) {
    if (tabId.value) {
      const id = tabId.value
      const revision = editorStore.MARK_CONTENT_DIRTY(id)
      editorStore.PERSIST_MUYA_INDEX_CURSOR(id, getCursor(cm))
      sourceSnapshotScheduler.request(id, revision, (latestRevision) =>
        captureSourceSnapshot(id, latestRevision, cm)
      )

      // Word counting scans the whole source text. Keep it out of the
      // CodeMirror change callback and publish it once the user pauses. Flush
      // the pending snapshot first so this timer never performs a second full
      // document read.
      if (commitTimer.value) clearTimeout(commitTimer.value)
      commitTimer.value = setTimeout(() => {
        commitTimer.value = null
        if (viewDestroyed.value || tabId.value !== id) return
        sourceSnapshotScheduler.flush(id)
        commitWordCount(id, latestMarkdown)
      }, 120)
    } else {
      // This may occur during tab switching but should not occur otherwise.
      console.warn('LISTEN_FOR_CONTENT_CHANGE: Cannot commit changes because not tab id was set!')
    }
  }
}

const saveCursor = (cm: CMInstance) => {
  if (viewDestroyed.value || applyingFileChange || !tabId.value) return
  editorStore.PERSIST_MUYA_INDEX_CURSOR(tabId.value, getCursor(cm))
}

const listenChange = () => {
  editor.value.on('change', (cm: CMInstance) => {
    if (!applyingFileChange) saveContent(cm)
  })
  editor.value.on('cursorActivity', (cm: CMInstance) => {
    saveCursor(cm)
  })
}

// #3580: in Source Code mode the WYSIWYG container is hidden, so the
// `scroll-to-header` bus event (emitted when a TOC entry is clicked) must scroll
// CodeMirror instead. Resolve the TOC entry to its heading line in the source.
const handleScrollToHeader = (slug: unknown) => {
  if (!editor.value) return
  const index = editorStore.listToc.findIndex((item) => item.slug === slug)
  if (index < 0) return
  const line = findMarkdownHeadingLine(editor.value.getValue(), index)
  if (line < 0) return
  // `.source-code` is the scroll container (CodeMirror renders full-height with
  // viewportMargin: Infinity, so its own scroller never scrolls).
  scrollSourceEditorToLine(editor.value, line, sourceCodeContainer.value)
}

onMounted(() => {
  if (!currentTab.value) return
  const { id } = currentTab.value
  // reset currentTab scrollTop position because the codeMirror scroll position is completely different from the muya scroll position
  // reset blocks as well because the blocks are only valid in muya
  // reset cursor because this is a direct "key-cursor", not a muyaIndexCursor, which is {focus: number, anchor: number}
  currentTab.value.scrollTop = 0
  currentTab.value.blocks = undefined
  currentTab.value.cursor = undefined

  const { markdown, muyaIndexCursor, textDirection } = props
  latestMarkdown = markdown ?? ''
  latestWordCount = currentTab.value.wordCount
  const container = sourceCodeContainer.value
  const degraded = props.degraded === true
  const codeMirrorConfig: Record<string, unknown> = {
    value: markdown,
    lineNumbers: true,
    autofocus: true,
    lineWrapping: !degraded,
    styleActiveLine: true,
    direction: textDirection,
    viewportMargin: degraded ? EXTREME_DOCUMENT_VIEWPORT_MARGIN : Infinity,
    lineNumberFormatter (line: number) {
      if (line % 10 === 0 || line === 1) {
        return line
      } else {
        return ''
      }
    }
  }

  if (getApplicationAppearance(theme.value) === 'dark') codeMirrorConfig.theme = 'railscasts'

  bus.on('file-loaded', handleFileChange)
  bus.on('invalidate-image-cache', handleInvalidateImageCache)
  bus.on('file-changed', handleFileChange)
  bus.on('selectAll', handleSelectAll)
  bus.on('undo', handleUndo)
  bus.on('redo', handleRedo)
  bus.on('image-action', handleImageAction)
  bus.on('scroll-to-header', handleScrollToHeader)
  bus.on('searchValue', handleSourceSearch)
  bus.on('find-action', handleSourceFindAction)
  bus.on('flush-active-editor', flushSourceSnapshot)
  bus.on('flush-active-editor-for-save', flushSourceSnapshot)
  bus.on('flush-active-editor-for-tab-switch', flushSourceSnapshot)

  // For some reason, code mirror does not seem to play well with Vue's refs if we reference editor.value directly.
  // See https://github.com/codemirror/codemirror5/issues/6886 - hence, we need to use a local variable first.
  const codeMirrorInstance = codeMirror(container, codeMirrorConfig)

  // `markdown-math` wraps the standard Markdown mode and delegates `$...$` and
  // `$$...$$` spans to stex so subscript underscores in math do not flip the
  // outer mode into emphasis. See src/renderer/src/codeMirror/markdownMathMode.js.
  codeMirrorInstance.setOption('mode', 'markdown-math')

  codeMirrorInstance.on('contextmenu', (_cm: CMInstance, event: Event) => {
    event.preventDefault()
    event.stopPropagation()
  })

  if (isValidMuyaIndexCursor(muyaIndexCursor)) {
    const { anchor, focus } = muyaIndexCursor
    codeMirrorInstance.setSelection(anchor, focus, { scroll: true })
  } else {
    setCursorAtFirstLine(codeMirrorInstance)
  }

  editor.value = codeMirrorInstance
  tabId.value = id

  listenChange()
})

onBeforeUnmount(() => {
  if (commitTimer.value) clearTimeout(commitTimer.value)

  bus.off('file-loaded', handleFileChange)
  bus.off('invalidate-image-cache', handleInvalidateImageCache)
  bus.off('file-changed', handleFileChange)
  bus.off('selectAll', handleSelectAll)
  bus.off('undo', handleUndo)
  bus.off('redo', handleRedo)
  bus.off('image-action', handleImageAction)
  bus.off('scroll-to-header', handleScrollToHeader)
  bus.off('searchValue', handleSourceSearch)
  bus.off('find-action', handleSourceFindAction)
  bus.off('flush-active-editor', flushSourceSnapshot)
  bus.off('flush-active-editor-for-save', flushSourceSnapshot)
  bus.off('flush-active-editor-for-tab-switch', flushSourceSnapshot)

  const id = tabId.value
  // Flush while the component is still current; the callback is guarded by
  // tabId/viewDestroyed and would otherwise reject the last edit.
  if (id) sourceSnapshotScheduler.flush(id)
  viewDestroyed.value = true
  const { cursor, markdown: newMarkdown } = getMarkdownAndCursor(editor.value)
  if (id) commitWordCount(id, newMarkdown)
  sourceSnapshotScheduler.dispose()
  bus.emit('file-changed', {
    id,
    markdown: newMarkdown,
    muyaIndexCursor: cursor,
    renderCursor: true
  })
})
</script>

<style>
.source-code {
  height: calc(100vh - var(--titleBarHeight));
  box-sizing: border-box;
  overflow: auto;
}
.source-code .CodeMirror {
  height: auto;
  margin: 50px auto;
  max-width: var(--editorAreaWidth);
  background: transparent;
}
.source-code .CodeMirror-gutters {
  border-right: none;
  background-color: transparent;
}
.source-code .CodeMirror-activeline-background,
.source-code .CodeMirror-activeline-gutter {
  background: var(--floatHoverColor);
}
</style>
