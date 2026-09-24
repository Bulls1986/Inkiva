import type { ExportType } from './files'

export type ExportDialogType = 'print' | ExportType
export type SidebarCreateType = 'file' | 'directory'
export type SidebarClipboardType = 'copy' | 'cut'
export type LayoutEntry = 'showSideBar' | 'showTabBar' | 'splitEditor'
export type ViewEntry = 'sourceCode' | 'typewriter' | 'focus'
export type EditorEditAction =
  | 'undo'
  | 'redo'
  | 'copyAsRich'
  | 'copyAsHtml'
  | 'copyAsMarkdown'
  | 'pasteAsPlainText'
  | 'selectAll'
  | 'duplicate'
  | 'createParagraph'
  | 'deleteParagraph'
  | 'find'
  | 'findNext'
  | 'findPrev'
  | 'replace'
  | 'findInFolder'

export type ParagraphAction =
  | 'heading 1'
  | 'heading 2'
  | 'heading 3'
  | 'heading 4'
  | 'heading 5'
  | 'heading 6'
  | 'upgrade heading'
  | 'degrade heading'
  | 'table'
  | 'pre'
  | 'blockquote'
  | 'mathblock'
  | 'html'
  | 'ol-bullet'
  | 'ol-order'
  | 'ul-bullet'
  | 'ul-task'
  | 'loose-list-item'
  | 'paragraph'
  | 'reset-to-paragraph'
  | 'hr'
  | 'front-matter'

export type FormatAction =
  | 'strong'
  | 'em'
  | 'u'
  | 'mark'
  | 'sup'
  | 'sub'
  | 'inline_code'
  | 'inline_math'
  | 'del'
  | 'link'
  | 'image'
  | 'clear'

export interface RendererCommandLike {
  id: string
}

export interface FileChangePayload {
  id?: string | null
  markdown: string
  cursor?: unknown
  muyaIndexCursor?: unknown
  renderCursor?: boolean
  history?: unknown
  scrollTop?: number
  /** Semantic viewport restore marker. Only tab/session activation should set this. */
  viewportAnchorSlug?: string | null
  blocks?: unknown
  contentAlreadyLoaded?: boolean
  externalReload?: boolean
  isReload?: boolean
}

export interface ImageActionPayload {
  id: string
  result: string
  alt?: string
}

export interface ProjectTreeChangedPayload {
  type: string
  change?: unknown
}

export interface SearchOptions {
  selectHighlight?: boolean
  isCaseSensitive?: boolean
  isWholeWord?: boolean
  isRegexp?: boolean
}

export interface SearchValuePayload {
  value: string
  opt?: SearchOptions
}

export interface ReplaceValuePayload {
  value: string
  opt?: SearchOptions & {
    isSingle?: boolean
  }
}

export interface ReplaceMisspellingPayload {
  word: string
  replacement: string
}

export interface EditorCommandReadinessRequest {
  resolve: (ready: boolean) => void
}

export type BusEvents = {
  aboutDialog: undefined
  'cmd::execute': string
  'cmd::register-command': RendererCommandLike
  'cmd::sort-commands': undefined
  copyAsHtml: 'copyAsHtml'
  copyAsMarkdown: 'copyAsMarkdown'
  copyAsRich: 'copyAsRich'
  createParagraph: 'createParagraph'
  deleteParagraph: 'deleteParagraph'
  duplicate: 'duplicate'
  'EDITOR_TABS::change-max-width': number
  'editor-blur': undefined
  'editor-focus': undefined
  'editor-command-readiness': EditorCommandReadinessRequest
  export: object
  'export-again': undefined
  'file-changed': FileChangePayload
  'file-loaded': FileChangePayload
  find: 'find'
  'find-action': string
  findInFolder: 'findInFolder'
  findNext: 'findNext'
  findPrev: 'findPrev'
  'flush-active-editor': undefined
  'flush-active-editor-for-save': undefined
  'flush-active-editor-for-tab-switch': undefined
  format: FormatAction
  'image-action': ImageActionPayload
  importDialog: boolean
  'image-uploaded': string
  'insert-image': string
  insertParagraph: string
  'invalidate-image-cache': undefined
  'language-changed': string
  'mt::editor-ask-file-save': undefined
  'mt::editor-ask-file-save-as': undefined
  'mt::editor-close-tab': null
  'mt::editor-edit-action': EditorEditAction
  'mt::editor-move-file': null
  'mt::editor-rename-file': null
  'mt::new-untitled-tab': { selected: boolean; markdown: string }
  'mt::set-file-encoding': string
  'mt::set-final-newline': number
  'mt::set-line-ending': string
  'mt::tabs-cycle-left': undefined
  'mt::tabs-cycle-right': undefined
  'mt::window-zoom': number
  'open-command-spellchecker-switch-language': undefined
  paragraph: ParagraphAction
  pasteAsPlainText: 'pasteAsPlainText'
  'print-service-clearup': undefined
  'project-tree-changed': ProjectTreeChangedPayload
  redo: 'redo'
  rename: undefined
  replace: 'replace'
  'replace-misspelling': ReplaceMisspellingPayload
  replaceValue: ReplaceValuePayload
  'screenshot-captured': string
  'scroll-to-anchor-element': HTMLElement
  'scroll-to-header': string | undefined
  'search-blur': undefined
  searchValue: SearchValuePayload
  selectAll: 'selectAll'
  'show-command-palette': RendererCommandLike | null | undefined
  showExportDialog: ExportDialogType
  'SIDEBAR::copy-cut': SidebarClipboardType
  'SIDEBAR::new': SidebarCreateType
  'SIDEBAR::paste': undefined
  'SIDEBAR::remove': undefined
  'SIDEBAR::rename': undefined
  'SIDEBAR::show-in-folder': undefined
  'SIDEBAR::show-new-input': undefined
  'SIDEBAR::show-rename-input': undefined
  'switch-spellchecker-language': string | undefined
  'TABS::close-all': undefined
  'TABS::close-others': string
  'TABS::close-right': string
  'TABS::close-saved': undefined
  'TABS::close-this': string
  'TABS::copy-path': string
  'TABS::rename': string
  'TABS::reopen-closed': undefined
  'TABS::show-in-folder': string
  'TABS::toggle-pin': string
  undo: 'undo'
  'view:toggle-layout-entry': LayoutEntry
  'view:toggle-view-entry': ViewEntry
}
