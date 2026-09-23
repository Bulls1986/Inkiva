import { defineStore } from 'pinia'
import bus from '../bus'
import { useLayoutStore } from './layout'
import type { EditorEditAction, FormatAction, ParagraphAction } from '@shared/types/bus'
import { executeWhenEditorReady } from '../services/editorCommandReadiness'

const EDITOR_EDIT_ACTIONS = new Set<EditorEditAction>([
  'undo',
  'redo',
  'copyAsRich',
  'copyAsHtml',
  'copyAsMarkdown',
  'pasteAsPlainText',
  'selectAll',
  'duplicate',
  'createParagraph',
  'deleteParagraph',
  'find',
  'findNext',
  'findPrev',
  'replace',
  'findInFolder'
])

const PARAGRAPH_ACTIONS = new Set<ParagraphAction>([
  'heading 1',
  'heading 2',
  'heading 3',
  'heading 4',
  'heading 5',
  'heading 6',
  'upgrade heading',
  'degrade heading',
  'table',
  'pre',
  'blockquote',
  'mathblock',
  'html',
  'ol-bullet',
  'ol-order',
  'ul-bullet',
  'ul-task',
  'loose-list-item',
  'paragraph',
  'reset-to-paragraph',
  'hr',
  'front-matter'
])

const FORMAT_ACTIONS = new Set<FormatAction>([
  'strong',
  'em',
  'u',
  'mark',
  'sup',
  'sub',
  'inline_code',
  'inline_math',
  'del',
  'link',
  'image',
  'clear'
])

const isEditorEditAction = (value: string): value is EditorEditAction => EDITOR_EDIT_ACTIONS.has(value as EditorEditAction)
const isParagraphAction = (value: string): value is ParagraphAction => PARAGRAPH_ACTIONS.has(value as ParagraphAction)
const isFormatAction = (value: string): value is FormatAction => FORMAT_ACTIONS.has(value as FormatAction)

const EDITOR_CONTEXT_EDIT_ACTIONS = new Set<EditorEditAction>([
  'undo',
  'redo',
  'copyAsRich',
  'copyAsHtml',
  'copyAsMarkdown',
  'pasteAsPlainText',
  'selectAll',
  'duplicate',
  'createParagraph',
  'deleteParagraph'
])

const emitEditorEditAction = (type: EditorEditAction): void => {
  switch (type) {
    case 'undo': bus.emit('undo', 'undo'); break
    case 'redo': bus.emit('redo', 'redo'); break
    case 'copyAsRich': bus.emit('copyAsRich', 'copyAsRich'); break
    case 'copyAsHtml': bus.emit('copyAsHtml', 'copyAsHtml'); break
    case 'copyAsMarkdown': bus.emit('copyAsMarkdown', 'copyAsMarkdown'); break
    case 'pasteAsPlainText': bus.emit('pasteAsPlainText', 'pasteAsPlainText'); break
    case 'selectAll': bus.emit('selectAll', 'selectAll'); break
    case 'duplicate': bus.emit('duplicate', 'duplicate'); break
    case 'createParagraph': bus.emit('createParagraph', 'createParagraph'); break
    case 'deleteParagraph': bus.emit('deleteParagraph', 'deleteParagraph'); break
    case 'find': bus.emit('find', 'find'); break
    case 'findNext': bus.emit('findNext', 'findNext'); break
    case 'findPrev': bus.emit('findPrev', 'findPrev'); break
    case 'replace': bus.emit('replace', 'replace'); break
    case 'findInFolder': bus.emit('findInFolder', 'findInFolder'); break
  }
}

const emitEditorEditActionWhenReady = (type: EditorEditAction): void => {
  if (EDITOR_CONTEXT_EDIT_ACTIONS.has(type)) {
    executeWhenEditorReady(() => emitEditorEditAction(type))
    return
  }
  emitEditorEditAction(type)
}

export const useListenForMainStore = defineStore('listenForMain', () => {
  function EDITOR_EDIT_ACTION(type: string): void {
    const layoutStore = useLayoutStore()
    if (type === 'findInFolder') {
      layoutStore.SET_LAYOUT({
        rightColumn: 'search',
        showSideBar: true
      })
    }
    if (isEditorEditAction(type)) emitEditorEditActionWhenReady(type)
  }

  function LISTEN_FOR_EDIT(): void {
    // Pass `type` through as-is (no String() coercion) — matches develop's JS
    // behavior, including when callers send unexpected non-string values.
    window.electron.ipcRenderer.on('mt::editor-edit-action', (_e, type) => {
      EDITOR_EDIT_ACTION(type as string)
    })
    bus.on('mt::editor-edit-action', (type) => {
      EDITOR_EDIT_ACTION(type)
    })
  }

  function LISTEN_FOR_SHOW_DIALOG(): void {
    window.electron.ipcRenderer.on('mt::about-dialog', () => {
      bus.emit('aboutDialog')
    })
    window.electron.ipcRenderer.on('mt::show-export-dialog', (_e, type) => {
      bus.emit('showExportDialog', type)
    })
    window.electron.ipcRenderer.on('mt::export-again', () => {
      bus.emit('export-again')
    })
  }

  function LISTEN_FOR_PARAGRAPH_INLINE_STYLE(): void {
    // Pre-migration JS destructured `{ type }` and re-emitted it without a
    // guard. Restore the same shape; bus listeners that expect a payload get
    // the same `type` value (string at runtime per main process emitters).
    window.electron.ipcRenderer.on('mt::editor-paragraph-action', (_e, { type }) => {
      if (isParagraphAction(type)) executeWhenEditorReady(() => bus.emit('paragraph', type))
    })
    window.electron.ipcRenderer.on('mt::editor-format-action', (_e, { type }) => {
      if (isFormatAction(type)) executeWhenEditorReady(() => bus.emit('format', type))
    })
  }

  return {
    EDITOR_EDIT_ACTION,
    LISTEN_FOR_EDIT,
    LISTEN_FOR_SHOW_DIALOG,
    LISTEN_FOR_PARAGRAPH_INLINE_STYLE
  }
})
