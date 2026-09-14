export type LargeGateLevel = 'P1' | 'P2' | 'P3'

export interface LargeGateScenario {
  id: string
  level: LargeGateLevel
  fixtures: readonly string[]
  metrics: readonly string[]
}

export interface LargeGateLevelPlan {
  level: LargeGateLevel
  fixtures: readonly string[]
  metrics: readonly string[]
}

// Metrics emitted continuously by the runtime monitors. Scenario collectors
// must own every other threshold metric so a missing real action cannot be
// hidden behind a background sample.
export const RUNTIME_COLLECTED_METRICS = [
  // UI actions are scenario-owned: only an actual user action may satisfy this gate.
  'core.input.latency',
  'core.frame.duration',
  'core.frame.over16_7',
  'core.frame.over33',
  'core.interactive.longTask',
  'core.interactive.longTaskObserver',
  'core.main.block',
  'core.scroll.fps',
  'core.gc.over50',
  'core.forcedReflow',
  'memory.heapGrowth50',
  'memory.heapLinearGrowth',
  'stability.crash',
  'stability.rendererCrash',
  'stability.oom',
  'stability.cpuRunaway',
  'stability.rendererHang',
  'background.rendererIdleCpu',
  'background.tabCpu'
] as const

export const LARGE_GATE_SCENARIOS: readonly LargeGateScenario[] = [
  {
    id: 'p1-documents',
    level: 'P1',
    fixtures: ['50k-markdown', '100k-markdown', '500k-markdown', '1m-markdown'],
    metrics: [
      'document.50k.firstScreen',
      'document.50k.editable',
      'document.50k.outlineFirst',
      'document.50k.lightIndex',
      'document.50k.input',
      'document.50k.scrollFps',
      'document.50k.headingJump',
      'document.50k.searchFirst',
      'document.50k.save',
      'document.100k.firstScreen',
      'document.100k.editable',
      'document.100k.outlineFirst',
      'document.100k.headingJump',
      'document.100k.input',
      'document.100k.scrollFps'
    ]
  },
  {
    id: 'p1-tree-tabs-search',
    level: 'P1',
    fixtures: ['10k-workspace', '8x50k-tabs'],
    metrics: [
      'tree.10k.firstScreen',
      'tree.10k.expand',
      'tree.10k.expand1k',
      'tree.10k.search',
      'tree.10k.scrollFps',
      'tree.10k.domRatio',
      'tabs.8.openFirst',
      'tabs.8.open2to4',
      'tabs.8.open5to8',
      'tabs.8.warmSwitch',
      'tabs.8.coldSwitch',
      'tabs.8.switch',
      'core.ui.action',
      'tabs.8.freeze',
      'tabs.8.input',
      'search.current.50k',
      'search.current.500k',
      'search.current.1m',
      'search.folder.firstBatch',
      'search.editorInput',
      'parse.inputSync',
      'save.50k',
      'save.500k',
      'save.1m',
      'save.editorLock',
      'undo.normal',
      'redo.normal',
      'undo.large',
      'undo.fullDomRebuild'
    ]
  },
  {
    id: 'p2-documents-headings',
    level: 'P2',
    fixtures: [
      '500k-markdown',
      '5k-heading-storm',
      '10k-heading-storm',
      '1m-markdown'
    ],
    metrics: [
      'document.50k.firstScreen',
      'document.50k.editable',
      'document.50k.outlineFirst',
      'document.50k.lightIndex',
      'document.50k.input',
      'document.50k.scrollFps',
      'document.50k.headingJump',
      'document.50k.searchFirst',
      'document.50k.save',
      'document.500k.firstScreen',
      'document.500k.editable',
      'document.500k.outlineFirst',
      'document.500k.outlineFull',
      'document.500k.headingJump',
      'document.500k.input',
      'document.500k.frame',
      'heading.5k.outlineFirst',
      'heading.5k.index',
      'heading.5k.click',
      'heading.5k.search',
      'heading.5k.collapse',
      'heading.5k.scrollFps',
      'heading.5k.domRatio',
      'heading.10k.crash',
      'heading.10k.oom',
      'heading.10k.rendererHang',
      'heading.10k.mainBlock'
    ]
  },
  {
    id: 'p2-tree-tabs-background',
    level: 'P2',
    fixtures: ['50k-workspace', '8x50k-tabs'],
    metrics: [
      'tree.50k.firstScreen',
      'tree.50k.expand5k',
      'tree.50k.searchFirst',
      'tree.50k.scrollFps',
      'tree.50k.inputDegradation',
      'tabs.8.openFirst',
      'tabs.8.open2to4',
      'tabs.8.open5to8',
      'tabs.8.warmSwitch',
      'tabs.8.coldSwitch',
      'tabs.8.switch',
      'core.ui.action',
      'tabs.8.freeze',
      'tabs.8.input',
      'background.taskSlice',
      'background.editorDegradation',
      'search.current.50k',
      'search.current.500k',
      'search.current.1m',
      'search.folder.firstBatch',
      'search.editorInput',
      'parse.inputSync',
      'save.50k',
      'save.500k',
      'save.1m',
      'save.editorLock',
      'undo.normal',
      'redo.normal',
      'undo.large',
      'undo.fullDomRebuild'
    ]
  },
  {
    id: 'p2-diagrams-images',
    level: 'P2',
    fixtures: ['diagram-image-document'],
    metrics: [
      'diagram.placeholder',
      'diagram.firstScreenSyncRender',
      'diagram.errorRetry',
      'image.editorReadyBeforeLoad',
      'image.offscreenRequest',
      'image.offscreenDecode'
    ]
  },
  {
    id: 'p2-combination',
    level: 'P2',
    fixtures: ['50k-workspace-combination'],
    metrics: [
      'combo.input',
      'combo.hotTab',
      'combo.scrollFps',
      'combo.freeze',
      'combo.crash',
      'combo.rendererHang'
    ]
  },
  {
    id: 'p3-documents-headings',
    level: 'P3',
    fixtures: ['1m-markdown', '5k-heading-storm', '10k-heading-storm'],
    metrics: [
      'document.1m.firstScreen',
      'document.1m.editable',
      'document.1m.outlineFirst',
      'document.1m.outlineFull',
      'document.1m.headingJump',
      'document.1m.input',
      'document.1m.rendererHang',
      'heading.5k.outlineFirst',
      'heading.5k.index',
      'heading.5k.click',
      'heading.5k.search',
      'heading.5k.collapse',
      'heading.5k.scrollFps',
      'heading.5k.domRatio',
      'heading.10k.crash',
      'heading.10k.oom',
      'heading.10k.rendererHang',
      'heading.10k.mainBlock'
    ]
  },
  {
    id: 'p3-tree-tabs-background',
    level: 'P3',
    fixtures: ['100k-workspace', '8x100k-tabs'],
    metrics: [
      'tree.100k.shell',
      'tree.100k.editorInput',
      'tree.100k.tabSwitch',
      'tree.100k.freeze',
      'tree.100k.rendererHang',
      'tree.100k.domRatio',
      'tabs.8.openFirst',
      'tabs.8.open2to4',
      'tabs.8.open5to8',
      'tabs.8.warmSwitch',
      'tabs.8.coldSwitch',
      'tabs.8.switch',
      'core.ui.action',
      'tabs.8.freeze',
      'tabs.8.input',
      'background.taskSlice',
      'background.editorDegradation'
    ]
  },
  {
    id: 'p3-diagrams-combination',
    level: 'P3',
    fixtures: ['diagram-image-document', '100k-workspace-combination'],
    metrics: [
      'diagram.placeholder',
      'diagram.firstScreenSyncRender',
      'diagram.errorRetry',
      'image.editorReadyBeforeLoad',
      'image.offscreenRequest',
      'image.offscreenDecode',
      'combo.input',
      'combo.hotTab',
      'combo.scrollFps',
      'combo.freeze',
      'combo.crash',
      'combo.rendererHang'
    ]
  }
]

export const getLargeGateScenario = (level: LargeGateLevel): LargeGateLevelPlan => {
  const scenarios = LARGE_GATE_SCENARIOS.filter((scenario) => scenario.level === level)
  return {
    level,
    fixtures: [...new Set(scenarios.flatMap((scenario) => scenario.fixtures))],
    metrics: [
      ...new Set([
        ...scenarios.flatMap((scenario) => scenario.metrics),
        'memory.heapLinearGrowth200'
      ])
    ]
  }
}
