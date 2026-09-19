import type { Muya } from '../../muya';
import type { TState } from '../../state/types';
import type { Nullable } from '../../types';
import type Content from '../base/content';
import type TreeNode from '../base/treeNode';
import type { IConstructor, TBlockPath } from '../types';
import { BLOCK_DOM_PROPERTY, VIRTUAL_BLOCK_MOUNT_EVENT } from '../../config';
import { deepClone, isHTMLElement, isMouseEvent } from '../../utils';
import { findScrollContainer } from '../../utils/dom';
import logger from '../../utils/logger';
import Parent from '../base/parent';
import { withDeferredBlockDomCreation } from '../base/treeNode';

const debug = logger('scrollpage:');

interface IBlurFocus {
    blur: Nullable<Content>;
    focus: Nullable<Content>;
}

interface IScrollPageCreateOptions {
    cloneBlocksOnMount?: boolean;
    progressiveStartDelayMs?: number;
}

// Constructing and parsing every inline content node before the browser gets a
// paint makes a large document look frozen even though the first screen only
// needs a small prefix. Keep ordinary documents on the existing synchronous
// path and progressively mount larger documents after the first paint.
export const PROGRESSIVE_RENDER_THRESHOLD = 200;
export const PROGRESSIVE_RENDER_INITIAL_BLOCKS = 32;
const PROGRESSIVE_RENDER_CHUNK_BUDGET_MS = 8;
const DETACHED_BLOCK_DISPOSAL_BUDGET_MS = 4;
export const INITIAL_PROGRESSIVE_RENDER_START_DELAY_MS = 100;
// The progressive tail is idle-scheduled below, so a fixed tab-switch delay
// only leaves useful work pending long enough to collide with the next action.
// Keep the exported contract for the desktop caller, but let the scheduler
// decide when the main thread is actually available.
export const CONTENT_SWITCH_PROGRESSIVE_RENDER_START_DELAY_MS = 0;
const PROGRESSIVE_RENDER_LINE_HEIGHT_PX = 24;
const VIRTUAL_RENDERER_PROTOTYPE_FLAG = '__INKIVA_VIRTUAL_RENDERER_PROTOTYPE__';
const VIRTUAL_RENDERER_DEFAULT_VIEWPORT_PX = 720;
const VIRTUAL_RENDERER_OVERSCAN_VIEWPORTS = 2;
const VIRTUAL_RESIZE_ANCHOR_SETTLE_MS = 320;

interface IVirtualRendererPrototypeGlobal {
    __INKIVA_VIRTUAL_RENDERER_PROTOTYPE__?: boolean;
}

interface IVirtualizationSnapshot {
    enabled: boolean;
    totalBlocks: number;
    mountedBlocks: number;
    materializedBlocks: number;
    retainedDetachedDomBlocks: number;
    pendingDetachedBlocks: number;
    windowStart: number;
    windowEnd: number;
    beforeHeight: number;
    afterHeight: number;
    totalEstimatedHeight: number;
    viewportHeight: number;
    renderCacheEntries: number;
}

interface IVirtualRange {
    start: number;
    end: number;
}

class VirtualOffsetIndex {
    private values: number[] = [];
    private tree: number[] = [0];

    clear(): void {
        this.values = [];
        this.tree = [0];
    }

    reset(values: readonly number[]): void {
        this.values = [...values];
        this.tree = Array.from<number>({ length: values.length + 1 }).fill(0);
        for (let index = 0; index < values.length; index += 1) {
            const treeIndex = index + 1;
            this.tree[treeIndex] += values[index] ?? 0;
            const parent = treeIndex + (treeIndex & -treeIndex);
            if (parent < this.tree.length)
                this.tree[parent] += this.tree[treeIndex] ?? 0;
        }
    }

    update(index: number, value: number): void {
        if (index < 0 || index >= this.values.length)
            return;
        const previous = this.values[index] ?? 0;
        const delta = value - previous;
        if (Math.abs(delta) < 0.0001)
            return;
        this.values[index] = value;
        for (let treeIndex = index + 1; treeIndex < this.tree.length; treeIndex += treeIndex & -treeIndex)
            this.tree[treeIndex] = (this.tree[treeIndex] ?? 0) + delta;
    }

    offsetAt(index: number): number {
        let treeIndex = Math.max(0, Math.min(index, this.values.length));
        let sum = 0;
        while (treeIndex > 0) {
            sum += this.tree[treeIndex] ?? 0;
            treeIndex -= treeIndex & -treeIndex;
        }
        return sum;
    }

    total(): number {
        return this.offsetAt(this.values.length);
    }

    indexAtOffset(offset: number): number {
        if (this.values.length === 0)
            return 0;
        const target = Math.max(0, Math.min(offset, this.total()));
        let index = 0;
        let prefix = 0;
        let bit = 1;
        while ((bit << 1) <= this.values.length)
            bit <<= 1;
        for (; bit > 0; bit >>= 1) {
            const next = index + bit;
            if (next <= this.values.length && prefix + (this.tree[next] ?? 0) <= target) {
                index = next;
                prefix += this.tree[next] ?? 0;
            }
        }
        return Math.min(index, this.values.length - 1);
    }
}

function shouldUseVirtualization(muya: Muya): boolean {
    const prototypeGlobal = globalThis as typeof globalThis & IVirtualRendererPrototypeGlobal;
    return muya.options.virtualizeLargeDocuments === true
        || prototypeGlobal[VIRTUAL_RENDERER_PROTOTYPE_FLAG] === true;
}

function canDeferVirtualStateDom(state: TState): boolean {
    if (state.name !== 'paragraph' && state.name !== 'atx-heading')
        return false;

    const text = 'text' in state && typeof state.text === 'string' ? state.text : '';
    return !/!\[|<img\b/i.test(text);
}

interface IIdleDeadline {
    timeRemaining: () => number;
}

type TIdleCallback = (deadline?: IIdleDeadline) => void;

interface IIdleScheduler {
    requestIdleCallback?: (callback: TIdleCallback) => number;
    cancelIdleCallback?: (handle: number) => void;
}

const idleScheduler = (): IIdleScheduler => globalThis as typeof globalThis & IIdleScheduler;

const MAX_RENDER_CACHE_ENTRIES = 2;

interface IRenderedCacheEntry {
    state: TState[];
    stateSignature: string | null;
    blocks: Parent[];
    mountedCount: number;
    cloneBlocks: boolean;
}

function stateSignature(state: TState[]): string | null {
    try {
        return JSON.stringify(state) ?? null;
    }
    catch {
        return null;
    }
}

function estimateStateHeight(state: TState, viewportWidth?: number): number {
    if ('text' in state) {
        const text = state.text || '';
        let explicitLines = 1;
        for (const character of text) {
            if (character === '\n')
                explicitLines += 1;
        }
        // The original 88-char estimate roughly matches an ~880px editor line.
        // Scale it with the live viewport width for virtualized documents so a
        // responsive width change invalidates offscreen spacer geometry instead
        // of preserving stale heights from the previous layout.
        const estimatedCharsPerLine = viewportWidth
            ? Math.max(24, Math.min(160, Math.floor((viewportWidth / 880) * 88)))
            : 88;
        const lines = Math.max(1, explicitLines, Math.ceil(text.length / estimatedCharsPerLine));

        if (state.name === 'diagram')
            return 192;
        if (state.name === 'code-block' || state.name === 'math-block')
            return Math.max(PROGRESSIVE_RENDER_LINE_HEIGHT_PX, lines * 20 + 16);

        return lines * PROGRESSIVE_RENDER_LINE_HEIGHT_PX;
    }

    if ('children' in state && Array.isArray(state.children)) {
        const children = state.children as TState[];
        const childrenHeight = children.reduce(
            (height, child) => height + estimateStateHeight(child, viewportWidth),
            0,
        );
        return Math.max(PROGRESSIVE_RENDER_LINE_HEIGHT_PX, childrenHeight);
    }

    return PROGRESSIVE_RENDER_LINE_HEIGHT_PX;
}

function estimateStatesHeight(states: TState[], startIndex = 0): number {
    let height = 0;
    for (let index = startIndex; index < states.length; index += 1)
        height += estimateStateHeight(states[index]);

    return height;
}

interface IVirtualTypography {
    fontSize: number;
    lineHeight: number;
    paragraphSpacing: number;
}

const HEADING_FONT_SCALE: Record<number, number> = {
    1: 2,
    2: 1.5,
    3: 1.35,
    4: 1.2,
    5: 1.05,
    6: 1,
};

function estimateVirtualTextLines(
    text: string,
    viewportWidth: number | undefined,
    fontScale = 1,
): number {
    let explicitLines = 1;
    for (const character of text) {
        if (character === '\n')
            explicitLines += 1;
    }

    // The editor reserves 50px on each horizontal side. Keep the same
    // 88 chars / 880px heuristic as progressive rendering, but apply it to the
    // actual text column and scale for larger heading glyphs.
    const textWidth = viewportWidth ? Math.max(120, viewportWidth - 100) : 780;
    const estimatedCharsPerLine = Math.max(
        16,
        Math.min(160, Math.floor(((textWidth / 880) * 88) / fontScale)),
    );
    return Math.max(1, explicitLines, Math.ceil(text.length / estimatedCharsPerLine));
}

function virtualHeadingLevel(state: TState): number | null {
    if (state.name !== 'atx-heading' && state.name !== 'setext-heading')
        return null;
    const level = Number((state as { meta?: { level?: unknown } }).meta?.level);
    return Number.isInteger(level) && level >= 1 && level <= 6 ? level : 1;
}

function estimateVirtualBlockBoxHeight(
    state: TState,
    viewportWidth: number | undefined,
    typography: IVirtualTypography,
): number {
    const headingLevel = virtualHeadingLevel(state);
    if (headingLevel !== null) {
        const scale = HEADING_FONT_SCALE[headingLevel] ?? 1;
        const lines = estimateVirtualTextLines(
            'text' in state ? state.text || '' : '',
            viewportWidth,
            scale,
        );
        return Math.max(
            typography.fontSize * scale * 1.3,
            lines * typography.fontSize * scale * 1.3,
        );
    }

    if (state.name === 'paragraph' && 'text' in state) {
        const lines = estimateVirtualTextLines(state.text || '', viewportWidth);
        return Math.max(
            typography.fontSize * typography.lineHeight,
            lines * typography.fontSize * typography.lineHeight,
        );
    }

    return estimateStateHeight(state, viewportWidth);
}

function virtualBlockMargins(
    state: TState,
    typography: IVirtualTypography,
): { top: number; bottom: number } {
    const headingLevel = virtualHeadingLevel(state);
    if (headingLevel !== null) {
        const headingFontSize = typography.fontSize * (HEADING_FONT_SCALE[headingLevel] ?? 1);
        return {
            top: 1.3 * headingFontSize,
            bottom: (headingLevel === 1 ? 0.15 : 0.2) * headingFontSize,
        };
    }

    if (state.name === 'paragraph') {
        const margin = typography.paragraphSpacing * typography.fontSize;
        return { top: margin, bottom: margin };
    }

    const margin = 0.75 * typography.fontSize;
    return { top: margin, bottom: margin };
}

function estimateVirtualBlockAdvance(
    states: TState[],
    index: number,
    viewportWidth: number | undefined,
    typography: IVirtualTypography,
): number {
    const state = states[index];
    if (!state)
        return 0;

    const boxHeight = estimateVirtualBlockBoxHeight(state, viewportWidth, typography);
    const currentMargins = virtualBlockMargins(state, typography);
    const next = states[index + 1];

    if (!next)
        return boxHeight + currentMargins.bottom;

    const nextMargins = virtualBlockMargins(next, typography);
    // Adjacent positive vertical margins collapse to the larger margin. A
    // paragraph directly after a heading has margin-top reset to zero in CSS.
    const nextTop = virtualHeadingLevel(state) !== null && next.name === 'paragraph'
        ? 0
        : nextMargins.top;
    return boxHeight + Math.max(currentMargins.bottom, nextTop);
}

export class ScrollPage extends Parent {
    private _blurFocus: IBlurFocus = { blur: null, focus: null };
    private _activeStatusFrames = new Set<number>();
    private _progressiveStates: TState[] | null = null;
    private _progressiveIndex = 0;
    private _progressiveFrameId: number | null = null;
    private _progressiveIdleCallbackId: number | null = null;
    private _progressiveTimerId: ReturnType<typeof setTimeout> | null = null;
    private _progressiveSpacer: HTMLElement | null = null;
    private _progressiveRemainingHeight = 0;
    private _progressiveGeneration = 0;
    private _progressiveCompletion: Promise<void> | null = null;
    private _resolveProgressiveCompletion: (() => void) | null = null;
    private _cloneProgressiveBlocks = false;
    private _virtualizationEnabled = false;
    private _virtualBlocks: Parent[] = [];
    private _virtualBlockIndexes = new Map<Parent, number>();
    private _virtualMountedIndexes = new Set<number>();
    private _virtualMaterializedIndexes = new Set<number>();
    private _virtualStates: TState[] = [];
    private _virtualOffsetIndex = new VirtualOffsetIndex();
    private _virtualMeasuredHeights = new Map<number, number>();
    private _virtualGeometryRevision = 0;
    private _virtualAppliedGeometryRevision = -1;
    private _virtualStructureRevision = 0;
    private _virtualAppliedStructureRevision = -1;
    private _virtualWindowStart = 0;
    private _virtualWindowEnd = 0;
    private _virtualRevealIndex: number | null = null;
    private _virtualNavigationTarget: { index: number; viewportOffset: number } | null = null;
    private _virtualBeforeSpacer: HTMLElement | null = null;
    private _virtualGapSpacers: HTMLElement[] = [];
    private _virtualAfterSpacer: HTMLElement | null = null;
    private _virtualScrollContainer: HTMLElement | null = null;
    private _virtualScrollHandler: (() => void) | null = null;
    private _virtualResizeObserver: ResizeObserver | null = null;
    private _virtualBlockResizeObserver: ResizeObserver | null = null;
    private _virtualWindowResizeHandler: (() => void) | null = null;
    private _virtualResizeCorrectionFrameId: number | null = null;
    private _virtualResizeCorrectionGeneration = 0;
    private _virtualResizeCorrectionTarget: number | null = null;
    private _virtualResizeCorrectionStartedAt: number | null = null;
    private _virtualResizeAnchorIndex: number | null = null;
    private _virtualResizeAnchorOffset: number | null = null;
    private _virtualViewportAnchorIndex: number | null = null;
    private _virtualViewportAnchorOffset: number | null = null;
    private _virtualResizeInteractionHandler: (() => void) | null = null;
    private _virtualLastScrollTop = 0;
    private _virtualLastViewportHeight = VIRTUAL_RENDERER_DEFAULT_VIEWPORT_PX;

    // The desktop keeps at most two non-active tabs warm. Cache the bounded
    // progressive render window for non-virtualized documents. Virtualized
    // documents deliberately skip this cache so inactive tabs do not retain
    // stale DOM; switching them back rebuilds only the bounded viewport window.
    private _renderCache = new Map<string, IRenderedCacheEntry>();
    private _renderCacheKey: string | null = null;
    private _renderedState: TState[] | null = null;

    // Replacing a large rendered document must not synchronously call
    // `remove()` for every block. Keep detached roots in small background
    // batches so the next document can mount before old resources are
    // released. Batch cursors avoid shifting every remaining item on each
    // disposal, which otherwise turns repeated tab switches into O(n²) work.
    private _detachedBlockBatches: Parent[][] = [];
    private _detachedBatchIndex = 0;
    private _detachedBlockIndex = 0;

    private _detachedDisposalFrameId: number | null = null;
    private _detachedDisposalIdleCallbackId: number | null = null;

    static override blockName = 'scrollpage';

    // Registry of block constructors keyed by their static blockName.
    // Stored as Parent constructors — the overwhelming majority of
    // call sites do `loadBlock(...).create(...).append(child)`, which only
    // makes sense for Parent. Content leaves register themselves through
    // their containing Parent's create flow and don't go through
    // `loadBlock(...).create()` externally.
    private static _registeredBlocks = new Map<string, IConstructor<Parent>>();

    static register(Block: IConstructor<TreeNode>) {
        const { blockName } = Block;
        this._registeredBlocks.set(blockName, Block as IConstructor<Parent>);
    }

    // Returns the registered constructor. Asserts non-undefined for
    // callers (the registry is populated by `registerBlocks()` once at
    // `editor.init()` time, and `loadBlock` runs strictly after init.).
    // Mismatched names hit the warn branch and the caller crashes at
    // `.create()` — matches the original loose contract.
    static loadBlock(blockName: string): IConstructor<Parent> {
        const block = this._registeredBlocks.get(blockName);

        if (!block)
            debug.warn(`block:${blockName} is not existed.`);

        return block as IConstructor<Parent>;
    }

    static create(
        muya: Muya,
        state: TState[],
        options: IScrollPageCreateOptions = {},
    ) {
        const scrollPage = new ScrollPage(muya);
        scrollPage._mountState(
            state,
            options.cloneBlocksOnMount === true,
            options.progressiveStartDelayMs ?? 0,
        );

        scrollPage.parent!.domNode!.appendChild(scrollPage.domNode!);

        return scrollPage;
    }

    override get path() {
        return [];
    }

    constructor(muya: Muya) {
        super(muya);
        // muya is not extends Parent, but it is the parent of scrollPage.
        // ScrollPage is the tree root; widening the base `TreeNode.parent`
        // declaration would ripple to every node, so spell out the boundary.
        // eslint-disable-next-line no-restricted-syntax
        this.parent = muya as unknown as Parent;
        this.tagName = 'div';
        this.classList = ['mu-container'];

        this.createDomNode();
        this._listenDomEvent();
    }

    isProgressiveRenderPending(): boolean {
        return this._progressiveStates !== null;
    }

    protected override get domInsertionAnchor(): Nullable<Node> {
        return this._virtualAfterSpacer ?? this._progressiveSpacer;
    }

    whenRenderComplete(): Promise<void> {
        return this._progressiveCompletion ?? Promise.resolve();
    }

    override getState() {
        debug.warn('You can never call `getState` in scrollPage');

        return {} as TState;
    }

    private _listenDomEvent() {
        const { eventCenter } = this.muya;
        const { domNode } = this;

        eventCenter.attachDOMEvent(domNode!, 'click', this._clickHandler.bind(this));
    }

    private _createBlocks(state: TState[], cloneBlocks = false): Parent[] {
        // Clone the visible window as one structured-clone operation. Calling
        // structuredClone once per block adds avoidable overhead on the cold
        // path while still cloning the same isolated state boundary.
        const renderStates = cloneBlocks ? deepClone(state) : state;
        return renderStates.map((block) => {
            return ScrollPage.loadBlock(block.name).create(this.muya, block);
        });
    }

    private _createVirtualBlocks(state: TState[], cloneBlocks = false): Parent[] {
        const renderStates = cloneBlocks ? deepClone(state) : state;
        return renderStates.map((block) => {
            const create = () => ScrollPage.loadBlock(block.name).create(this.muya, block);
            return canDeferVirtualStateDom(block)
                ? withDeferredBlockDomCreation(create)
                : create();
        });
    }

    private _appendBlocks(blocks: Parent[], beforeSpacer = false): void {
        if (blocks.length === 0)
            return;

        const fragment = document.createDocumentFragment();

        blocks.forEach((block) => {
            block.parent = this;
            fragment.appendChild(block.domNode!);
        });
        this.children.append(...blocks);

        if (beforeSpacer && this._progressiveSpacer)
            this.domNode!.insertBefore(fragment, this._progressiveSpacer);
        else
            this.domNode!.appendChild(fragment);
    }

    private _mountBlocks(
        state: TState[],
        beforeSpacer = false,
        cloneBlocks = false,
    ): void {
        this._appendBlocks(this._createBlocks(state, cloneBlocks), beforeSpacer);
    }

    private _mountState(
        state: TState[],
        cloneBlocks = false,
        progressiveStartDelayMs = 0,
    ): void {
        this._renderedState = state;
        if (state.length > PROGRESSIVE_RENDER_THRESHOLD && shouldUseVirtualization(this.muya)) {
            this._mountVirtualization(state, cloneBlocks);
            return;
        }

        if (state.length <= PROGRESSIVE_RENDER_THRESHOLD) {
            this._mountBlocks(state, false, cloneBlocks);
            return;
        }

        const initialIndex = Math.min(PROGRESSIVE_RENDER_INITIAL_BLOCKS, state.length);
        this._mountBlocks(state.slice(0, initialIndex), false, cloneBlocks);
        this._startProgressiveRender(state, initialIndex, cloneBlocks, progressiveStartDelayMs);
    }

    private _mountVirtualization(state: TState[], cloneBlocks: boolean): void {
        this._teardownVirtualization();
        this._virtualizationEnabled = true;
        this._virtualStates = state;
        this._virtualMeasuredHeights.clear();
        this._virtualStructureRevision = 0;
        this._virtualAppliedStructureRevision = -1;
        this._virtualGeometryRevision = 0;
        this._virtualAppliedGeometryRevision = -1;
        this._virtualBlocks = this._createVirtualBlocks(state, cloneBlocks);
        this._virtualBlocks.forEach((block) => {
            block.parent = this;
        });
        this._reindexVirtualBlocks();
        this.children.append(...this._virtualBlocks);
        this._rebuildVirtualOffsets(state);

        const before = document.createElement('div');
        before.className = 'mu-virtual-render-placeholder mu-virtual-render-placeholder-before';
        before.setAttribute('aria-hidden', 'true');
        before.style.pointerEvents = 'none';
        before.style.userSelect = 'none';
        const after = document.createElement('div');
        after.className = 'mu-virtual-render-placeholder mu-virtual-render-placeholder-after';
        after.setAttribute('aria-hidden', 'true');
        after.style.pointerEvents = 'none';
        after.style.userSelect = 'none';
        this._virtualBeforeSpacer = before;
        this._virtualGapSpacers = [];
        this._virtualAfterSpacer = after;
        this.domNode!.replaceChildren(before, after);

        this._attachVirtualScrollListener();
        const initialScrollTop = this._virtualScrollContainer?.scrollTop ?? 0;
        const initialViewportHeight = this._virtualScrollContainer?.clientHeight
            || VIRTUAL_RENDERER_DEFAULT_VIEWPORT_PX;
        this.updateVirtualWindowForViewport(initialScrollTop, initialViewportHeight);
        if (this._virtualScrollContainer)
            this._rememberVirtualViewportAnchor(this._virtualScrollContainer);
    }

    private _cancelVirtualResizeCorrection(): void {
        this._virtualResizeCorrectionGeneration += 1;
        this._virtualResizeCorrectionTarget = null;
        this._virtualResizeCorrectionStartedAt = null;
        this._virtualResizeAnchorIndex = null;
        this._virtualResizeAnchorOffset = null;
        if (this._virtualResizeCorrectionFrameId !== null) {
            cancelAnimationFrame(this._virtualResizeCorrectionFrameId);
            this._virtualResizeCorrectionFrameId = null;
        }
    }

    private _captureVirtualViewportAnchor(container: HTMLElement): { index: number; viewportOffset: number } {
        const containerTop = container.getBoundingClientRect().top;
        let bestIndex: number | null = null;
        let bestViewportOffset = 0;
        let bestDistance = Number.POSITIVE_INFINITY;

        for (const child of Array.from(this.domNode?.children ?? [])) {
            if (!(child instanceof HTMLElement) || child.classList.contains('mu-virtual-render-placeholder'))
                continue;
            const rawIndex = child.dataset.virtualBlockIndex;
            if (rawIndex === undefined)
                continue;
            const index = Number(rawIndex);
            if (!Number.isInteger(index))
                continue;
            const viewportOffset = child.getBoundingClientRect().top - containerTop;
            const distance = Math.abs(viewportOffset);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = index;
                bestViewportOffset = viewportOffset;
            }
        }

        if (bestIndex !== null)
            return { index: bestIndex, viewportOffset: bestViewportOffset };

        const index = this._virtualIndexAtOffset(container.scrollTop);
        return {
            index,
            viewportOffset: this._virtualOffsetAt(index) - container.scrollTop,
        };
    }

    private _rememberVirtualViewportAnchor(container: HTMLElement): void {
        // Scroll fires on every animation frame. Do not scan mounted DOM or
        // call getBoundingClientRect() here: that forces synchronous layout and
        // cuts virtualized scroll throughput roughly in half on large documents.
        // The current offset table is already sufficient to preserve the same
        // logical block + intra-block viewport position across a later reflow.
        // _captureVirtualViewportAnchor() remains the exact DOM fallback for a
        // resize that arrives before any scroll-derived anchor has been stored.
        const index = this._virtualIndexAtOffset(container.scrollTop);
        this._virtualViewportAnchorIndex = index;
        this._virtualViewportAnchorOffset = this._virtualOffsetAt(index) - container.scrollTop;
    }

    private _settleVirtualResizeScroll(container: HTMLElement, target: number): void {
        if (
            this._virtualResizeCorrectionTarget !== null
            && this._virtualResizeCorrectionStartedAt !== null
            && this._virtualResizeCorrectionFrameId !== null
        ) {
            // A later width change may start before the previous correction
            // window expires (for example 60% -> 100% editor width). Treat the
            // latest ResizeObserver callback as the new end of the reflow so a
            // late Chromium caret reveal cannot win immediately afterwards.
            // Real wheel/pointer/key interaction still cancels correction below,
            // so extending the bounded settle period does not trap user scroll.
            this._virtualResizeCorrectionTarget = target;
            this._virtualResizeCorrectionStartedAt = performance.now();
            return;
        }

        const anchorIndex = this._virtualResizeAnchorIndex;
        const anchorOffset = this._virtualResizeAnchorOffset;
        this._cancelVirtualResizeCorrection();
        this._virtualResizeAnchorIndex = anchorIndex;
        this._virtualResizeAnchorOffset = anchorOffset;
        this._virtualResizeCorrectionTarget = target;
        this._virtualResizeCorrectionStartedAt = performance.now();
        const generation = this._virtualResizeCorrectionGeneration;
        const settle = () => {
            this._virtualResizeCorrectionFrameId = null;
            if (
                generation !== this._virtualResizeCorrectionGeneration
                || !this._virtualizationEnabled
                || this._virtualScrollContainer !== container
            ) {
                return;
            }

            const currentTarget = this._virtualResizeCorrectionTarget;
            const startedAt = this._virtualResizeCorrectionStartedAt;
            if (currentTarget === null || startedAt === null)
                return;
            if (Math.abs(container.scrollTop - currentTarget) > 1)
                container.scrollTop = currentTarget;

            // Focused contenteditable can ask Chromium to reveal a remotely
            // pinned caret for a few frames after responsive reflow. Hold the
            // logical viewport anchor only during that bounded settle window;
            // real user interaction cancels it immediately below.
            if (performance.now() - startedAt < VIRTUAL_RESIZE_ANCHOR_SETTLE_MS) {
                this._virtualResizeCorrectionFrameId = requestAnimationFrame(settle);
            }
            else {
                this._virtualResizeCorrectionTarget = null;
                this._virtualResizeCorrectionStartedAt = null;
                this._virtualResizeAnchorIndex = null;
                this._virtualResizeAnchorOffset = null;
            }
        };
        this._virtualResizeCorrectionFrameId = requestAnimationFrame(settle);
    }

    private _attachVirtualScrollListener(): void {
        if (!this._virtualizationEnabled || !this.muya.domNode)
            return;

        const container = findScrollContainer(this.muya.domNode);
        const contentWidth = () => this.domNode?.clientWidth || container.clientWidth || undefined;
        let observedContentWidth = contentWidth();
        let observedViewportHeight = container.clientHeight || VIRTUAL_RENDERER_DEFAULT_VIEWPORT_PX;
        const handler = () => {
            const resizeTarget = this._virtualResizeCorrectionTarget;
            if (resizeTarget !== null && Math.abs(container.scrollTop - resizeTarget) > 1) {
                container.scrollTop = resizeTarget;
                return;
            }

            // A virtual TOC jump keeps its logical block authoritative while
            // estimates converge to measured heights. Any scroll that moves
            // away from the current target is a new navigation source and
            // releases that programmatic anchor immediately.
            const navigationTarget = this._virtualNavigationTarget;
            if (navigationTarget) {
                const expected = this._virtualNavigationScrollTop(container, navigationTarget);
                if (Math.abs(container.scrollTop - expected) > 2)
                    this._virtualNavigationTarget = null;
            }

            this.updateVirtualWindowForViewport(
                container.scrollTop,
                container.clientHeight || VIRTUAL_RENDERER_DEFAULT_VIEWPORT_PX,
            );
            if (this._virtualResizeCorrectionTarget === null)
                this._rememberVirtualViewportAnchor(container);
        };
        const resizeHandler = () => {
            const nextContentWidth = contentWidth();
            const nextViewportHeight = container.clientHeight || VIRTUAL_RENDERER_DEFAULT_VIEWPORT_PX;
            const widthChanged = (
                observedContentWidth !== undefined
                && nextContentWidth !== undefined
                && Math.abs(nextContentWidth - observedContentWidth) > 1
            );
            const viewportHeightChanged = Math.abs(nextViewportHeight - observedViewportHeight) > 1;
            observedContentWidth = nextContentWidth;
            observedViewportHeight = nextViewportHeight;

            if (!widthChanged) {
                // Root/content height changes are expected while virtual blocks
                // mount, unmount, or async media settles. They do not invalidate
                // text-width estimates, so never turn them into an O(N) offset
                // rebuild. A real viewport-height change only needs a new window.
                if (viewportHeightChanged) {
                    this.updateVirtualWindowForViewport(
                        container.scrollTop,
                        nextViewportHeight,
                    );
                }
                return;
            }

            // During a responsive reflow Chromium may programmatically reveal
            // the focused caret between ResizeObserver callbacks. While the
            // resize correction is active, keep the original logical viewport
            // target authoritative instead of adopting that transient scroll.
            const capturedAnchor = (
                this._virtualResizeAnchorIndex === null
                || this._virtualResizeAnchorOffset === null
            ) && (
                this._virtualViewportAnchorIndex === null
                || this._virtualViewportAnchorOffset === null
            )
                ? this._captureVirtualViewportAnchor(container)
                : null;
            const anchorIndex = this._virtualResizeAnchorIndex
                ?? this._virtualViewportAnchorIndex
                ?? capturedAnchor!.index;
            const anchorOffset = this._virtualResizeAnchorOffset
                ?? this._virtualViewportAnchorOffset
                ?? capturedAnchor!.viewportOffset;
            this._virtualResizeAnchorIndex = anchorIndex;
            this._virtualResizeAnchorOffset = anchorOffset;
            // Width changes invalidate measured text/table/media geometry. Keep
            // the logical anchor, rebuild from width-aware estimates, then let
            // mounted blocks repopulate exact measurements via ResizeObserver.
            this._virtualMeasuredHeights.clear();
            this._rebuildVirtualOffsets(this._virtualStates, nextContentWidth);
            const correctedScrollTop = Math.max(
                0,
                this._virtualOffsetAt(anchorIndex) - anchorOffset,
            );
            if (correctedScrollTop <= 1 && container.scrollTop <= 1) {
                // At the document top there is no viewport anchor to preserve.
                // Starting the bounded resize scroll lock here only blocks the
                // first explicit scrollbar/programmatic jump during startup.
                // Rebuild the virtual geometry, but leave scrolling unlocked.
                this._cancelVirtualResizeCorrection();
                this.updateVirtualWindowForViewport(
                    0,
                    container.clientHeight || VIRTUAL_RENDERER_DEFAULT_VIEWPORT_PX,
                );
                this._rememberVirtualViewportAnchor(container);
                return;
            }
            this._settleVirtualResizeScroll(container, correctedScrollTop);
            if (Math.abs(container.scrollTop - correctedScrollTop) > 1)
                container.scrollTop = correctedScrollTop;
            handler();
        };
        const cancelResizeCorrection = () => this._cancelVirtualResizeCorrection();
        this._virtualScrollContainer = container;
        this._virtualScrollHandler = handler;
        this._virtualResizeInteractionHandler = cancelResizeCorrection;
        this._rebuildVirtualOffsets(this._virtualStates, contentWidth());
        container.addEventListener('scroll', handler, { passive: true });
        for (const eventName of ['wheel', 'touchstart', 'pointerdown', 'mousedown', 'keydown'] as const)
            container.addEventListener(eventName, cancelResizeCorrection, { passive: true });
        if (typeof ResizeObserver !== 'undefined') {
            this._virtualBlockResizeObserver = new ResizeObserver((entries) => {
                this._measureVirtualBlockHeights(entries);
            });
            this._virtualResizeObserver = new ResizeObserver(resizeHandler);
            this._virtualResizeObserver.observe(container);
            // Editor max-width changes only resize the Markdown surface while
            // leaving the outer scroll container unchanged. Observe both so
            // virtual height estimates are rebuilt for the actual text width.
            if (this.domNode !== container)
                this._virtualResizeObserver.observe(this.domNode!);
        }
        else if (typeof window !== 'undefined') {
            this._virtualWindowResizeHandler = resizeHandler;
            window.addEventListener('resize', resizeHandler, { passive: true });
        }
    }

    private _teardownVirtualization(): void {
        if (this._virtualScrollContainer && this._virtualScrollHandler)
            this._virtualScrollContainer.removeEventListener('scroll', this._virtualScrollHandler);
        if (this._virtualScrollContainer && this._virtualResizeInteractionHandler) {
            for (const eventName of ['wheel', 'touchstart', 'pointerdown', 'mousedown', 'keydown'] as const)
                this._virtualScrollContainer.removeEventListener(eventName, this._virtualResizeInteractionHandler);
        }
        this._cancelVirtualResizeCorrection();
        this._virtualResizeObserver?.disconnect();
        this._virtualBlockResizeObserver?.disconnect();
        if (this._virtualWindowResizeHandler && typeof window !== 'undefined')
            window.removeEventListener('resize', this._virtualWindowResizeHandler);

        this._virtualScrollContainer = null;
        this._virtualScrollHandler = null;
        this._virtualResizeObserver = null;
        this._virtualBlockResizeObserver = null;
        this._virtualWindowResizeHandler = null;
        this._virtualResizeInteractionHandler = null;
        this._virtualViewportAnchorIndex = null;
        this._virtualViewportAnchorOffset = null;
        this._virtualizationEnabled = false;
        this._virtualBlocks = [];
        this._virtualBlockIndexes.clear();
        this._virtualMountedIndexes.clear();
        this._virtualMaterializedIndexes.clear();
        this._virtualStates = [];
        this._virtualOffsetIndex.clear();
        this._virtualMeasuredHeights.clear();
        this._virtualWindowStart = 0;
        this._virtualWindowEnd = 0;
        this._virtualRevealIndex = null;
        this._virtualNavigationTarget = null;
        this._virtualBeforeSpacer = null;
        for (const spacer of this._virtualGapSpacers) {
            if (spacer.parentNode === this.domNode)
                this.domNode?.removeChild(spacer);
        }
        this._virtualGapSpacers = [];
        this._virtualAfterSpacer = null;
        this._virtualLastScrollTop = 0;
        this._virtualLastViewportHeight = VIRTUAL_RENDERER_DEFAULT_VIEWPORT_PX;
        this._publishVirtualizationDiagnostics();
    }

    private _rebuildVirtualOffsets(state: TState[], viewportWidth?: number): void {
        const typography: IVirtualTypography = {
            fontSize: this.muya.options.fontSize,
            lineHeight: this.muya.options.lineHeight,
            paragraphSpacing: this.muya.options.paragraphSpacing,
        };
        const advances = state.map((_, index) => {
            // The measured value is the real block-top -> next-block-top
            // advance, so it includes collapsed vertical margins just like the
            // virtual spacer geometry it replaces.
            return this._virtualMeasuredHeights.get(index)
                ?? estimateVirtualBlockAdvance(state, index, viewportWidth, typography);
        });
        this._virtualOffsetIndex.reset(advances);
        this._virtualGeometryRevision += 1;
    }

    private _virtualOffsetAt(index: number): number {
        return this._virtualOffsetIndex.offsetAt(index);
    }

    private _measureVirtualBlockHeights(entries: readonly ResizeObserverEntry[]): void {
        if (!this._virtualizationEnabled || !this._virtualScrollContainer)
            return;

        const container = this._virtualScrollContainer;
        let changed = false;
        const previousMaxScrollTop = Math.max(
            0,
            container.scrollHeight - container.clientHeight,
        );
        const keepBottomPinned = previousMaxScrollTop > 0
            && previousMaxScrollTop - container.scrollTop <= 2;

        for (const entry of entries) {
            const node = entry.target;
            if (!(node instanceof HTMLElement) || node.parentElement !== this.domNode)
                continue;

            const block = node[BLOCK_DOM_PROPERTY];
            if (!(block instanceof Parent))
                continue;
            const index = this._virtualBlockIndexes.get(block);
            if (index === undefined)
                continue;

            const nextBlock = this._virtualBlocks[index + 1];
            const nextNode = nextBlock?.domNode;
            // ResizeObserver border-box height excludes collapsed margins. Only
            // replace an estimate when we can measure the exact top-to-top
            // advance to the logical next block in one contiguous DOM region.
            if (
                !nextNode
                || nextNode.parentElement !== this.domNode
                || nextNode.previousElementSibling !== node
            ) {
                continue;
            }

            const currentTop = node.getBoundingClientRect().top;
            const nextTop = nextNode.getBoundingClientRect().top;
            const advance = nextTop - currentTop;
            if (!Number.isFinite(advance) || advance <= 0)
                continue;

            const previous = this._virtualMeasuredHeights.get(index);
            if (previous !== undefined && Math.abs(previous - advance) < 0.5)
                continue;

            this._virtualMeasuredHeights.set(index, advance);
            this._virtualOffsetIndex.update(index, advance);
            changed = true;
        }

        if (!changed)
            return;

        // Mounted geometry refinement changes only the measured block advances.
        // Keep the prefix index incremental here: point updates above are O(log N),
        // while full O(N) rebuilds are reserved for structural/width invalidation.
        // The latest logical viewport anchor remains authoritative while the
        // corrected prefix sums settle.
        this._virtualGeometryRevision += 1;
        if (this._virtualNavigationTarget) {
            const correctedScrollTop = this._virtualNavigationScrollTop(
                container,
                this._virtualNavigationTarget,
            );
            if (Math.abs(container.scrollTop - correctedScrollTop) > 1)
                container.scrollTop = correctedScrollTop;
        }
        else if (
            this._virtualResizeCorrectionTarget !== null
            && this._virtualResizeAnchorIndex !== null
            && this._virtualResizeAnchorOffset !== null
        ) {
            const correctedScrollTop = Math.max(
                0,
                this._virtualOffsetAt(this._virtualResizeAnchorIndex)
                - this._virtualResizeAnchorOffset,
            );
            this._settleVirtualResizeScroll(container, correctedScrollTop);
            if (Math.abs(container.scrollTop - correctedScrollTop) > 1)
                container.scrollTop = correctedScrollTop;
        }
        else if (
            this._virtualViewportAnchorIndex !== null
            && this._virtualViewportAnchorOffset !== null
        ) {
            const correctedScrollTop = Math.max(
                0,
                this._virtualOffsetAt(this._virtualViewportAnchorIndex)
                - this._virtualViewportAnchorOffset,
            );
            if (Math.abs(container.scrollTop - correctedScrollTop) > 1)
                container.scrollTop = correctedScrollTop;
        }
        this.updateVirtualWindowForViewport(
            container.scrollTop,
            container.clientHeight || VIRTUAL_RENDERER_DEFAULT_VIEWPORT_PX,
        );

        // If the user explicitly had the scrollbar pinned to the bottom, keep
        // it pinned when newly mounted measurements refine total height. This
        // is not a general anchor replay: middle-of-document wheel/trackpad
        // scrolling remains authoritative, preserving the async-diagram
        // scroll-back fix.
        if (
            keepBottomPinned
            && this._virtualNavigationTarget === null
            && this._virtualResizeCorrectionTarget === null
        ) {
            const nextMaxScrollTop = Math.max(
                0,
                container.scrollHeight - container.clientHeight,
            );
            if (Math.abs(container.scrollTop - nextMaxScrollTop) > 1) {
                container.scrollTop = nextMaxScrollTop;
                this.updateVirtualWindowForViewport(
                    nextMaxScrollTop,
                    container.clientHeight || VIRTUAL_RENDERER_DEFAULT_VIEWPORT_PX,
                );
            }
        }
    }

    private _virtualIndexAtOffset(offset: number): number {
        return this._virtualOffsetIndex.indexAtOffset(offset);
    }

    private _virtualIndexFromPath(path: TBlockPath): number | null {
        const index = path[0];
        return typeof index === 'number' && index >= 0 && index < this._virtualBlocks.length
            ? index
            : null;
    }

    private _reindexVirtualBlocks(): void {
        this._virtualStructureRevision += 1;
        this._virtualBlockIndexes.clear();
        this._virtualMountedIndexes.clear();
        this._virtualMaterializedIndexes.clear();
        for (let index = 0; index < this._virtualBlocks.length; index += 1) {
            const block = this._virtualBlocks[index];
            this._virtualBlockIndexes.set(block, index);
            const node = block.domNode;
            if (!node)
                continue;
            this._virtualMaterializedIndexes.add(index);
            if (node.parentNode === this.domNode)
                this._virtualMountedIndexes.add(index);
        }
    }

    private _virtualPinnedRanges(): IVirtualRange[] {
        if (!this._virtualizationEnabled)
            return [];

        const indexes = new Set<number>();
        const activeIndex = this.muya.editor.activeContentBlock?.outMostBlock
            ? (this._virtualBlockIndexes.get(this.muya.editor.activeContentBlock.outMostBlock) ?? -1)
            : -1;
        if (activeIndex >= 0)
            indexes.add(activeIndex);

        const { anchorPath, focusPath } = this.muya.editor.selection;
        const anchorIndex = this._virtualIndexFromPath(anchorPath);
        const focusIndex = this._virtualIndexFromPath(focusPath);
        if (anchorIndex !== null)
            indexes.add(anchorIndex);
        if (focusIndex !== null)
            indexes.add(focusIndex);
        if (this._virtualRevealIndex !== null)
            indexes.add(this._virtualRevealIndex);

        return [...indexes]
            .sort((left, right) => left - right)
            .map(index => ({ start: index, end: index + 1 }));
    }

    private _buildVirtualRanges(
        start: number,
        end: number,
        pinned: readonly IVirtualRange[] = [],
    ): IVirtualRange[] {
        const totalBlocks = this._virtualBlocks.length;
        const safeStart = Math.max(0, Math.min(start, totalBlocks));
        const safeEnd = Math.max(safeStart, Math.min(end, totalBlocks));
        const ranges: IVirtualRange[] = [{ start: safeStart, end: safeEnd }];

        for (const pinnedRange of pinned) {
            if (pinnedRange.end <= pinnedRange.start)
                continue;
            const pinnedStart = Math.max(0, Math.min(pinnedRange.start, totalBlocks));
            const pinnedEnd = Math.max(pinnedStart, Math.min(pinnedRange.end, totalBlocks));
            if (pinnedEnd > pinnedStart)
                ranges.push({ start: pinnedStart, end: pinnedEnd });
        }

        ranges.sort((left, right) => left.start - right.start);
        const mergedRanges: IVirtualRange[] = [];
        for (const range of ranges) {
            const previous = mergedRanges.at(-1);
            if (previous && range.start <= previous.end)
                previous.end = Math.max(previous.end, range.end);
            else
                mergedRanges.push({ ...range });
        }
        return mergedRanges;
    }

    private _collectVirtualIndexes(ranges: IVirtualRange[]): Set<number> {
        const desired = new Set<number>();
        for (const range of ranges) {
            for (let index = range.start; index < range.end; index += 1)
                desired.add(index);
        }
        return desired;
    }

    private _removeBlocksOutsideVirtualRanges(desired: Set<number>): void {
        for (const index of this._virtualMountedIndexes) {
            if (desired.has(index))
                continue;
            const block = this._virtualBlocks[index];
            if (!block)
                continue;

            if (canDeferVirtualStateDom(this._virtualStates[index])) {
                if (block.domNode)
                    this._virtualBlockResizeObserver?.unobserve(block.domNode);
                block.dematerializeDomTree();
                this._virtualMaterializedIndexes.delete(index);
                continue;
            }

            const node = block.domNode;
            if (node && node.parentNode === this.domNode) {
                this._virtualBlockResizeObserver?.unobserve(node);
                this.domNode!.removeChild(node);
            }
        }
    }

    private _virtualGapSpacer(index: number): HTMLElement {
        let spacer = this._virtualGapSpacers[index];
        if (spacer)
            return spacer;

        spacer = document.createElement('div');
        spacer.className = 'mu-virtual-render-placeholder mu-virtual-render-placeholder-middle';
        spacer.setAttribute('aria-hidden', 'true');
        spacer.style.pointerEvents = 'none';
        spacer.style.userSelect = 'none';
        this._virtualGapSpacers[index] = spacer;
        return spacer;
    }

    private _buildVirtualDomSequence(ranges: IVirtualRange[]): Node[] | null {
        const before = this._virtualBeforeSpacer;
        const after = this._virtualAfterSpacer;
        if (!before || !after)
            return null;

        const totalHeight = this._virtualOffsetIndex.total();
        const firstRange = ranges[0] ?? { start: 0, end: 0 };
        const lastRange = ranges.at(-1) ?? firstRange;
        const beforeHeight = `${this._virtualOffsetAt(firstRange.start)}px`;
        const afterHeight = `${Math.max(
            0,
            totalHeight - this._virtualOffsetAt(lastRange.end),
        )}px`;
        if (before.style.height !== beforeHeight)
            before.style.height = beforeHeight;
        if (after.style.height !== afterHeight)
            after.style.height = afterHeight;

        const requiredGapCount = Math.max(0, ranges.length - 1);
        for (let index = requiredGapCount; index < this._virtualGapSpacers.length; index += 1) {
            const spacer = this._virtualGapSpacers[index];
            if (spacer?.parentNode === this.domNode)
                this.domNode?.removeChild(spacer);
        }

        const sequence: Node[] = [before];
        for (let rangeIndex = 0; rangeIndex < ranges.length; rangeIndex += 1) {
            const range = ranges[rangeIndex];
            for (let index = range.start; index < range.end; index += 1) {
                const block = this._virtualBlocks[index];
                if (!block)
                    continue;
                let node = block.domNode;
                if (!node) {
                    node = block.materializeDomTree();
                    if (node)
                        this._virtualMaterializedIndexes.add(index);
                }
                if (node) {
                    if (node instanceof HTMLElement && node.dataset.virtualBlockIndex !== String(index))
                        node.dataset.virtualBlockIndex = String(index);
                    sequence.push(node);
                }
            }

            const nextRange = ranges[rangeIndex + 1];
            if (nextRange) {
                const gapHeight = Math.max(
                    0,
                    this._virtualOffsetAt(nextRange.start)
                    - this._virtualOffsetAt(range.end),
                );
                const spacer = this._virtualGapSpacer(rangeIndex);
                const gapHeightPx = `${gapHeight}px`;
                if (spacer.style.height !== gapHeightPx)
                    spacer.style.height = gapHeightPx;
                sequence.push(spacer);
            }
        }
        sequence.push(after);
        return sequence;
    }

    private _notifyVirtualBlockMounted(node: HTMLElement): void {
        if (node.classList.contains('mu-virtual-render-placeholder'))
            return;

        this._virtualBlockResizeObserver?.observe(node);

        node.querySelectorAll<HTMLElement>('[data-image-lazy="pending"]').forEach((image) => {
            image.dispatchEvent(new Event(VIRTUAL_BLOCK_MOUNT_EVENT));
        });
    }

    private _syncVirtualDomSequence(sequence: Node[]): void {
        const structureChanged = this._virtualAppliedStructureRevision !== this._virtualStructureRevision;
        let ref: Node | null = null;
        for (let index = sequence.length - 1; index >= 0; index -= 1) {
            const node = sequence[index];
            const wasConnected = node.parentNode === this.domNode;
            const isSpacer = node instanceof HTMLElement
                && node.classList.contains('mu-virtual-render-placeholder');
            if (!wasConnected || ((structureChanged || isSpacer) && node.nextSibling !== ref))
                this.domNode!.insertBefore(node, ref);
            if (!wasConnected && node instanceof HTMLElement)
                this._notifyVirtualBlockMounted(node);
            ref = node;
        }
    }

    private _applyVirtualWindow(
        start: number,
        end: number,
        pinned: readonly IVirtualRange[] = [],
        preparedRanges?: IVirtualRange[],
        preparedDesiredIndexes?: Set<number>,
    ): void {
        if (!this._virtualizationEnabled || !this.domNode)
            return;

        const ranges = preparedRanges ?? this._buildVirtualRanges(start, end, pinned);
        const desiredIndexes = preparedDesiredIndexes ?? this._collectVirtualIndexes(ranges);
        this._removeBlocksOutsideVirtualRanges(desiredIndexes);
        const sequence = this._buildVirtualDomSequence(ranges);
        if (!sequence)
            return;

        this._syncVirtualDomSequence(sequence);
        this._virtualMountedIndexes = desiredIndexes;
        this._virtualAppliedGeometryRevision = this._virtualGeometryRevision;
        this._virtualAppliedStructureRevision = this._virtualStructureRevision;
        this._virtualWindowStart = Math.max(0, Math.min(start, this._virtualBlocks.length));
        this._virtualWindowEnd = Math.max(
            this._virtualWindowStart,
            Math.min(end, this._virtualBlocks.length),
        );
        this._publishVirtualizationDiagnostics();
    }

    updateVirtualWindowForViewport(scrollTop: number, viewportHeight: number): void {
        if (!this._virtualizationEnabled)
            return;

        const height = Math.max(1, viewportHeight || VIRTUAL_RENDERER_DEFAULT_VIEWPORT_PX);
        this._virtualLastScrollTop = Math.max(0, scrollTop);
        this._virtualLastViewportHeight = height;
        const overscan = height * VIRTUAL_RENDERER_OVERSCAN_VIEWPORTS;
        const startOffset = Math.max(0, this._virtualLastScrollTop - overscan);
        const endOffset = this._virtualLastScrollTop + height + overscan;
        const start = this._virtualIndexAtOffset(startOffset);
        const end = Math.min(this._virtualBlocks.length, this._virtualIndexAtOffset(endOffset) + 1);
        const pinned = this._virtualPinnedRanges();
        const ranges = this._buildVirtualRanges(start, end, pinned);
        const desiredIndexes = this._collectVirtualIndexes(ranges);
        const mountedUnchanged = desiredIndexes.size === this._virtualMountedIndexes.size
            && [...desiredIndexes].every(index => this._virtualMountedIndexes.has(index));
        const geometryUnchanged = this._virtualAppliedGeometryRevision === this._virtualGeometryRevision;
        const windowUnchanged = start === this._virtualWindowStart && end === this._virtualWindowEnd;
        if (!windowUnchanged || !mountedUnchanged || !geometryUnchanged)
            this._applyVirtualWindow(start, end, pinned, ranges, desiredIndexes);

        // Replacing large DOM gaps with spacers can make Chromium's native
        // scroll anchoring choose the still-connected active block and pull the
        // viewport back toward it. The requested scrollTop is the user's source
        // of truth; restore it after the window mutation when layout adjusted it.
        if (
            this._virtualScrollContainer
            && Math.abs(this._virtualScrollContainer.scrollTop - this._virtualLastScrollTop) > 1
        ) {
            this._virtualScrollContainer.scrollTop = this._virtualLastScrollTop;
        }
    }

    setVirtualRevealPath(path: TBlockPath | null): void {
        if (!this._virtualizationEnabled)
            return;

        this._virtualRevealIndex = path === null
            ? null
            : this._virtualIndexFromPath(path);

        this.updateVirtualWindowForViewport(
            this._virtualLastScrollTop,
            this._virtualLastViewportHeight,
        );
    }

    ensureVirtualSelectionRange(anchorPath: TBlockPath, focusPath: TBlockPath): void {
        if (!this._virtualizationEnabled)
            return;
        const anchorIndex = this._virtualIndexFromPath(anchorPath);
        const focusIndex = this._virtualIndexFromPath(focusPath);
        if (anchorIndex === null || focusIndex === null)
            return;

        const pinned: IVirtualRange[] = [
            { start: anchorIndex, end: anchorIndex + 1 },
        ];
        if (focusIndex !== anchorIndex)
            pinned.push({ start: focusIndex, end: focusIndex + 1 });

        this._applyVirtualWindow(
            this._virtualWindowStart,
            this._virtualWindowEnd,
            pinned,
        );
    }

    private _pendingDetachedBlockCount(): number {
        let pending = 0;
        for (let batchIndex = this._detachedBatchIndex; batchIndex < this._detachedBlockBatches.length; batchIndex += 1) {
            const batch = this._detachedBlockBatches[batchIndex];
            const startIndex = batchIndex === this._detachedBatchIndex ? this._detachedBlockIndex : 0;
            pending += Math.max(0, batch.length - startIndex);
        }
        return pending;
    }

    getVirtualizationSnapshot(): IVirtualizationSnapshot {
        const totalBlocks = this._virtualBlocks.length;
        const totalEstimatedHeight = this._virtualOffsetIndex.total();
        return {
            enabled: this._virtualizationEnabled,
            totalBlocks,
            mountedBlocks: this._virtualizationEnabled
                ? this._virtualMountedIndexes.size
                : this.children.length,
            materializedBlocks: this._virtualizationEnabled
                ? this._virtualMaterializedIndexes.size
                : this.children.length,
            retainedDetachedDomBlocks: this._virtualizationEnabled
                ? Math.max(0, this._virtualMaterializedIndexes.size - this._virtualMountedIndexes.size)
                : 0,
            pendingDetachedBlocks: this._pendingDetachedBlockCount(),
            windowStart: this._virtualWindowStart,
            windowEnd: this._virtualWindowEnd,
            beforeHeight: this._virtualizationEnabled
                ? this._virtualOffsetAt(this._virtualWindowStart)
                : 0,
            afterHeight: this._virtualizationEnabled
                ? Math.max(
                        0,
                        totalEstimatedHeight - this._virtualOffsetAt(this._virtualWindowEnd),
                    )
                : 0,
            totalEstimatedHeight,
            viewportHeight: this._virtualLastViewportHeight,
            renderCacheEntries: this._renderCache.size,
        };
    }

    private _virtualNavigationScrollTop(
        container: HTMLElement,
        target: { index: number; viewportOffset: number },
    ): number {
        const totalHeight = this._virtualOffsetIndex.total();
        const maxScrollTop = Math.max(0, totalHeight - container.clientHeight);
        const blockNode = this._virtualBlocks[target.index]?.domNode;

        // Once the approximate virtual jump has mounted the target block, its
        // real DOM position is authoritative. This automatically includes the
        // spacer boundary and collapsed margins that an estimate cannot know
        // exactly, so TOC navigation lands on the requested logical block.
        if (blockNode && blockNode.parentElement === this.domNode) {
            const containerTop = container.getBoundingClientRect().top;
            const blockTop = blockNode.getBoundingClientRect().top;
            const exactScrollTop
                = container.scrollTop + blockTop - containerTop - target.viewportOffset;
            return Math.max(0, Math.min(maxScrollTop, exactScrollTop));
        }

        return Math.max(
            0,
            Math.min(
                maxScrollTop,
                this._virtualOffsetAt(target.index) - target.viewportOffset,
            ),
        );
    }

    scrollVirtualBlockIntoView(index: number, viewportOffset = 0): boolean {
        if (
            !this._virtualizationEnabled
            || !this._virtualScrollContainer
            || !Number.isInteger(index)
            || index < 0
            || index >= this._virtualBlocks.length
        ) {
            return false;
        }

        this._cancelVirtualResizeCorrection();
        this._virtualNavigationTarget = {
            index,
            viewportOffset: Math.max(0, viewportOffset),
        };
        const container = this._virtualScrollContainer;
        const targetScrollTop = this._virtualNavigationScrollTop(
            container,
            this._virtualNavigationTarget,
        );
        this.updateVirtualWindowForViewport(
            targetScrollTop,
            container.clientHeight || VIRTUAL_RENDERER_DEFAULT_VIEWPORT_PX,
        );
        const exactTargetScrollTop = this._virtualNavigationScrollTop(
            container,
            this._virtualNavigationTarget,
        );
        if (Math.abs(container.scrollTop - exactTargetScrollTop) > 1)
            container.scrollTop = exactTargetScrollTop;
        return true;
    }

    getVirtualBlockOffset(index: number): number | null {
        if (
            !this._virtualizationEnabled
            || !Number.isInteger(index)
            || index < 0
            || index >= this._virtualBlocks.length
        ) {
            return null;
        }
        return this._virtualOffsetAt(index);
    }

    getVirtualizationPrototypeSnapshot(): IVirtualizationSnapshot {
        return this.getVirtualizationSnapshot();
    }

    private _publishVirtualizationDiagnostics(): void {
        const { domNode } = this;
        if (!domNode)
            return;

        if (!this._virtualizationEnabled) {
            for (const key of [
                'virtualizationEnabled',
                'virtualTotalBlocks',
                'virtualMountedBlocks',
                'virtualMaterializedBlocks',
                'virtualRetainedDetachedBlocks',
                'virtualPendingDetachedBlocks',
                'virtualWindowStart',
                'virtualWindowEnd',
            ] as const) {
                if (domNode.dataset[key] !== undefined)
                    delete domNode.dataset[key];
            }
            return;
        }

        const snapshot = this.getVirtualizationSnapshot();
        const setDiagnostic = (key: keyof DOMStringMap, value: string): void => {
            if (domNode.dataset[key] !== value)
                domNode.dataset[key] = value;
        };
        setDiagnostic('virtualizationEnabled', 'true');
        setDiagnostic('virtualTotalBlocks', String(snapshot.totalBlocks));
        setDiagnostic('virtualMountedBlocks', String(snapshot.mountedBlocks));
        setDiagnostic('virtualMaterializedBlocks', String(snapshot.materializedBlocks));
        setDiagnostic('virtualRetainedDetachedBlocks', String(snapshot.retainedDetachedDomBlocks));
        setDiagnostic('virtualPendingDetachedBlocks', String(snapshot.pendingDetachedBlocks));
        setDiagnostic('virtualWindowStart', String(snapshot.windowStart));
        setDiagnostic('virtualWindowEnd', String(snapshot.windowEnd));
    }

    private _startProgressiveRender(
        state: TState[],
        startIndex: number,
        cloneBlocks: boolean,
        progressiveStartDelayMs: number,
    ): void {
        if (startIndex >= state.length)
            return;

        this._cloneProgressiveBlocks = cloneBlocks;
        this._progressiveStates = state;
        this._progressiveIndex = startIndex;
        this._progressiveRemainingHeight = estimateStatesHeight(state, startIndex);
        this._progressiveCompletion = new Promise((resolve) => {
            this._resolveProgressiveCompletion = resolve;
        });

        const spacer = document.createElement('div');
        spacer.className = 'mu-progressive-render-placeholder';
        spacer.setAttribute('aria-hidden', 'true');
        spacer.style.height = `${this._progressiveRemainingHeight}px`;
        spacer.style.pointerEvents = 'none';
        spacer.style.userSelect = 'none';
        this._progressiveSpacer = spacer;
        this.domNode!.appendChild(spacer);

        const generation = this._progressiveGeneration;
        // Leave two paint boundaries before background work starts. The
        // initial cold mount can still opt into its small startup delay, but
        // tab switches use the idle scheduler instead of a fixed quiet window.
        this._progressiveFrameId = requestAnimationFrame(() => {
            if (generation !== this._progressiveGeneration)
                return;

            this._progressiveFrameId = requestAnimationFrame(() => {
                if (generation !== this._progressiveGeneration)
                    return;

                this._progressiveTimerId = setTimeout(() => {
                    this._progressiveTimerId = null;
                    this._scheduleProgressiveWork(generation);
                }, progressiveStartDelayMs);
            });
        });
    }

    private _scheduleProgressiveWork(generation: number): void {
        const scheduler = idleScheduler();
        if (typeof scheduler.requestIdleCallback === 'function') {
            this._progressiveIdleCallbackId = scheduler.requestIdleCallback((deadline) => {
                this._progressiveIdleCallbackId = null;
                const budgetMs = deadline
                    ? Math.min(PROGRESSIVE_RENDER_CHUNK_BUDGET_MS, Math.max(0, deadline.timeRemaining()))
                    : PROGRESSIVE_RENDER_CHUNK_BUDGET_MS;
                if (budgetMs > 0)
                    this._renderProgressiveChunk(generation, budgetMs);
                else
                    this._scheduleProgressiveWork(generation);
            });
            return;
        }

        this._progressiveFrameId = requestAnimationFrame(() => {
            this._progressiveFrameId = null;
            this._renderProgressiveChunk(generation);
        });
    }

    private _renderProgressiveChunk(
        generation: number,
        budgetMs = PROGRESSIVE_RENDER_CHUNK_BUDGET_MS,
    ): void {
        if (generation !== this._progressiveGeneration)
            return;

        const states = this._progressiveStates;
        if (!states) {
            this._finishProgressiveRender();
            return;
        }

        // Measure the expensive operation itself. Advancing an index in a
        // tight loop is cheap and would otherwise select the whole document
        // before `_mountBlocks` constructs any of its DOM.
        const startedAt = performance.now();
        const blocks: Parent[] = [];
        do {
            const state = states[this._progressiveIndex];
            if (!state)
                break;

            const renderState = this._cloneProgressiveBlocks ? deepClone(state) : state;
            blocks.push(ScrollPage.loadBlock(renderState.name).create(this.muya, renderState));
            this._progressiveRemainingHeight -= estimateStateHeight(state);
            this._progressiveIndex += 1;
        }
        while (
            this._progressiveIndex < states.length
            && performance.now() - startedAt < budgetMs
        );

        this._appendBlocks(blocks, true);
        this._progressiveRemainingHeight = Math.max(0, this._progressiveRemainingHeight);
        if (this._progressiveSpacer)
            this._progressiveSpacer.style.height = `${this._progressiveRemainingHeight}px`;

        if (this._progressiveIndex >= states.length) {
            this._finishProgressiveRender();
            return;
        }

        this._scheduleProgressiveWork(generation);
    }

    private _finishProgressiveRender(): void {
        this._progressiveSpacer?.remove();
        this._progressiveSpacer = null;
        this._progressiveStates = null;
        this._progressiveIndex = 0;
        this._progressiveRemainingHeight = 0;
        this._cloneProgressiveBlocks = false;

        const resolve = this._resolveProgressiveCompletion;
        this._resolveProgressiveCompletion = null;
        this._progressiveCompletion = null;
        resolve?.();
    }

    private _detachRenderedBlocks(): Parent[] {
        const detached: Parent[] = [];
        this.children.forEach(child => detached.push(child as Parent));

        this.children.head = null;
        this.children.tail = null;
        this.children.length = 0;

        detached.forEach((block) => {
            block.parent = null;
            block.prev = null;
            block.next = null;
        });

        const domNode = this.domNode;
        if (domNode) {
            const selection = domNode.ownerDocument.getSelection();
            const selectionIsInside = selection?.rangeCount
                && ((selection.anchorNode && domNode.contains(selection.anchorNode))
                    || (selection.focusNode && domNode.contains(selection.focusNode)));
            if (selectionIsInside)
                selection?.removeAllRanges();

            // Remove the entire rendered surface in one DOM operation. The
            // detached block roots are disposed incrementally below.
            domNode.replaceChildren();
        }

        return detached;
    }

    private _queueDetachedBlocks(blocks: Parent[]): void {
        if (blocks.length === 0)
            return;

        this._detachedBlockBatches.push(blocks);
        this._publishVirtualizationDiagnostics();
        this._scheduleDetachedDisposal();
    }

    private _buildRenderedCacheEntry(
        key: string | null,
        state: TState[] | null,
        progressiveStates: TState[] | null,
        progressiveIndex: number,
        cloneBlocks: boolean,
        blocks: Parent[],
    ): IRenderedCacheEntry | null {
        if (!key || !state)
            return null;

        const complete = progressiveStates === null && blocks.length === state.length;
        const partial = progressiveStates === state
            && progressiveIndex > 0
            && progressiveIndex < state.length
            && blocks.length === progressiveIndex;
        if (!complete && !partial)
            return null;

        const cachedBlockCount = state.length > PROGRESSIVE_RENDER_THRESHOLD
            ? Math.min(PROGRESSIVE_RENDER_INITIAL_BLOCKS, blocks.length)
            : blocks.length;
        const cachedBlocks = blocks.slice(0, cachedBlockCount);
        if (cachedBlockCount < blocks.length)
            this._queueDetachedBlocks(blocks.slice(cachedBlockCount));

        return {
            state,
            stateSignature: stateSignature(state),
            blocks: cachedBlocks,
            mountedCount: cachedBlockCount,
            cloneBlocks,
        };
    }

    private _storeRenderedCacheEntry(key: string, entry: IRenderedCacheEntry): void {
        const existing = this._renderCache.get(key);
        if (existing)
            this._queueDetachedBlocks(existing.blocks);

        this._renderCache.delete(key);
        this._renderCache.set(key, entry);

        while (this._renderCache.size > MAX_RENDER_CACHE_ENTRIES) {
            const oldestKey = this._renderCache.keys().next().value;
            if (oldestKey === undefined)
                break;

            const oldest = this._renderCache.get(oldestKey);
            this._renderCache.delete(oldestKey);
            if (oldest)
                this._queueDetachedBlocks(oldest.blocks);
        }
    }

    private _takeRenderedCacheEntry(
        key: string | null,
        state: TState[],
        progressive: boolean,
    ): IRenderedCacheEntry | null {
        if (!key)
            return null;

        const entry = this._renderCache.get(key);
        if (!entry)
            return null;

        this._renderCache.delete(key);
        const targetSignature = entry.state === state ? entry.stateSignature : stateSignature(state);
        const stateMatches = entry.state === state
            || (entry.stateSignature !== null && entry.stateSignature === targetSignature);
        const shapeMatches = entry.mountedCount === entry.blocks.length
            && entry.mountedCount <= state.length
            && (entry.mountedCount === state.length || state.length > PROGRESSIVE_RENDER_THRESHOLD);
        if (!progressive || !stateMatches || !shapeMatches) {
            this._queueDetachedBlocks(entry.blocks);
            return null;
        }

        return entry;
    }

    private _restoreRenderedCacheEntry(
        state: TState[],
        entry: IRenderedCacheEntry,
        progressiveStartDelayMs: number,
    ): void {
        this._renderedState = state;
        this._appendBlocks(entry.blocks);
        if (entry.mountedCount < state.length) {
            this._startProgressiveRender(
                state,
                entry.mountedCount,
                entry.cloneBlocks,
                progressiveStartDelayMs,
            );
        }
    }

    private _scheduleDetachedDisposal(): void {
        const hasPendingBatches = this._detachedBatchIndex < this._detachedBlockBatches.length;
        if (
            !hasPendingBatches
            || this._detachedDisposalFrameId !== null
            || this._detachedDisposalIdleCallbackId !== null
        ) {
            return;
        }

        const scheduler = idleScheduler();
        if (typeof scheduler.requestIdleCallback === 'function') {
            this._detachedDisposalIdleCallbackId = scheduler.requestIdleCallback((deadline) => {
                this._detachedDisposalIdleCallbackId = null;
                const budgetMs = deadline
                    ? Math.min(DETACHED_BLOCK_DISPOSAL_BUDGET_MS, Math.max(0, deadline.timeRemaining()))
                    : DETACHED_BLOCK_DISPOSAL_BUDGET_MS;
                if (budgetMs > 0)
                    this._disposeDetachedBlocksChunk(budgetMs);
                else
                    this._scheduleDetachedDisposal();
            });
            return;
        }

        // Keep the fallback on two paint boundaries for browsers without an
        // idle callback implementation.
        this._detachedDisposalFrameId = requestAnimationFrame(() => {
            this._detachedDisposalFrameId = requestAnimationFrame(() => {
                this._detachedDisposalFrameId = null;
                this._disposeDetachedBlocksChunk();
            });
        });
    }

    private _disposeDetachedBlocksChunk(
        budgetMs = DETACHED_BLOCK_DISPOSAL_BUDGET_MS,
    ): void {
        const startedAt = performance.now();
        while (
            this._detachedBatchIndex < this._detachedBlockBatches.length
            && performance.now() - startedAt < budgetMs
        ) {
            const batch = this._detachedBlockBatches[this._detachedBatchIndex];
            batch[this._detachedBlockIndex++]?.dispose();
            if (this._detachedBlockIndex >= batch.length) {
                this._detachedBatchIndex += 1;
                this._detachedBlockIndex = 0;
            }
        }

        if (this._detachedBatchIndex >= this._detachedBlockBatches.length) {
            this._detachedBlockBatches = [];
            this._detachedBatchIndex = 0;
            this._detachedBlockIndex = 0;
        }
        this._publishVirtualizationDiagnostics();
        this._scheduleDetachedDisposal();
    }

    private _disposeDetachedBlocksImmediately(): void {
        for (let batchIndex = this._detachedBatchIndex; batchIndex < this._detachedBlockBatches.length; batchIndex += 1) {
            const batch = this._detachedBlockBatches[batchIndex];
            const blockIndex = batchIndex === this._detachedBatchIndex ? this._detachedBlockIndex : 0;
            for (let index = blockIndex; index < batch.length; index += 1)
                batch[index].dispose();
        }
        this._detachedBlockBatches = [];
        this._detachedBatchIndex = 0;
        this._detachedBlockIndex = 0;
        this._publishVirtualizationDiagnostics();
    }

    private _cancelProgressiveRender(): void {
        this._progressiveGeneration += 1;
        if (this._progressiveFrameId !== null)
            cancelAnimationFrame(this._progressiveFrameId);
        const scheduler = idleScheduler();
        if (
            this._progressiveIdleCallbackId !== null
            && typeof scheduler.cancelIdleCallback === 'function'
        ) {
            scheduler.cancelIdleCallback(this._progressiveIdleCallbackId);
        }
        if (this._progressiveTimerId !== null)
            clearTimeout(this._progressiveTimerId);

        this._progressiveFrameId = null;
        this._progressiveIdleCallbackId = null;
        this._progressiveTimerId = null;
        this._progressiveSpacer?.remove();
        this._progressiveSpacer = null;
        this._progressiveStates = null;
        this._progressiveIndex = 0;
        this._progressiveRemainingHeight = 0;
        this._cloneProgressiveBlocks = false;

        const resolve = this._resolveProgressiveCompletion;
        this._resolveProgressiveCompletion = null;
        this._progressiveCompletion = null;
        resolve?.();
    }

    updateState(
        state: TState[],
        progressive = true,
        cloneBlocks = false,
        progressiveStartDelayMs = 0,
        renderCacheKey: string | null = null,
    ) {
        const previousKey = this._renderCacheKey;
        const previousState = this._renderedState;
        const previousProgressiveStates = this._progressiveStates;
        const previousProgressiveIndex = this._progressiveIndex;
        const previousCloneBlocks = this._cloneProgressiveBlocks;
        const previousWasVirtualized = this._virtualizationEnabled;
        const targetIsCurrent = renderCacheKey !== null && renderCacheKey === previousKey;
        let targetEntry: IRenderedCacheEntry | null = null;
        if (!targetIsCurrent) {
            targetEntry = this._takeRenderedCacheEntry(renderCacheKey, state, progressive);
        }
        else {
            const staleEntry = this._renderCache.get(renderCacheKey);
            if (staleEntry) {
                this._renderCache.delete(renderCacheKey);
                this._queueDetachedBlocks(staleEntry.blocks);
            }
        }

        this._cancelProgressiveRender();
        this._teardownVirtualization();
        const detached = this._detachRenderedBlocks();

        const cacheEntry = previousWasVirtualized
            ? null
            : this._buildRenderedCacheEntry(
                    previousKey === renderCacheKey ? null : previousKey,
                    previousState,
                    previousProgressiveStates,
                    previousProgressiveIndex,
                    previousCloneBlocks,
                    detached,
                );
        if (cacheEntry)
            this._storeRenderedCacheEntry(previousKey as string, cacheEntry);
        else
            this._queueDetachedBlocks(detached);

        this._renderCacheKey = renderCacheKey;
        if (state.length > PROGRESSIVE_RENDER_THRESHOLD && shouldUseVirtualization(this.muya)) {
            if (targetEntry)
                this._queueDetachedBlocks(targetEntry.blocks);
            this._mountVirtualization(state, cloneBlocks);
        }
        else if (targetEntry) {
            this._restoreRenderedCacheEntry(state, targetEntry, progressiveStartDelayMs);
        }
        else if (progressive) {
            this._mountState(state, cloneBlocks, progressiveStartDelayMs);
        }
        else {
            this._renderedState = state;
            this._mountBlocks(state, false, cloneBlocks);
        }
    }

    /** Keep the render-cache state aligned after an incremental tree update. */
    setRenderedState(state: TState[]): void {
        this._renderedState = state;
        if (this._virtualizationEnabled) {
            const measuredByBlock = new Map<Parent, number>();
            for (const [index, height] of this._virtualMeasuredHeights) {
                const block = this._virtualBlocks[index];
                if (block)
                    measuredByBlock.set(block, height);
            }

            const blocks: Parent[] = [];
            this.children.forEach(child => blocks.push(child as Parent));
            this._virtualBlocks = blocks;
            this._virtualStates = state;
            // Incremental edits may shift indexes, but unchanged live block
            // objects keep their measured geometry. Re-key measurements by
            // block identity so typing in one block never throws the whole
            // document back to estimates and moves the virtual viewport.
            this._virtualMeasuredHeights.clear();
            for (let index = 0; index < blocks.length; index += 1) {
                const measuredHeight = measuredByBlock.get(blocks[index]);
                if (measuredHeight !== undefined)
                    this._virtualMeasuredHeights.set(index, measuredHeight);
            }
            this._reindexVirtualBlocks();
            this._rebuildVirtualOffsets(state);
            this.updateVirtualWindowForViewport(
                this._virtualLastScrollTop,
                this._virtualLastViewportHeight,
            );
            return;
        }

        if (this._progressiveStates === null)
            return;

        const mountedCount = this.children.length;
        if (mountedCount > state.length) {
            this._cancelProgressiveRender();
            return;
        }

        if (mountedCount === state.length) {
            this._finishProgressiveRender();
            return;
        }

        this._progressiveStates = state;
        this._progressiveIndex = mountedCount;
        this._progressiveRemainingHeight = estimateStatesHeight(state, mountedCount);
        if (this._progressiveSpacer)
            this._progressiveSpacer.style.height = `${this._progressiveRemainingHeight}px`;
    }

    /**
     * Find the content block by the path
     * @param {Array} path
     */
    queryBlock(path: TBlockPath) {
        if (path.length === 0)
            return this;

        const p = path.shift() as number;
        const block = this.find(p) as Parent & { queryBlock: (p: TBlockPath) => Parent | Content | undefined };
        return block && path.length ? block.queryBlock(path) : block;
    }

    updateRefLinkAndImage(label: string) {
        const REG = new RegExp(`\\[${label}\\](?!:)`);

        this.breadthFirstTraverse((node) => {
            if (node.isContent() && REG.test(node.text))
                node.update();
        });
    }

    handleBlurFromContent(block: Content) {
        this._blurFocus.blur = block;
        this._scheduleActiveStatusUpdate();
    }

    handleFocusFromContent(block: Content) {
        this._blurFocus.focus = block;
        this._scheduleActiveStatusUpdate();
    }

    private _scheduleActiveStatusUpdate() {
        const frameId = requestAnimationFrame(() => {
            this._activeStatusFrames.delete(frameId);
            this._updateActiveStatus();
        });
        this._activeStatusFrames.add(frameId);
    }

    override dispose(): void {
        this._cancelProgressiveRender();
        this._teardownVirtualization();
        if (this._detachedDisposalFrameId !== null)
            cancelAnimationFrame(this._detachedDisposalFrameId);
        const scheduler = idleScheduler();
        if (
            this._detachedDisposalIdleCallbackId !== null
            && typeof scheduler.cancelIdleCallback === 'function'
        ) {
            scheduler.cancelIdleCallback(this._detachedDisposalIdleCallbackId);
        }
        this._detachedDisposalFrameId = null;
        this._detachedDisposalIdleCallbackId = null;
        this._disposeDetachedBlocksImmediately();
        this._renderCache.forEach(entry => entry.blocks.forEach(block => block.dispose()));
        this._renderCache.clear();
        this._renderCacheKey = null;
        this._renderedState = null;
        this._activeStatusFrames.forEach(frameId => cancelAnimationFrame(frameId));
        this._activeStatusFrames.clear();
        this._blurFocus = { blur: null, focus: null };
        super.dispose();
    }

    private _updateActiveStatus = () => {
        const { blur, focus } = this._blurFocus;

        if (blur == null && focus == null)
            return;

        let needBlurBlocks: Parent[] = [];
        let needFocusBlocks: Parent[] = [];
        let block;

        if (blur && focus) {
            needFocusBlocks = focus.getAncestors();
            block = blur.parent;
            while (block && block.isParent && block.isParent() && !needFocusBlocks.includes(block)) {
                needBlurBlocks.push(block);
                block = block.parent;
            }
        }
        else if (blur) {
            needBlurBlocks = blur.getAncestors();
        }
        else if (focus) {
            needFocusBlocks = focus.getAncestors();
        }

        if (needBlurBlocks.length) {
            needBlurBlocks.forEach((b) => {
                b.active = false;
            });
        }

        if (needFocusBlocks.length) {
            needFocusBlocks.forEach((b) => {
                b.active = true;
            });
        }

        this._blurFocus = {
            blur: null,
            focus: null,
        };
    };

    // Create a new paragraph if click the blank area in editor.
    private _clickHandler(event: Event) {
        if (!isMouseEvent(event) || !isHTMLElement(event.target))
            return;

        const target = event.target;

        if (target[BLOCK_DOM_PROPERTY] === this) {
            const lastChild = this.lastChild as Parent | null;
            if (!lastChild)
                return;
            const lastContentBlock = lastChild.lastContentInDescendant();
            const { clientY } = event;
            const lastChildDom = lastChild.domNode;
            // A virtualized tail block can be dematerialized between selection
            // mouseup and the following click. Never dereference a stale DOM
            // node from that race; the next mounted click will handle the
            // blank-area behavior normally.
            if (!lastContentBlock || !lastChildDom || !lastChildDom.isConnected)
                return;
            const { bottom } = lastChildDom.getBoundingClientRect();

            if (clientY > bottom) {
                if (
                    lastChild.blockName === 'paragraph'
                    && lastContentBlock.text === ''
                ) {
                    lastContentBlock.setCursor(0, 0);
                }
                else {
                    const state = {
                        name: 'paragraph',
                        text: '',
                    };
                    const newNode = ScrollPage.loadBlock(state.name).create(
                        this.muya,
                        state,
                    );
                    this.append(newNode, 'user');
                    const cursorBlock = newNode.lastContentInDescendant();
                    cursorBlock.setCursor(0, 0, true);
                }
            }
        }
    }
}
