import loadRenderer from './index.js'
import { renderMermaid } from './mermaid.js'

const vegaViews = new WeakMap()

export function normalizeDiagramSource(source) {
  return source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
}

function disposeVegaView(target) {
  const view = vegaViews.get(target)
  if (!view) {
    return
  }

  if (typeof view.finalize === 'function') {
    view.finalize()
  }
  vegaViews.delete(target)
}

export function addDiagramViewBox(target) {
  const svg = target.querySelector('svg')
  if (!svg || svg.getAttribute('viewBox')) {
    return Boolean(svg)
  }

  const width = Number.parseFloat(svg.getAttribute('width') || '')
  const height = Number.parseFloat(svg.getAttribute('height') || '')
  if (width > 0 && height > 0) {
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
    return true
  }

  return false
}

function waitForDiagramOutput(target) {
  if (target.querySelector('svg')) {
    addDiagramViewBox(target)
    return Promise.resolve()
  }
  if (typeof MutationObserver === 'undefined') {
    return Promise.resolve()
  }

  return new Promise(resolve => {
    let settled = false
    let timeout
    const observer = new MutationObserver(() => {
      if (!target.querySelector('svg')) {
        return
      }
      addDiagramViewBox(target)
      observer.disconnect()
      clearTimeout(timeout)
      settled = true
      resolve()
    })
    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['width', 'height']
    })
    timeout = setTimeout(() => {
      if (settled) {
        return
      }
      observer.disconnect()
      settled = true
      resolve()
    }, 5000)
  })
}

export function ensureDiagramViewBox(target) {
  void waitForDiagramOutput(target)
}

function createStagedDiagramResult(target, stagingTarget, isCurrent) {
  let committed = false
  let disposed = false

  const dispose = () => {
    disposed = true
  }

  if (isCurrent && !isCurrent()) {
    return { dispose: () => {} }
  }

  return {
    commit: () => {
      if (committed || disposed) {
        return
      }
      if (isCurrent && !isCurrent()) {
        dispose()
        return
      }
      target.replaceChildren(...Array.from(stagingTarget.childNodes))
      committed = true
    },
    dispose
  }
}

export async function renderDiagram({
  type,
  code,
  target,
  mermaidTheme,
  vegaTheme,
  plantumlServer,
  sequenceTheme,
  isCurrent
}) {
  const source = normalizeDiagramSource(code)

  if (type === 'mermaid') {
    const result = await renderMermaid(source, mermaidTheme)
    return { ...result, dispose: () => {} }
  }

  const renderer = await loadRenderer(type)
  const stagingTarget = document.createElement('div')
  if (type === 'vega-lite') {
    // Render asynchronously into a detached node so an older edit cannot
    // overwrite a newer chart in the live preview.
    const result = await renderer(stagingTarget, JSON.parse(source), {
      actions: false,
      tooltip: false,
      renderer: 'svg',
      theme: vegaTheme,
      ast: true
    })
    const view = result && result.view
    let committed = false
    let disposed = false

    const dispose = () => {
      if (disposed) {
        return
      }
      disposed = true

      if (committed) {
        if (vegaViews.get(target) === view) {
          disposeVegaView(target)
        }
      } else if (view && typeof view.finalize === 'function') {
        view.finalize()
      }
    }

    if (isCurrent && !isCurrent()) {
      dispose()
      return { dispose: () => {} }
    }

    return {
      commit: () => {
        if (committed || disposed) {
          return
        }
        if (isCurrent && !isCurrent()) {
          dispose()
          return
        }
        disposeVegaView(target)
        target.replaceChildren(...Array.from(stagingTarget.childNodes))
        if (view) {
          vegaViews.set(target, view)
        }
        committed = true
      },
      dispose
    }
  }

  if (type === 'plantuml') {
    const diagram = renderer.parse(source, plantumlServer)
    diagram.insertImgElement(stagingTarget)
    return createStagedDiagramResult(target, stagingTarget, isCurrent)
  }

  if (type === 'flowchart' || type === 'sequence') {
    const diagram = renderer.parse(source)
    diagram.drawSVG(stagingTarget, type === 'sequence' ? { theme: sequenceTheme } : {})
    await waitForDiagramOutput(stagingTarget)
    return createStagedDiagramResult(target, stagingTarget, isCurrent)
  }

  throw new Error(`Unknown diagram name ${type}`)
}

export function disposeDiagram(target) {
  disposeVegaView(target)
}
