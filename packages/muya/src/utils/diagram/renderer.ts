import type { IDiagramMeta } from '../../state/types';
import loadRenderer from './index';
import { normalizeMermaidSource, renderMermaid } from './mermaid';

export interface IDiagramRenderOptions {
    type: IDiagramMeta['type'];
    code: string;
    target: HTMLElement;
    mermaidTheme: string;
    vegaTheme: string;
    plantumlServer?: string;
    sequenceTheme: 'hand' | 'simple';
    /** Used by live previews to discard a renderer result that became stale. */
    isCurrent?: () => boolean;
}

export interface IDiagramRenderResult {
    /** Mermaid returns SVG for the caller to commit after a stale-render check. */
    svg?: string;
    bindFunctions?: (element: HTMLElement) => void;
    /** Commit staged output after the caller has confirmed it is current. */
    commit?: () => void;
    /** Releases renderer resources while preserving already generated markup. */
    dispose: () => void;
}

interface IVegaView {
    finalize?: () => void;
}

interface IVegaEmbedResult {
    view?: IVegaView;
}

const vegaViews = new WeakMap<HTMLElement, IVegaView>();

/**
 * Normalize transport-level line endings only. Do not trim or collapse
 * whitespace: indentation and newlines are meaningful to several diagram
 * grammars, especially Mermaid directives and sequence notes.
 */
export function normalizeDiagramSource(source: string): string {
    return normalizeMermaidSource(source);
}

function disposeVegaView(target: HTMLElement) {
    const view = vegaViews.get(target);
    if (!view)
        return;

    view.finalize?.();
    vegaViews.delete(target);
}

/**
 * Add a viewBox to the two legacy SVG renderers when they expose only fixed
 * pixel dimensions. This keeps wide diagrams usable both in the editor and in
 * exported HTML instead of clipping them at the container width.
 */
export function addDiagramViewBox(target: HTMLElement): boolean {
    const svg = target.querySelector('svg');
    if (!svg || svg.getAttribute('viewBox'))
        return !!svg;

    const width = Number.parseFloat(svg.getAttribute('width') ?? '');
    const height = Number.parseFloat(svg.getAttribute('height') ?? '');
    if (width > 0 && height > 0) {
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        return true;
    }

    return false;
}

function waitForDiagramOutput(target: HTMLElement): Promise<void> {
    if (target.querySelector('svg')) {
        addDiagramViewBox(target);
        return Promise.resolve();
    }

    if (typeof MutationObserver === 'undefined')
        return Promise.resolve();

    return new Promise((resolve) => {
        let settled = false;
        let timeout: ReturnType<typeof setTimeout>;
        const observer = new MutationObserver(() => {
            if (!target.querySelector('svg'))
                return;

            addDiagramViewBox(target);
            observer.disconnect();
            clearTimeout(timeout);
            settled = true;
            resolve();
        });
        observer.observe(target, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['width', 'height'],
        });

        // Avoid retaining a detached editor/export node indefinitely if the
        // renderer never produces an SVG.
        timeout = setTimeout(() => {
            if (settled)
                return;
            observer.disconnect();
            settled = true;
            resolve();
        }, 5000);
    });
}

export function ensureDiagramViewBox(target: HTMLElement): void {
    void waitForDiagramOutput(target);
}

function createStagedDiagramResult(
    target: HTMLElement,
    stagingTarget: HTMLElement,
    isCurrent?: () => boolean,
): IDiagramRenderResult {
    let committed = false;
    let disposed = false;

    const dispose = () => {
        disposed = true;
    };

    if (isCurrent && !isCurrent())
        return { dispose: () => {} };

    return {
        commit: () => {
            if (committed || disposed)
                return;
            if (isCurrent && !isCurrent()) {
                dispose();
                return;
            }

            target.replaceChildren(...Array.from(stagingTarget.childNodes));
            committed = true;
        },
        dispose,
    };
}

/**
 * Render any diagram type through one adapter. The editor preview and HTML
 * export both use this function so parsing, source handling, sizing, and
 * cleanup cannot drift apart.
 */
export async function renderDiagram(
    options: IDiagramRenderOptions,
): Promise<IDiagramRenderResult> {
    const {
        type,
        code,
        target,
        mermaidTheme,
        vegaTheme,
        plantumlServer,
        sequenceTheme,
    } = options;
    const source = normalizeDiagramSource(code);

    if (type === 'mermaid') {
        const result = await renderMermaid(source, mermaidTheme);
        return {
            ...result,
            dispose: () => {},
        };
    }

    const renderer = await loadRenderer(type);
    const stagingTarget = document.createElement('div');

    if (type === 'vega-lite') {
        // Render into a detached node. Vega-embed is asynchronous; rendering
        // directly into the live target lets an older edit overwrite a newer
        // chart when promises resolve out of order.
        const result = await renderer(
            stagingTarget,
            JSON.parse(source),
            {
                actions: false,
                tooltip: false,
                renderer: 'svg',
                theme: vegaTheme,
                // Parse expressions as an AST so the renderer does not need
                // `unsafe-eval` in the Electron CSP.
                ast: true,
            },
        ) as IVegaEmbedResult | undefined;
        const view = result?.view;
        let committed = false;
        let disposed = false;

        const dispose = () => {
            if (disposed)
                return;
            disposed = true;

            if (committed) {
                if (vegaViews.get(target) === view)
                    disposeVegaView(target);
            }
            else {
                view?.finalize?.();
            }
        };

        if (options.isCurrent && !options.isCurrent()) {
            dispose();
            return { dispose: () => {} };
        }

        return {
            commit: () => {
                if (committed || disposed)
                    return;
                if (options.isCurrent && !options.isCurrent()) {
                    dispose();
                    return;
                }

                disposeVegaView(target);
                target.replaceChildren(...Array.from(stagingTarget.childNodes));
                if (view)
                    vegaViews.set(target, view);
                committed = true;
            },
            dispose,
        };
    }

    if (type === 'plantuml') {
        const diagram = renderer.parse(source, plantumlServer);
        diagram.insertImgElement(stagingTarget);
        return createStagedDiagramResult(target, stagingTarget, options.isCurrent);
    }

    if (type === 'flowchart' || type === 'sequence') {
        const diagram = renderer.parse(source);
        diagram.drawSVG(stagingTarget, type === 'sequence' ? { theme: sequenceTheme } : {});
        await waitForDiagramOutput(stagingTarget);
        return createStagedDiagramResult(target, stagingTarget, options.isCurrent);
    }

    throw new Error(`Unknown diagram name ${type}`);
}

export function disposeDiagram(target: HTMLElement): void {
    disposeVegaView(target);
}
