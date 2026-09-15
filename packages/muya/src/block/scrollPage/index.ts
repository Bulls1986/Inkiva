import type { Muya } from '../../muya';
import type { TState } from '../../state/types';
import type { Nullable } from '../../types';
import type Content from '../base/content';
import type TreeNode from '../base/treeNode';
import type { IConstructor, TBlockPath } from '../types';
import { BLOCK_DOM_PROPERTY } from '../../config';
import { isHTMLElement, isMouseEvent } from '../../utils';
import logger from '../../utils/logger';
import Parent from '../base/parent';

const debug = logger('scrollpage:');

interface IBlurFocus {
    blur: Nullable<Content>;
    focus: Nullable<Content>;
}

// Constructing and parsing every inline content node before the browser gets a
// paint makes a large document look frozen even though the first screen only
// needs a small prefix. Keep ordinary documents on the existing synchronous
// path and progressively mount larger documents after the first paint.
export const PROGRESSIVE_RENDER_THRESHOLD = 200;
export const PROGRESSIVE_RENDER_INITIAL_BLOCKS = 32;
const PROGRESSIVE_RENDER_CHUNK_BUDGET_MS = 8;
const PROGRESSIVE_RENDER_LINE_HEIGHT_PX = 24;

function estimateStateHeight(state: TState): number {
    if ('text' in state) {
        const text = state.text || '';
        const lines = Math.max(1, text.split('\n').length, Math.ceil(text.length / 88));

        if (state.name === 'diagram')
            return 192;
        if (state.name === 'code-block' || state.name === 'math-block')
            return Math.max(PROGRESSIVE_RENDER_LINE_HEIGHT_PX, lines * 20 + 16);

        return lines * PROGRESSIVE_RENDER_LINE_HEIGHT_PX;
    }

    if ('children' in state && Array.isArray(state.children)) {
        const childrenHeight = state.children.reduce(
            (height, child) => height + estimateStateHeight(child),
            0,
        );
        return Math.max(PROGRESSIVE_RENDER_LINE_HEIGHT_PX, childrenHeight);
    }

    return PROGRESSIVE_RENDER_LINE_HEIGHT_PX;
}

function estimateStatesHeight(states: TState[]): number {
    return states.reduce((height, state) => height + estimateStateHeight(state), 0);
}

export class ScrollPage extends Parent {
    private _blurFocus: IBlurFocus = { blur: null, focus: null };
    private _activeStatusFrames = new Set<number>();
    private _progressiveStates: TState[] | null = null;
    private _progressiveIndex = 0;
    private _progressiveFrameId: number | null = null;
    private _progressiveTimerId: ReturnType<typeof setTimeout> | null = null;
    private _progressiveSpacer: HTMLElement | null = null;
    private _progressiveRemainingHeight = 0;
    private _progressiveGeneration = 0;
    private _progressiveCompletion: Promise<void> | null = null;
    private _resolveProgressiveCompletion: (() => void) | null = null;

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

    static create(muya: Muya, state: TState[]) {
        const scrollPage = new ScrollPage(muya);
        scrollPage._mountState(state);

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

    private _createBlocks(state: TState[]): Parent[] {
        return state.map((block) => {
            return ScrollPage.loadBlock(block.name).create(this.muya, block);
        });
    }

    private _mountBlocks(state: TState[], beforeSpacer = false): void {
        if (state.length === 0)
            return;

        const blocks = this._createBlocks(state);
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

    private _mountState(state: TState[]): void {
        if (state.length <= PROGRESSIVE_RENDER_THRESHOLD) {
            this._mountBlocks(state);
            return;
        }

        this._progressiveStates = state;
        this._progressiveIndex = Math.min(PROGRESSIVE_RENDER_INITIAL_BLOCKS, state.length);
        this._progressiveRemainingHeight = estimateStatesHeight(
            state.slice(this._progressiveIndex),
        );
        this._progressiveCompletion = new Promise((resolve) => {
            this._resolveProgressiveCompletion = resolve;
        });

        this._mountBlocks(state.slice(0, this._progressiveIndex));

        const spacer = document.createElement('div');
        spacer.className = 'mu-progressive-render-placeholder';
        spacer.setAttribute('aria-hidden', 'true');
        spacer.style.height = `${this._progressiveRemainingHeight}px`;
        spacer.style.pointerEvents = 'none';
        spacer.style.userSelect = 'none';
        this._progressiveSpacer = spacer;
        this.domNode!.appendChild(spacer);

        const generation = this._progressiveGeneration;
        // Leave two paint boundaries for the visible prefix and editor focus
        // before the first background chunk starts doing DOM work.
        this._progressiveFrameId = requestAnimationFrame(() => {
            if (generation !== this._progressiveGeneration)
                return;

            this._progressiveFrameId = requestAnimationFrame(() => {
                if (generation !== this._progressiveGeneration)
                    return;

                this._progressiveTimerId = setTimeout(() => {
                    this._progressiveTimerId = null;
                    this._renderProgressiveChunk(generation);
                }, 0);
            });
        });
    }

    private _renderProgressiveChunk(generation: number): void {
        if (generation !== this._progressiveGeneration)
            return;

        const states = this._progressiveStates;
        if (!states) {
            this._finishProgressiveRender();
            return;
        }

        const startedAt = performance.now();
        const startIndex = this._progressiveIndex;
        while (
            this._progressiveIndex < states.length
            && (this._progressiveIndex === startIndex
                || performance.now() - startedAt < PROGRESSIVE_RENDER_CHUNK_BUDGET_MS)
        ) {
            this._progressiveIndex += 1;
        }

        this._mountBlocks(
            states.slice(startIndex, this._progressiveIndex),
            true,
        );
        this._progressiveRemainingHeight = estimateStatesHeight(
            states.slice(this._progressiveIndex),
        );
        if (this._progressiveSpacer)
            this._progressiveSpacer.style.height = `${this._progressiveRemainingHeight}px`;

        if (this._progressiveIndex >= states.length) {
            this._finishProgressiveRender();
            return;
        }

        this._progressiveFrameId = requestAnimationFrame(() => {
            this._progressiveFrameId = null;
            this._renderProgressiveChunk(generation);
        });
    }

    private _finishProgressiveRender(): void {
        this._progressiveSpacer?.remove();
        this._progressiveSpacer = null;
        this._progressiveStates = null;
        this._progressiveIndex = 0;
        this._progressiveRemainingHeight = 0;

        const resolve = this._resolveProgressiveCompletion;
        this._resolveProgressiveCompletion = null;
        this._progressiveCompletion = null;
        resolve?.();
    }

    private _cancelProgressiveRender(): void {
        this._progressiveGeneration += 1;
        if (this._progressiveFrameId !== null)
            cancelAnimationFrame(this._progressiveFrameId);
        if (this._progressiveTimerId !== null)
            clearTimeout(this._progressiveTimerId);

        this._progressiveFrameId = null;
        this._progressiveTimerId = null;
        this._progressiveSpacer?.remove();
        this._progressiveSpacer = null;
        this._progressiveStates = null;
        this._progressiveIndex = 0;
        this._progressiveRemainingHeight = 0;

        const resolve = this._resolveProgressiveCompletion;
        this._resolveProgressiveCompletion = null;
        this._progressiveCompletion = null;
        resolve?.();
    }

    updateState(state: TState[], progressive = true) {
        this._cancelProgressiveRender();
        // Empty scrollPage dom
        this.empty();
        if (progressive)
            this._mountState(state);
        else
            this._mountBlocks(state);
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
            const lastChild = this.lastChild as Parent;
            const lastContentBlock = lastChild.lastContentInDescendant()!;
            const { clientY } = event;
            const lastChildDom = lastChild.domNode;
            const { bottom } = lastChildDom!.getBoundingClientRect();

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
