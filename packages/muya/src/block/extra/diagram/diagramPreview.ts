import type { Subscription } from 'rxjs';
import type { Muya } from '../../../muya';
import type { IDiagramMeta, IDiagramState, TState } from '../../../state/types';
import { fromEvent } from 'rxjs';
import { CLASS_NAMES, PREVIEW_DOMPURIFY_CONFIG } from '../../../config';
import { sanitize } from '../../../utils';
import { renderDiagram } from '../../../utils/diagram/renderer';
import logger from '../../../utils/logger';
import Parent from '../../base/parent';

const debug = logger('diagramPreview:');
export const DIAGRAM_RENDER_DEBOUNCE_MS = 200;

type DiagramPresentationMode = 'source' | 'preview' | 'error';

const DIAGRAM_PRESENTATION_CLASSES = {
    source: 'mu-diagram-editing',
    preview: 'mu-diagram-preview-only',
    error: 'mu-diagram-error-state',
} as const;

class DiagramPreview extends Parent {
    private _code: string;
    private _type: IDiagramMeta['type'];
    private _presentationMode: DiagramPresentationMode = 'source';
    private _renderGeneration = 0;
    private _renderTimer: ReturnType<typeof setTimeout> | null = null;
    private _renderWaiters = new Map<number, () => void>();
    private _hasRenderedResult = false;
    private _lastValidatedCode: string | null = null;
    private _disposed = false;
    private _disposeDiagram: (() => void) | null = null;
    private _clickSubscription: Subscription | null = null;
    static override blockName = 'diagram-preview';

    static create(muya: Muya, state: IDiagramState) {
        const diagramPreview = new DiagramPreview(muya, state);

        return diagramPreview;
    }

    override get path() {
        debug.warn('You can never call `get path` in diagramPreview');
        return [];
    }

    constructor(muya: Muya, { text, meta }: IDiagramState) {
        super(muya);
        this.tagName = 'div';
        this._code = text;
        this._type = meta.type;
        this.classList = ['mu-diagram-preview'];
        this.attributes = {
            spellcheck: 'false',
            contenteditable: 'false',
        };
        this.createDomNode();
        this._attachDOMEvents();
        this.update();
    }

    override getState(): TState {
        debug.warn('You can never call `getState` in diagramPreview');
        return {} as TState;
    }

    private _attachDOMEvents() {
        const clickObservable = fromEvent(this.domNode!, 'click');
        this._clickSubscription = clickObservable.subscribe(this.clickHandler.bind(this));
    }

    /**
     * Switch the diagram back to its source editor. This is intentionally
     * public because DiagramBlock also uses it when focus enters the block.
     */
    showSource() {
        this._setPresentationMode('source');
    }

    /**
     * Reveal a prepared diagram after its source editor loses focus. Rendering
     * and presentation are deliberately separate: a debounce may validate and
     * stage a result while the user is still thinking in the source, but it
     * must not take the editor away from them.
     */
    showPreviewOnBlur(): Promise<void> {
        if (this._disposed || this.parent?.active === true)
            return Promise.resolve();

        if (this._lastValidatedCode === this._code) {
            if (this._hasRenderedResult)
                this._setPresentationMode('preview');

            return Promise.resolve();
        }

        return this._renderImmediately();
    }

    private _setPresentationMode(mode: DiagramPresentationMode) {
        this._presentationMode = mode;
        this.domNode?.setAttribute('data-diagram-mode', mode);

        const parentNode = this.parent?.domNode;
        if (!parentNode)
            return;

        Object.entries(DIAGRAM_PRESENTATION_CLASSES).forEach(([name, className]) => {
            parentNode.classList.toggle(className, name === mode);
        });
        parentNode.setAttribute('data-diagram-mode', mode);
    }

    clickHandler(event: Event) {
        event.preventDefault();
        event.stopPropagation();

        this.showSource();

        if (this.parent == null)
            return;

        // The diagram container starts with its language input, so clicking a
        // settled preview must enter the source editor rather than the type
        // field. Keep the fallback for lightweight legacy test/mount hosts.
        const cursorBlock = this.parent.lastContentInDescendant?.()
            ?? this.parent.firstContentInDescendant();
        cursorBlock?.setCursor(0, 0);
    }

    private _resolveRenderWaiter(generation: number) {
        const resolve = this._renderWaiters.get(generation);
        if (!resolve)
            return;

        this._renderWaiters.delete(generation);
        resolve();
    }

    private _cancelOlderRenderWaiters(generation: number) {
        for (const [pendingGeneration, resolve] of this._renderWaiters) {
            if (pendingGeneration >= generation)
                continue;

            this._renderWaiters.delete(pendingGeneration);
            resolve();
        }
    }

    private async _render(code: string, generation: number) {
        const { i18n } = this.muya;
        if (this._disposed || generation !== this._renderGeneration)
            return;

        if (!code) {
            this._hasRenderedResult = false;
            this._lastValidatedCode = code;
            this.domNode!.removeAttribute('data-diagram-error');
            this.domNode!.innerHTML = `<div class="${CLASS_NAMES.MU_EMPTY}">&lt; ${i18n.t(
                'Empty Diagram',
            )} &gt;</div>`;
            this._setPresentationMode('source');
            return;
        }

        // Keep the last successful frame while a new render is being
        // calculated. This avoids flicker and makes transient parser errors
        // during typing harmless to the editing experience.
        this.domNode!.removeAttribute('data-diagram-error');
        if (!this._hasRenderedResult)
            this.domNode!.innerHTML = i18n.t('Loading...');

        const { mermaidTheme, vegaTheme, plantumlServer, sequenceTheme } = this.muya.options;
        const { _type: type } = this;

        try {
            const result = await renderDiagram({
                target: this.domNode!,
                code,
                type,
                mermaidTheme,
                vegaTheme,
                plantumlServer,
                sequenceTheme,
                isCurrent: () => !this._disposed && generation === this._renderGeneration,
            });

            if (this._disposed || generation !== this._renderGeneration) {
                result.dispose();
                return;
            }

            if (type === 'mermaid') {
                const { svg, bindFunctions } = result;
                this.domNode!.innerHTML = svg ?? '';
                bindFunctions?.(this.domNode!);
            }
            else {
                result.commit?.();
            }

            this._disposeDiagram = result.dispose;
            this._hasRenderedResult = true;
            this._lastValidatedCode = code;
            this.domNode!.removeAttribute('data-diagram-error');
            // A successful background validation must not steal focus from a
            // diagram source that is still being edited. The active block's
            // blur transition will reveal this prepared result later.
            if (this.parent?.active !== true)
                this._setPresentationMode('preview');
            else
                this._setPresentationMode('source');
        }
        catch (error) {
            if (this._disposed || generation !== this._renderGeneration)
                return;

            const detail
                = error instanceof Error ? error.message : String(error);
            debug.error(`render ${type} diagram failed: ${detail}`);
            // Syntax errors are an editing state in Typora: keep the source
            // visible and put the diagnostic next to it. Do not leave the
            // previous SVG below the source, which makes the document appear
            // to contain two versions of the same diagram.
            this._hasRenderedResult = false;
            this._lastValidatedCode = code;
            this._disposeDiagram?.();
            this._disposeDiagram = null;
            this.domNode!.setAttribute('data-diagram-error', detail);
            this.domNode!.innerHTML = `<div class="mu-diagram-error">&lt; ${i18n.t(
                'Invalid Diagram Code',
            )} &gt;<div class="mu-diagram-error-detail">${sanitize(
                detail,
                PREVIEW_DOMPURIFY_CONFIG,
                true,
            )}</div></div>`;
            this._setPresentationMode('error');
        }
    }

    private _prepareRender(code: string): number {
        const generation = ++this._renderGeneration;
        this._code = code;

        if (this._renderTimer !== null)
            clearTimeout(this._renderTimer);
        this._renderTimer = null;
        this._disposeDiagram?.();
        this._disposeDiagram = null;
        this._cancelOlderRenderWaiters(generation);

        return generation;
    }

    private _renderImmediately(): Promise<void> {
        if (this._disposed)
            return Promise.resolve();

        const generation = this._prepareRender(this._code);

        return new Promise((resolve) => {
            this._renderWaiters.set(generation, resolve);
            void this._render(this._code, generation)
                .catch((error) => {
                    debug.error(`render ${this._type} diagram crashed`, error);
                })
                .finally(() => {
                    this._resolveRenderWaiter(generation);
                });
        });
    }

    /** Schedule a debounced background validation for the latest source. */
    scheduleRender(code = this._code): Promise<void> {
        if (this._disposed)
            return Promise.resolve();

        const sourceChanged = code !== this._code;
        const generation = this._prepareRender(code);

        // A changed source is always shown while it is being edited. A
        // same-source redraw (for example a theme refresh) keeps the current
        // preview mode to avoid an unnecessary source/preview flash.
        if (sourceChanged || !this._hasRenderedResult || this._presentationMode === 'error')
            this.showSource();

        return new Promise((resolve) => {
            this._renderWaiters.set(generation, resolve);
            this._renderTimer = setTimeout(() => {
                this._renderTimer = null;
                void this._render(code, generation)
                    .catch((error) => {
                        debug.error(`render ${this._type} diagram crashed`, error);
                    })
                    .finally(() => {
                        this._resolveRenderWaiter(generation);
                    });
            }, DIAGRAM_RENDER_DEBOUNCE_MS);
        });
    }

    update(code = this._code) {
        return this.scheduleRender(code);
    }

    /** Release timers, subscriptions, and renderer resources on block removal. */
    dispose() {
        if (this._disposed)
            return;

        this._disposed = true;
        this._renderGeneration++;
        if (this._renderTimer !== null)
            clearTimeout(this._renderTimer);
        this._renderTimer = null;
        this._disposeDiagram?.();
        this._disposeDiagram = null;
        this._clickSubscription?.unsubscribe();
        this._clickSubscription = null;

        for (const resolve of this._renderWaiters.values())
            resolve();
        this._renderWaiters.clear();
    }

    override remove(source = 'user') {
        this.dispose();
        super.remove(source);

        return this;
    }
}

export default DiagramPreview;
