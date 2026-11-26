<template>
  <div class="print-settings-dialog">
    <el-dialog
      v-model="showExportSettingsDialog"
      :show-close="false"
      :modal="true"
      custom-class="ag-dialog-table"
      :width="isPdf ? '880px' : '500px'"
    >
      <h3>{{ t('exportSettings.title') }}</h3>
      <div
        class="dialog-body-grid"
        :class="{ 'dialog-body-grid--pdf': isPdf }"
      >
        <div class="dialog-settings">
          <el-tabs v-model="activeName">
            <el-tab-pane
              :label="t('exportSettings.info.label')"
              name="info"
            >
              <span class="text">{{ t('exportSettings.info.description') }}</span>
            </el-tab-pane>
            <el-tab-pane
              :label="t('exportSettings.page.label')"
              name="page"
            >
              <!-- HTML -->
              <div v-if="!isPrintable">
                <text-box
                  :description="t('exportSettings.page.pageTitle')"
                  :input="htmlTitle"
                  :emit-time="0"
                  :on-change="(value: unknown) => onSelectChange('htmlTitle', value)"
                />
              </div>

              <!-- PDF/Print -->
              <div v-if="isPrintable">
                <div v-if="exportType === 'pdf'">
                  <cur-select
                    class="page-size-select"
                    :description="t('exportSettings.page.pageSize')"
                    :value="pageSize"
                    :options="pageSizeList"
                    :on-change="(value: unknown) => onSelectChange('pageSize', value)"
                  />
                  <div
                    v-if="pageSize === 'custom'"
                    class="row"
                  >
                    <div>{{ t('exportSettings.page.widthHeight') }}</div>
                    <el-input-number
                      v-model="pageSizeWidth"
                      size="mini"
                      controls-position="right"
                      :min="100"
                    />
                    <el-input-number
                      v-model="pageSizeHeight"
                      size="mini"
                      controls-position="right"
                      :min="100"
                    />
                  </div>

                  <bool
                    :description="t('exportSettings.page.landscapeOrientation')"
                    :bool="isLandscape"
                    :on-change="(value: unknown) => onSelectChange('isLandscape', value)"
                  />
                </div>

                <div class="row">
                  <div class="description">
                    {{ t('exportSettings.page.pageMargin') }}
                  </div>
                  <div>
                    <div class="label">
                      {{ t('exportSettings.page.topBottom') }}
                    </div>
                    <el-input-number
                      v-model="pageMarginTop"
                      size="mini"
                      controls-position="right"
                      :min="0"
                      :max="100"
                    />
                    <el-input-number
                      v-model="pageMarginBottom"
                      size="mini"
                      controls-position="right"
                      :min="0"
                      :max="100"
                    />
                  </div>
                  <div>
                    <div class="label">
                      {{ t('exportSettings.page.leftRight') }}
                    </div>
                    <el-input-number
                      v-model="pageMarginLeft"
                      size="mini"
                      controls-position="right"
                      :min="0"
                      :max="100"
                    />
                    <el-input-number
                      v-model="pageMarginRight"
                      size="mini"
                      controls-position="right"
                      :min="0"
                      :max="100"
                    />
                  </div>
                </div>
              </div>
            </el-tab-pane>
            <el-tab-pane
              :label="t('exportSettings.style.label')"
              name="style"
            >
              <bool
                :description="t('exportSettings.style.overwriteThemeFont')"
                :bool="fontSettingsOverwrite"
                :on-change="(value: unknown) => onSelectChange('fontSettingsOverwrite', value)"
              />
              <div v-if="fontSettingsOverwrite">
                <font-text-box
                  :description="t('exportSettings.style.fontFamily')"
                  :value="fontFamily"
                  :on-change="(value: unknown) => onSelectChange('fontFamily', value)"
                />
                <range
                  :description="t('exportSettings.style.fontSize')"
                  :value="fontSize"
                  :min="8"
                  :max="32"
                  unit="px"
                  :step="1"
                  :on-change="(value: unknown) => onSelectChange('fontSize', value)"
                />
                <range
                  :description="t('exportSettings.style.lineHeight')"
                  :value="lineHeight"
                  :min="1.0"
                  :max="2.0"
                  :step="0.1"
                  :on-change="(value: unknown) => onSelectChange('lineHeight', value)"
                />
              </div>
              <bool
                :description="t('exportSettings.autoNumberingHeadings')"
                :bool="autoNumberingHeadings"
                :on-change="(value: unknown) => onSelectChange('autoNumberingHeadings', value)"
              />
              <bool
                :description="t('exportSettings.showFrontMatter')"
                :bool="showFrontMatter"
                :on-change="(value: unknown) => onSelectChange('showFrontMatter', value)"
              />
            </el-tab-pane>
            <el-tab-pane
              :label="t('exportSettings.theme.label')"
              name="theme"
            >
              <div class="text">
                {{ t('exportSettings.theme.description') }}
              </div>
              <cur-select
                :description="t('exportSettings.theme.theme')"
                more="https://marktext.me/docs/export-themes"
                :value="theme"
                :options="themeList"
                :on-change="(value: unknown) => onSelectChange('theme', value)"
              />
            </el-tab-pane>
            <el-tab-pane
              v-if="isPrintable"
              :label="t('exportSettings.headerFooter.label')"
              name="header"
            >
              <div class="text">
                {{ t('exportSettings.headerFooter.description') }}
              </div>
              <cur-select
                :description="t('exportSettings.headerFooter.headerType')"
                :value="headerType"
                :options="headerFooterTypes"
                :on-change="(value: unknown) => onSelectChange('headerType', value)"
              />
              <text-box
                v-if="headerType === 2"
                :description="t('exportSettings.headerFooter.leftHeaderText')"
                :input="headerTextLeft"
                :emit-time="0"
                :on-change="(value: unknown) => onSelectChange('headerTextLeft', value)"
              />
              <text-box
                v-if="headerType !== 0"
                :description="t('exportSettings.headerFooter.mainHeaderText')"
                :input="headerTextCenter"
                :emit-time="0"
                :on-change="(value: unknown) => onSelectChange('headerTextCenter', value)"
              />
              <text-box
                v-if="headerType === 2"
                :description="t('exportSettings.headerFooter.rightHeaderText')"
                :input="headerTextRight"
                :emit-time="0"
                :on-change="(value: unknown) => onSelectChange('headerTextRight', value)"
              />

              <cur-select
                :description="t('exportSettings.headerFooter.footerType')"
                :value="footerType"
                :options="headerFooterTypes"
                :on-change="(value: unknown) => onSelectChange('footerType', value)"
              />
              <text-box
                v-if="footerType === 2"
                :description="t('exportSettings.headerFooter.leftFooterText')"
                :input="footerTextLeft"
                :emit-time="0"
                :on-change="(value: unknown) => onSelectChange('footerTextLeft', value)"
              />
              <text-box
                v-if="footerType !== 0"
                :description="t('exportSettings.headerFooter.mainFooterText')"
                :input="footerTextCenter"
                :emit-time="0"
                :on-change="(value: unknown) => onSelectChange('footerTextCenter', value)"
              />
              <text-box
                v-if="footerType === 2"
                :description="t('exportSettings.headerFooter.rightFooterText')"
                :input="footerTextRight"
                :emit-time="0"
                :on-change="(value: unknown) => onSelectChange('footerTextRight', value)"
              />

              <bool
                :description="t('exportSettings.headerFooter.customizeStyle')"
                :bool="headerFooterCustomize"
                :on-change="(value: unknown) => onSelectChange('headerFooterCustomize', value)"
              />

              <div v-if="headerFooterCustomize">
                <bool
                  :description="t('exportSettings.headerFooter.allowStyled')"
                  :bool="headerFooterStyled"
                  :on-change="(value: unknown) => onSelectChange('headerFooterStyled', value)"
                />
                <range
                  :description="t('exportSettings.headerFooter.fontSize')"
                  :value="headerFooterFontSize"
                  :min="8"
                  :max="20"
                  unit="px"
                  :step="1"
                  :on-change="(value: unknown) => onSelectChange('headerFooterFontSize', value)"
                />
              </div>
            </el-tab-pane>

            <el-tab-pane
              :label="t('exportSettings.toc.label')"
              name="toc"
            >
              <bool
                :description="t('exportSettings.toc.includeTopHeading')"
                :detailed-description="t('exportSettings.toc.includeTopHeadingDetail')"
                :bool="tocIncludeTopHeading"
                :on-change="(value: unknown) => onSelectChange('tocIncludeTopHeading', value)"
              />
              <text-box
                :description="t('exportSettings.toc.title')"
                :input="tocTitle"
                :emit-time="0"
                :on-change="(value: unknown) => onSelectChange('tocTitle', value)"
              />
            </el-tab-pane>
          </el-tabs>
        </div>
        <pdf-preview-panel
          v-if="isPdf"
          class="dialog-preview"
        />
      </div>
      <div class="button-controlls">
        <template v-if="isPdf">
          <button
            v-if="!previewState.previewId && previewState.status !== 'generating'"
            class="button-primary"
            data-testid="pdf-preview-generate"
            @click="handleGeneratePreview"
          >
            {{ t('exportSettings.generatePreview') }}
          </button>
          <button
            v-else
            class="button-primary"
            data-testid="pdf-preview-regenerate"
            :disabled="previewState.status === 'generating' || previewState.status === 'saving'"
            @click="handleGeneratePreview"
          >
            {{ t('exportSettings.refreshPreview') }}
          </button>
          <button
            class="button-primary"
            data-testid="pdf-preview-save"
            :disabled="previewState.status !== 'ready'"
            @click="handleSavePreview"
          >
            {{ t('exportSettings.savePreview') }}
          </button>
          <button
            class="button-plain"
            data-testid="pdf-preview-cancel"
            @click="handleCancelPreview"
          >
            {{ t('exportSettings.cancel') }}
          </button>
        </template>
        <button
          v-else
          class="button-primary"
          @click="handleClicked"
        >
          {{ t('exportSettings.export') }}
        </button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch, type Ref } from 'vue'
import bus from '../../bus'
import { loadExportSettings, saveExportSettings } from './persistence'
import Bool from '@/prefComponents/common/bool/index.vue'
import CurSelect from '@/prefComponents/common/select/index.vue'
import FontTextBox from '@/prefComponents/common/fontTextBox/index.vue'
import Range from '@/prefComponents/common/range/index.vue'
import TextBox from '@/prefComponents/common/textBox/index.vue'
import { getPageSizeList, getHeaderFooterTypes, getExportThemeList } from './exportOptions'
import { useI18n } from 'vue-i18n'
import PdfPreviewPanel from './PdfPreviewPanel.vue'
import { pdfPreviewSession } from '@/services/pdfPreviewRuntime'
import { requestPdfPreviewFromEditor } from '@/services/pdfPreviewContentProvider'
import { computeSettingsVersion } from './previewVersions'
import { useEditorStore } from '@/store/editor'
import { documentRevisionSnapshots } from '@/services/documentRevisionSnapshot'

const { t } = useI18n()
const editorStore = useEditorStore()

const previewState = pdfPreviewSession.state
const isPdf = computed(() => exportType.value === 'pdf')

const exportType = ref('')
const themesLoaded = ref(false)
const isPrintable = ref(true)
const showExportSettingsDialog = ref(false)
const activeName = ref('info')
const htmlTitle = ref('')
const pageSize = ref('A4')
const pageSizeWidth = ref(210)
const pageSizeHeight = ref(297)
const isLandscape = ref(false)
const pageMarginTop = ref(20)
const pageMarginRight = ref(15)
const pageMarginBottom = ref(20)
const pageMarginLeft = ref(15)
const fontSettingsOverwrite = ref(false)
const fontFamily = ref('Default')
const fontSize = ref(14)
const lineHeight = ref(1.5)
const autoNumberingHeadings = ref(false)
const showFrontMatter = ref(false)
const theme = ref('default')
const themeList = ref(getExportThemeList())
const pageSizeList = ref(getPageSizeList())
const headerFooterTypes = ref(getHeaderFooterTypes())
const headerType = ref(0)
const headerTextLeft = ref('')
const headerTextCenter = ref('')
const headerTextRight = ref('')
const footerType = ref(0)
const footerTextLeft = ref('')
const footerTextCenter = ref('')
const footerTextRight = ref('')
const headerFooterCustomize = ref(false)
const headerFooterStyled = ref(true)
const headerFooterFontSize = ref(12)
const tocTitle = ref('')
const tocIncludeTopHeading = ref(true)

// #2287 — persist the chosen export options across sessions. Every option ref
// is registered here; changes are saved to localStorage and restored on mount.
const persistableSettings: Record<string, Ref<unknown>> = {
  htmlTitle,
  pageSize,
  pageSizeWidth,
  pageSizeHeight,
  isLandscape,
  pageMarginTop,
  pageMarginRight,
  pageMarginBottom,
  pageMarginLeft,
  fontSettingsOverwrite,
  fontFamily,
  fontSize,
  lineHeight,
  autoNumberingHeadings,
  showFrontMatter,
  theme,
  headerType,
  headerTextLeft,
  headerTextCenter,
  headerTextRight,
  footerType,
  footerTextLeft,
  footerTextCenter,
  footerTextRight,
  headerFooterCustomize,
  headerFooterStyled,
  headerFooterFontSize,
  tocTitle,
  tocIncludeTopHeading
}

const restoreExportSettings = () => {
  const saved = loadExportSettings()
  for (const [key, settingRef] of Object.entries(persistableSettings)) {
    if (key in saved) settingRef.value = saved[key]
  }
}

watch(Object.values(persistableSettings), () => {
  saveExportSettings(
    Object.fromEntries(
      Object.entries(persistableSettings).map(([key, settingRef]) => [key, settingRef.value])
    )
  )
})

onMounted(() => {
  restoreExportSettings()
  bus.on('showExportDialog', showDialog)
  bus.on('language-changed', updateTranslations)
})

onBeforeUnmount(() => {
  bus.off('showExportDialog', showDialog)
  bus.off('language-changed', updateTranslations)
})

const updateTranslations = () => {
  themeList.value = getExportThemeList()
  pageSizeList.value = getPageSizeList()
  headerFooterTypes.value = getHeaderFooterTypes()
}

const repeatExport = ref(false)
// Bumped on every dialog open. A save that finishes after the user already
// started a new export must not close that newer dialog.
let dialogSession = 0

const showDialog = (type: unknown) => {
  dialogSession += 1
  const payload = type as { type?: string, reuseLastPath?: boolean } | string | null
  const exportTypeValue =
    typeof payload === 'string' ? payload : String(payload?.type ?? '')
  // Ignore an empty request: it would clear the export kind while a PDF preview
  // is running, unmounting the panel and tearing that preview down.
  if (!exportTypeValue) return
  repeatExport.value = typeof payload === 'object' && !!payload?.reuseLastPath
  exportType.value = exportTypeValue
  isPrintable.value = exportTypeValue !== 'styledHtml'
  if (!isPrintable.value && (activeName.value === 'header' || activeName.value === 'page')) {
    activeName.value = 'info'
  }

  showExportSettingsDialog.value = true
  // A new dialog session starts from a clean preview unless it is the same PDF
  // flow that is already showing one.
  if (exportTypeValue !== 'pdf') {
    pdfPreviewSession.teardown()
  }
  bus.emit('editor-blur')

  if (!themesLoaded.value) {
    themesLoaded.value = true
    loadThemesFromDisk()
  }
}

const collectOptions = (): Record<string, unknown> => {
  const options: Record<string, unknown> = {
    type: exportType.value,
    // Export Again keeps the last confirmed target as the save-dialog default;
    // the user still confirms a fresh preview before anything is written.
    reuseLastPath: repeatExport.value,
    pageSize: pageSize.value,
    pageSizeWidth: pageSizeWidth.value,
    pageSizeHeight: pageSizeHeight.value,
    isLandscape: isLandscape.value,
    pageMarginTop: pageMarginTop.value,
    pageMarginRight: pageMarginRight.value,
    pageMarginBottom: pageMarginBottom.value,
    pageMarginLeft: pageMarginLeft.value,
    autoNumberingHeadings: autoNumberingHeadings.value,
    showFrontMatter: showFrontMatter.value,
    theme: theme.value === 'default' ? null : theme.value,
    tocTitle: tocTitle.value,
    tocIncludeTopHeading: tocIncludeTopHeading.value
  }

  if (!isPrintable.value) {
    options.htmlTitle = htmlTitle.value
  }

  if (fontSettingsOverwrite.value) {
    Object.assign(options, {
      fontSize: fontSize.value,
      lineHeight: lineHeight.value,
      fontFamily: fontFamily.value === 'Default' ? null : fontFamily.value
    })
  }

  if (headerType.value !== 0) {
    Object.assign(options, {
      header: {
        type: headerType.value,
        left: headerTextLeft.value,
        center: headerTextCenter.value,
        right: headerTextRight.value
      }
    })
  }

  if (footerType.value !== 0) {
    Object.assign(options, {
      footer: {
        type: footerType.value,
        left: footerTextLeft.value,
        center: footerTextCenter.value,
        right: footerTextRight.value
      }
    })
  }

  if (headerFooterCustomize.value) {
    Object.assign(options, {
      headerFooterStyled: headerFooterStyled.value,
      headerFooterFontSize: headerFooterFontSize.value
    })
  }

  return options
}

const handleClicked = () => {
  const options = collectOptions()
  showExportSettingsDialog.value = false
  bus.emit('export', options)
}

const previewSettingsVersion = computed(() => computeSettingsVersion(collectOptions()))

// Any option that changes paper, margins, theme, fonts, header/footer or TOC
// makes the paginated result obsolete: the old pages stay visible for
// reference, but saving is disabled until the user regenerates (P2).
watch(previewSettingsVersion, (next) => {
  const versions = previewState.versions
  if (!versions) return
  if (versions.settingsVersion === next) return
  pdfPreviewSession.invalidate('settings')
})

watch(showExportSettingsDialog, (visible) => {
  if (!visible) {
    pdfPreviewSession.teardown()
  }
})

const handleGeneratePreview = () => {
  // The editor registers itself as the preview content provider, so a click can
  // never be dropped by a bus listener that is not attached yet.
  requestPdfPreviewFromEditor(collectOptions()).catch((error: unknown) => {
    console.error('Failed to start the PDF preview:', error)
  })
}

const currentDocumentVersion = (): string | null => {
  const id = editorStore.currentFile?.id
  if (!id) return null
  return String(documentRevisionSnapshots.currentRevision(id))
}

const handleSavePreview = async () => {
  // Revalidate the document at the moment of saving: the editor may have moved
  // on while the OS dialog was closed, and the preview's own versions were
  // captured at generation time.
  const documentVersion = currentDocumentVersion()
  const versions = previewState.versions
  if (!versions) return
  if (documentVersion !== null && documentVersion !== versions.documentVersion) {
    pdfPreviewSession.invalidate('document')
  }

  const file = editorStore.currentFile
  const pathname = (file as unknown as { pathname?: string } | null)?.pathname
  let defaultPath = 'report.pdf'
  if (pathname) {
    defaultPath = window.path.join(window.path.dirname(pathname), window.path.basename(pathname, '.md') + '.pdf')
  }

  const sessionAtSave = dialogSession
  const outcome = await pdfPreviewSession.save({
    defaultPath,
    reuseLastPath: repeatExport.value
  })
  if (outcome === 'saved' && sessionAtSave === dialogSession) {
    showExportSettingsDialog.value = false
  }
}

const handleCancelPreview = () => {
  pdfPreviewSession.close()
  showExportSettingsDialog.value = false
}

const onSelectChange = (key: string, value: unknown) => {
  const state: Record<string, Ref<unknown>> = {
    htmlTitle,
    pageSize,
    isLandscape,
    fontSettingsOverwrite,
    fontFamily,
    fontSize,
    lineHeight,
    autoNumberingHeadings,
    showFrontMatter,
    theme,
    headerType,
    headerTextLeft,
    headerTextCenter,
    headerTextRight,
    footerType,
    footerTextLeft,
    footerTextCenter,
    footerTextRight,
    headerFooterCustomize,
    headerFooterStyled,
    headerFooterFontSize,
    tocIncludeTopHeading,
    tocTitle
  }
  if (key in state) {
    state[key]!.value = value
  }
}

const loadThemesFromDisk = async () => {
  // inkiva.paths is attached to `window` at runtime by bootstrap.ts but
  // isn't part of the typed contextBridge surface. Cast through `unknown`.
  const inkiva = (window as unknown as { inkiva?: { paths?: { userDataPath?: string } } })
    .inkiva
  const userDataPath = inkiva?.paths?.userDataPath
  if (!userDataPath) return
  const themeDir = window.path.join(userDataPath, 'themes/export')

  if (!(await window.fileUtils.isDirectory(themeDir))) return
  let filenames = []
  try {
    filenames = await window.fileUtils.readdir(themeDir)
  } catch {
    return
  }

  for (const filename of filenames) {
    const fullname = window.path.join(themeDir, filename)
    if (!/.+\.css$/i.test(filename)) continue
    if (!(await window.fileUtils.isFile(fullname))) continue
    try {
      const buf = await window.fileUtils.readFile(fullname)
      const content = buf instanceof Uint8Array ? new TextDecoder('utf-8').decode(buf) : String(buf)
      const match = content.match(/^(?:\/\*+[ \t]*([A-z0-9 -]+)[ \t]*(?:\*+\/|[\n\r])?)/)
      const label = match && match[1] ? match[1] : filename
      themeList.value.push({ value: filename, label })
    } catch (e) {
      console.error('loadThemesFromDisk failed:', e)
    }
  }
}
</script>

<style scoped>
.print-settings-dialog {
  user-select: none;
}
.row {
  margin-bottom: 8px;
}
.description {
  margin-bottom: 10px;
  white-space: pre-wrap;
  word-break: break-word;
}
.label {
  margin-bottom: 5px;
}
.label ~ div {
  margin-right: 20px;
}
.text {
  white-space: pre-wrap;
  word-break: break-word;
}

.dialog-body-grid {
  display: block;
}

/* Wide window: settings on the left, the paginated preview on the right.
   Narrow window: the preview stacks under the settings (P4 layout). */
.dialog-body-grid--pdf {
  display: grid;
  grid-template-columns: minmax(300px, 1fr) minmax(300px, 1fr);
  gap: 16px;
  align-items: start;
}

@media (max-width: 820px) {
  .dialog-body-grid--pdf {
    grid-template-columns: 1fr;
  }
}

.button-controlls {
  margin-top: 8px;
  text-align: right;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.button-controlls .button-plain {
  font-size: 14px;
}

.button-controlls .button-primary {
  font-size: 14px;
}

.el-tab-pane section:first-child {
  margin-top: 0;
}
</style>
<style>
.print-settings-dialog #pane-header .pref-text-box-item .el-input {
  width: 90% !important;
}

.print-settings-dialog .el-dialog__body {
  padding: 0 20px 20px 20px;
}
.print-settings-dialog .pref-select-item .el-select {
  width: 240px;
}
.print-settings-dialog .el-tabs__content {
  max-height: 350px;
  overflow-x: hidden;
  overflow-y: auto;
}

.print-settings-dialog .el-tabs__content::-webkit-scrollbar:vertical {
  width: 5px;
}

.el-input-number {
  & div {
    background: var(--inputBgColor);
  }
  & input {
    border: none !important;
  }
}
</style>
