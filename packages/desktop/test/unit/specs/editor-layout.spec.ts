import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createEditorLayoutReconciler,
  type EditorLayoutChange,
  type EditorLayoutReconciler
} from '@/util/editorLayout'

type ObserverCallback<T> = (entries: T[]) => void

class ResizeObserverDouble {
  static instances: ResizeObserverDouble[] = []
  readonly observed = new Set<Element>()
  disconnectCount = 0

  constructor(private readonly callback: ObserverCallback<ResizeObserverEntry>) {
    ResizeObserverDouble.instances.push(this)
  }

  observe(element: Element) {
    this.observed.add(element)
  }

  unobserve(element: Element) {
    this.observed.delete(element)
  }

  disconnect() {
    this.disconnectCount += 1
    this.observed.clear()
  }

  emit(...elements: Element[]) {
    this.callback(elements.map((target) => ({ target }) as ResizeObserverEntry))
  }
}

class MutationObserverDouble {
  static instances: MutationObserverDouble[] = []
  observed: Element | null = null
  disconnectCount = 0

  constructor(private readonly callback: MutationCallback) {
    MutationObserverDouble.instances.push(this)
  }

  observe(element: Element) {
    this.observed = element
  }

  disconnect() {
    this.disconnectCount += 1
    this.observed = null
  }

  emit() {
    this.callback([], this as unknown as MutationObserver)
  }
}

interface LayoutFixture {
  container: HTMLElement
  root: HTMLElement
  diagram: HTMLElement
  paragraph: HTMLElement
  setRect: (element: HTMLElement, top: number, height: number) => void
  setScrollHeight: (height: number) => void
}

const rectFor = (top: number, height: number): DOMRect => ({
  x: 0,
  y: top,
  width: 700,
  height,
  top,
  right: 700,
  bottom: top + height,
  left: 0,
  toJSON: () => ({})
}) as DOMRect

const makeFixture = (): LayoutFixture => {
  const container = document.createElement('div')
  const root = document.createElement('div')
  const diagram = document.createElement('figure')
  const paragraph = document.createElement('p')
  root.className = 'mu-container'
  diagram.className = 'mu-diagram-block'
  root.append(diagram, paragraph)
  container.append(root)
  document.body.append(container)

  let scrollHeight = 1000
  Object.defineProperties(container, {
    clientHeight: { configurable: true, value: 400 },
    scrollHeight: { configurable: true, get: () => scrollHeight }
  })

  const rects = new Map<HTMLElement, DOMRect>([
    [diagram, rectFor(100, 100)],
    [paragraph, rectFor(250, 40)]
  ])
  const getRect = (element: HTMLElement): DOMRect => {
    const rect = rects.get(element)
    if (!rect) throw new Error('missing layout fixture rect')
    return rect
  }
  vi.spyOn(diagram, 'getBoundingClientRect').mockImplementation(() => getRect(diagram))
  vi.spyOn(paragraph, 'getBoundingClientRect').mockImplementation(() => getRect(paragraph))

  return {
    container,
    root,
    diagram,
    paragraph,
    setRect: (element, top, height) => rects.set(element, rectFor(top, height)),
    setScrollHeight: (height) => {
      scrollHeight = height
    }
  }
}

const flushLayoutFrame = async() => {
  await vi.runOnlyPendingTimersAsync()
}

let reconciler: EditorLayoutReconciler | null = null

beforeEach(() => {
  vi.useFakeTimers()
  ResizeObserverDouble.instances = []
  MutationObserverDouble.instances = []
  vi.stubGlobal('ResizeObserver', ResizeObserverDouble)
  vi.stubGlobal('MutationObserver', MutationObserverDouble)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(Date.now()), 0))
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => clearTimeout(handle))
})

afterEach(() => {
  reconciler?.destroy()
  reconciler = null
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

describe('createEditorLayoutReconciler', () => {
  it('batches and de-duplicates ResizeObserver entries while measuring only changed blocks', async() => {
    const fixture = makeFixture()
    const onChange = vi.fn<(changes: readonly EditorLayoutChange[]) => void>()
    reconciler = createEditorLayoutReconciler(fixture.container, { onChange })
    const resizeObserver = ResizeObserverDouble.instances[0]
    expect(resizeObserver.observed).toEqual(new Set([fixture.diagram, fixture.paragraph]))

    vi.mocked(fixture.paragraph.getBoundingClientRect).mockClear()
    fixture.setRect(fixture.diagram, 100, 220)
    resizeObserver.emit(fixture.diagram, fixture.diagram, fixture.diagram)

    expect(onChange).not.toHaveBeenCalled()
    await flushLayoutFrame()

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        element: fixture.diagram,
        previous: expect.objectContaining({ top: 100, height: 100 }),
        next: expect.objectContaining({ top: 100, height: 220 }),
        delta: 120
      })
    ])
    expect(fixture.paragraph.getBoundingClientRect).not.toHaveBeenCalled()
  })

  it('keeps a bottom-anchored editor at the real bottom as a diagram grows', async() => {
    const fixture = makeFixture()
    fixture.container.scrollTop = 580
    const onChange = vi.fn()
    reconciler = createEditorLayoutReconciler(fixture.container, { onChange })
    const resizeObserver = ResizeObserverDouble.instances[0]

    fixture.setRect(fixture.diagram, 100, 260)
    fixture.setScrollHeight(1160)
    resizeObserver.emit(fixture.diagram)
    await flushLayoutFrame()

    expect(fixture.container.scrollTop).toBe(760)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('does not force a middle-of-document scroll to the bottom', async() => {
    const fixture = makeFixture()
    fixture.container.scrollTop = 250
    fixture.setRect(fixture.diagram, 300, 100)
    const onChange = vi.fn()
    reconciler = createEditorLayoutReconciler(fixture.container, { onChange })
    const resizeObserver = ResizeObserverDouble.instances[0]

    fixture.setRect(fixture.diagram, 300, 260)
    fixture.setScrollHeight(1160)
    resizeObserver.emit(fixture.diagram)
    await flushLayoutFrame()

    expect(fixture.container.scrollTop).toBe(250)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('reconciles a second size change without waiting on a timeout', async() => {
    const fixture = makeFixture()
    fixture.container.scrollTop = 500
    fixture.setRect(fixture.diagram, -400, 100)
    const onChange = vi.fn()
    reconciler = createEditorLayoutReconciler(fixture.container, { onChange })
    const resizeObserver = ResizeObserverDouble.instances[0]

    fixture.setRect(fixture.diagram, -400, 180)
    fixture.setScrollHeight(1080)
    resizeObserver.emit(fixture.diagram)
    await flushLayoutFrame()
    expect(fixture.container.scrollTop).toBe(580)

    fixture.setRect(fixture.diagram, -400, 260)
    fixture.setScrollHeight(1160)
    resizeObserver.emit(fixture.diagram)
    await flushLayoutFrame()

    expect(fixture.container.scrollTop).toBe(660)
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange.mock.calls[1][0][0]).toEqual(
      expect.objectContaining({ delta: 80 })
    )
  })

  it('reports an error-state shrink and a removed block, then ignores its stale observer callback', async() => {
    const fixture = makeFixture()
    const changes: EditorLayoutChange[][] = []
    reconciler = createEditorLayoutReconciler(fixture.container, {
      onChange: (batch) => changes.push([...batch])
    })
    const resizeObserver = ResizeObserverDouble.instances[0]
    const mutationObserver = MutationObserverDouble.instances[0]

    fixture.setRect(fixture.diagram, 100, 60)
    resizeObserver.emit(fixture.diagram)
    await flushLayoutFrame()
    expect(changes[0][0]).toEqual(expect.objectContaining({ delta: -40 }))

    fixture.diagram.remove()
    mutationObserver.emit()
    await flushLayoutFrame()
    expect(changes[1][0]).toEqual({
      element: fixture.diagram,
      index: 0,
      previous: expect.objectContaining({ height: 60 }),
      next: null,
      delta: -60
    })

    resizeObserver.emit(fixture.diagram)
    await flushLayoutFrame()
    expect(changes).toHaveLength(2)
    expect(resizeObserver.observed.has(fixture.diagram)).toBe(false)
  })

  it('does not write scroll or invoke callbacks after editor layout disposal', async() => {
    const fixture = makeFixture()
    fixture.container.scrollTop = 600
    const onChange = vi.fn()
    reconciler = createEditorLayoutReconciler(fixture.container, { onChange })
    const resizeObserver = ResizeObserverDouble.instances[0]
    const mutationObserver = MutationObserverDouble.instances[0]

    fixture.setRect(fixture.diagram, 100, 300)
    fixture.setScrollHeight(1200)
    resizeObserver.emit(fixture.diagram)
    reconciler.destroy()
    reconciler = null
    mutationObserver.emit()
    await flushLayoutFrame()

    expect(fixture.container.scrollTop).toBe(600)
    expect(onChange).not.toHaveBeenCalled()
    expect(resizeObserver.observed.size).toBe(0)
  })

  it('isolates an old document observer after the same container is reused', async() => {
    const fixture = makeFixture()
    const oldOnChange = vi.fn()
    const currentOnChange = vi.fn()
    const oldReconciler = createEditorLayoutReconciler(fixture.container, { onChange: oldOnChange })
    const oldResizeObserver = ResizeObserverDouble.instances[0]
    oldReconciler.destroy()

    const currentReconciler = createEditorLayoutReconciler(fixture.container, { onChange: currentOnChange })
    const currentResizeObserver = ResizeObserverDouble.instances[1]
    fixture.setRect(fixture.diagram, 100, 240)
    oldResizeObserver.emit(fixture.diagram)
    currentResizeObserver.emit(fixture.diagram)
    await flushLayoutFrame()

    expect(oldOnChange).not.toHaveBeenCalled()
    expect(currentOnChange).toHaveBeenCalledTimes(1)
    currentReconciler.destroy()
  })

  it('resets a document generation by disconnecting observers and cancelling queued work', async() => {
    const fixture = makeFixture()
    const onChange = vi.fn()
    reconciler = createEditorLayoutReconciler(fixture.container, { onChange })
    const oldResizeObserver = ResizeObserverDouble.instances[0]
    const oldMutationObserver = MutationObserverDouble.instances[0]

    fixture.setRect(fixture.diagram, 100, 260)
    oldResizeObserver.emit(fixture.diagram)
    reconciler.reset()
    const resizeObserver = ResizeObserverDouble.instances[1]
    const mutationObserver = MutationObserverDouble.instances[1]
    oldResizeObserver.emit(fixture.diagram)
    oldMutationObserver.emit()
    await flushLayoutFrame()

    expect(onChange).not.toHaveBeenCalled()
    expect(oldMutationObserver.disconnectCount).toBe(1)
    expect(oldResizeObserver.disconnectCount).toBe(1)
    expect(mutationObserver.observed).toBe(fixture.root)
    expect(resizeObserver.observed).toEqual(new Set([fixture.diagram, fixture.paragraph]))

    fixture.setRect(fixture.diagram, 100, 300)
    resizeObserver.emit(fixture.diagram)
    await flushLayoutFrame()

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0][0]).toEqual(expect.objectContaining({ delta: 40 }))
  })

  it('can defer reset geometry reads until the next frame', async () => {
    const fixture = makeFixture()
    reconciler = createEditorLayoutReconciler(fixture.container)
    vi.mocked(fixture.diagram.getBoundingClientRect).mockClear()
    vi.mocked(fixture.paragraph.getBoundingClientRect).mockClear()

    reconciler.reset(true)

    expect(fixture.diagram.getBoundingClientRect).not.toHaveBeenCalled()
    expect(fixture.paragraph.getBoundingClientRect).not.toHaveBeenCalled()
    await flushLayoutFrame()

    expect(fixture.diagram.getBoundingClientRect).toHaveBeenCalledTimes(1)
    expect(fixture.paragraph.getBoundingClientRect).toHaveBeenCalledTimes(1)
  })
})
