// @vitest-environment happy-dom
import type { IDiagramRenderOptions, IDiagramRenderResult } from '../renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    createDiagramRenderCacheKey,
    DEFAULT_DIAGRAM_RENDER_CONCURRENCY,
    DiagramRenderCoordinator,
} from '../coordinator';

function options(
    code = 'graph TD\n  A --> B',
    overrides: Partial<Omit<IDiagramRenderOptions, 'target' | 'isCurrent'>> = {},
) {
    return {
        type: 'mermaid' as const,
        code,
        mermaidTheme: 'default',
        vegaTheme: 'latimes',
        plantumlServer: 'https://plantuml.example',
        sequenceTheme: 'hand' as const,
        ...overrides,
    };
}

function result(svg = '<svg data-rendered="diagram"></svg>'): IDiagramRenderResult {
    return {
        svg,
        dispose: vi.fn(),
    };
}

function target() {
    return document.createElement('div');
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('createDiagramRenderCacheKey', () => {
    it('uses normalized source, diagram type, renderer config, and theme inputs', () => {
        const base = options('graph TD\r\n  A --> B');
        const same = options('graph TD\n  A --> B');

        expect(createDiagramRenderCacheKey(base)).toBe(
            createDiagramRenderCacheKey(same),
        );
        expect(createDiagramRenderCacheKey(base)).not.toBe(
            createDiagramRenderCacheKey(options(base.code, { type: 'sequence' })),
        );
        expect(createDiagramRenderCacheKey(base)).not.toBe(
            createDiagramRenderCacheKey(options(base.code, { mermaidTheme: 'dark' })),
        );
        expect(createDiagramRenderCacheKey(base)).not.toBe(
            createDiagramRenderCacheKey(options(base.code, { vegaTheme: 'dark' })),
        );
        expect(createDiagramRenderCacheKey(base)).not.toBe(
            createDiagramRenderCacheKey(options(base.code, {
                plantumlServer: 'https://another.example',
            })),
        );
        expect(createDiagramRenderCacheKey(base)).not.toBe(
            createDiagramRenderCacheKey(options(base.code, { sequenceTheme: 'simple' })),
        );
        expect(createDiagramRenderCacheKey(base)).not.toBe(
            createDiagramRenderCacheKey(options('graph TD\n  A --> C')),
        );
    });
});

describe('diagram render coordinator', () => {
    it('uses the documented bounded default concurrency', () => {
        expect(DEFAULT_DIAGRAM_RENDER_CONCURRENCY).toBe(2);
    });

    it('deduplicates in-flight work and reuses a completed cache entry', async () => {
        const render = vi.fn(async () => result());
        const coordinator = new DiagramRenderCoordinator({ render });
        const firstTarget = target();
        const secondTarget = target();

        const first = coordinator.schedule({
            blockId: 'block-a',
            generation: 1,
            target: firstTarget,
            options: options(),
        });
        const second = coordinator.schedule({
            blockId: 'block-b',
            generation: 1,
            target: secondTarget,
            options: options(),
        });

        await expect(first.promise).resolves.toMatchObject({
            status: 'success',
            fromCache: false,
        });
        await expect(second.promise).resolves.toMatchObject({
            status: 'success',
            fromCache: false,
        });
        expect(render).toHaveBeenCalledTimes(1);
        expect(firstTarget.innerHTML).toContain('data-rendered="diagram"');
        expect(secondTarget.innerHTML).toContain('data-rendered="diagram"');

        const cachedTarget = target();
        const cached = coordinator.schedule({
            blockId: 'block-c',
            generation: 1,
            target: cachedTarget,
            options: options(),
        });

        await expect(cached.promise).resolves.toMatchObject({
            status: 'success',
            fromCache: true,
        });
        expect(render).toHaveBeenCalledTimes(1);
        expect(cachedTarget.innerHTML).toContain('data-rendered="diagram"');
        coordinator.dispose();
    });

    it('gives each cached SVG mount unique IDs while preserving bind callbacks', async () => {
        const idsSeenDuringBind: string[] = [];
        const bindFunctions = vi.fn((element: HTMLElement) => {
            idsSeenDuringBind.push(element.querySelector('svg')?.id ?? '');
        });
        const render = vi.fn(async () => ({
            svg: '<svg id="diagram"><defs><clipPath id="clip"><rect /></clipPath></defs><rect clip-path="url(#clip)" /></svg>',
            bindFunctions,
            dispose: vi.fn(),
        }));
        const coordinator = new DiagramRenderCoordinator({ render });
        const firstTarget = target();
        const secondTarget = target();

        const first = coordinator.schedule({
            blockId: 'svg-a',
            generation: 1,
            target: firstTarget,
            options: options(),
        });
        const second = coordinator.schedule({
            blockId: 'svg-b',
            generation: 1,
            target: secondTarget,
            options: options(),
        });
        await Promise.all([first.promise, second.promise]);

        const firstSvg = firstTarget.querySelector('svg')!;
        const secondSvg = secondTarget.querySelector('svg')!;
        expect(render).toHaveBeenCalledTimes(1);
        expect(bindFunctions).toHaveBeenCalledTimes(2);
        expect(idsSeenDuringBind).toEqual(['diagram', 'diagram']);
        expect(firstSvg.id).not.toBe(secondSvg.id);
        expect(Array.from(firstSvg.querySelectorAll('rect')).at(-1)?.getAttribute('clip-path'))
            .toBe(`url(#${firstSvg.querySelector('clipPath')!.id})`);
        expect(Array.from(secondSvg.querySelectorAll('rect')).at(-1)?.getAttribute('clip-path'))
            .toBe(`url(#${secondSvg.querySelector('clipPath')!.id})`);
        coordinator.dispose();
    });

    it('rewrites Mermaid CSS selectors without changing hex colors or url references', async () => {
        const render = vi.fn(async () => result(
            '<div id="diagram" data-diagram-root="true"><style>'
            + '#diagram .node, #fff .child { fill: #fff; stroke: #ffffff; } '
            + '.edge { marker-end: url(#marker); }'
            + '</style><div id="marker"><div /></div>'
            + '<div id="fff"><div class="child" /></div></div>',
        ));
        const coordinator = new DiagramRenderCoordinator({ render });
        const renderTarget = target();

        await coordinator.schedule({
            blockId: 'css-selector-remap',
            generation: 1,
            target: renderTarget,
            options: options(),
        }).promise;

        const svg = renderTarget.querySelector('[data-diagram-root="true"]')!;
        const style = renderTarget.querySelector('style')!.textContent!;
        const mountedColorId = renderTarget.querySelector('[id^="fff-muya-"]')!.id;
        const mountedMarkerId = renderTarget.querySelector('[id^="marker-muya-"]')!.id;

        expect(style).toContain(`#${svg.id} .node`);
        expect(style).toContain(`#${mountedColorId} .child`);
        expect(style).not.toContain('#diagram .node');
        expect(style).not.toContain('#fff .child');
        expect(style).toContain('fill: #fff');
        expect(style).toContain('stroke: #ffffff');
        expect(style).toContain(`url(#${mountedMarkerId})`);
        coordinator.dispose();
    });

    it('never runs more than two CPU-heavy renders at once by default', async () => {
        let running = 0;
        let maximumRunning = 0;
        const pending: Array<{
            resolve: (value: IDiagramRenderResult) => void;
        }> = [];
        const render = vi.fn(() => new Promise<IDiagramRenderResult>((resolve) => {
            running++;
            maximumRunning = Math.max(maximumRunning, running);
            pending.push({ resolve });
        }));
        const coordinator = new DiagramRenderCoordinator({ render });
        const handles = Array.from({ length: 5 }, (_, index) => coordinator.schedule({
            blockId: `block-${index}`,
            generation: 1,
            target: target(),
            options: options(`graph TD\n  A --> ${index}`),
        }));

        await vi.waitFor(() => {
            expect(render).toHaveBeenCalledTimes(2);
        });
        expect(running).toBe(2);

        let completed = 0;
        while (completed < handles.length) {
            await vi.waitFor(() => expect(pending.length).toBeGreaterThan(0));
            const current = pending.shift();
            expect(current).toBeDefined();
            current!.resolve(result(`<svg data-index="${completed}"></svg>`));
            running--;
            completed++;
        }

        await expect(Promise.all(handles.map(handle => handle.promise))).resolves.toHaveLength(5);
        expect(maximumRunning).toBe(2);
        expect(render).toHaveBeenCalledTimes(5);
        coordinator.dispose();
    });

    it('settles an already-stale queued request without invoking the engine', async () => {
        const render = vi.fn(async () => result());
        const coordinator = new DiagramRenderCoordinator({ render });
        const outcome = await coordinator.schedule({
            blockId: 'already-stale',
            generation: 1,
            target: target(),
            options: options(),
            isCurrent: () => false,
        }).promise;

        expect(outcome.status).toBe('cancelled');
        expect(render).not.toHaveBeenCalled();
        coordinator.dispose();
    });

    it('replays staged non-Mermaid output and disposes the temporary engine view', async () => {
        const dispose = vi.fn();
        const render = vi.fn(async ({ target: stagingTarget }: IDiagramRenderOptions) => ({
            commit: () => {
                stagingTarget.innerHTML = '<svg data-rendered="staged"></svg>';
            },
            dispose,
        }));
        const coordinator = new DiagramRenderCoordinator({ render });
        const renderTarget = target();

        const outcome = await coordinator.schedule({
            blockId: 'staged-block',
            generation: 1,
            target: renderTarget,
            options: options('{}', { type: 'vega-lite' }),
        }).promise;

        expect(outcome.status).toBe('success');
        expect(renderTarget.querySelector('[data-rendered="staged"]')).not.toBeNull();
        expect(dispose).toHaveBeenCalledTimes(1);
        coordinator.dispose();
    });

    it('cancels the older generation of the same block and prevents stale writeback', async () => {
        const pending: Array<{
            resolve: (value: IDiagramRenderResult) => void;
        }> = [];
        const render = vi.fn(() => new Promise<IDiagramRenderResult>((resolve) => {
            pending.push({ resolve });
        }));
        const coordinator = new DiagramRenderCoordinator({
            maxConcurrent: 1,
            render,
        });
        const staleTarget = target();
        const currentTarget = target();

        const stale = coordinator.schedule({
            blockId: 'same-block',
            generation: 1,
            target: staleTarget,
            options: options('graph TD\n  A --> stale'),
        });
        await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));

        const current = coordinator.schedule({
            blockId: 'same-block',
            generation: 2,
            target: currentTarget,
            options: options('graph TD\n  A --> current'),
        });
        await expect(stale.promise).resolves.toMatchObject({ status: 'cancelled' });

        pending.shift()!.resolve(result('<svg data-rendered="stale"></svg>'));
        await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(2));
        expect(staleTarget.innerHTML).toBe('');

        pending.shift()!.resolve(result('<svg data-rendered="current"></svg>'));
        await expect(current.promise).resolves.toMatchObject({ status: 'success' });
        expect(currentTarget.innerHTML).toContain('data-rendered="current"');
        expect(staleTarget.innerHTML).not.toContain('stale');
        coordinator.dispose();
    });

    it('treats cancel and dispose as terminal guards against late results', async () => {
        let resolveRender!: (value: IDiagramRenderResult) => void;
        const render = vi.fn(() => new Promise<IDiagramRenderResult>((resolve) => {
            resolveRender = resolve;
        }));
        const coordinator = new DiagramRenderCoordinator({ render });
        const renderTarget = target();
        const handle = coordinator.schedule({
            blockId: 'disposed-block',
            generation: 1,
            target: renderTarget,
            options: options(),
        });

        await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
        handle.dispose();
        resolveRender(result('<svg data-rendered="late"></svg>'));

        await expect(handle.promise).resolves.toMatchObject({ status: 'cancelled' });
        expect(renderTarget.innerHTML).toBe('');
        coordinator.dispose();
    });

    it('converts an engine rejection into a renderable error outcome', async () => {
        const render = vi.fn(async () => {
            throw new Error('mermaid engine failed');
        });
        const coordinator = new DiagramRenderCoordinator({ render });
        const outcome = await coordinator.schedule({
            blockId: 'error-block',
            generation: 1,
            target: target(),
            options: options(),
        }).promise;

        expect(outcome.status).toBe('error');
        if (outcome.status === 'error')
            expect(outcome.error.message).toBe('mermaid engine failed');
        coordinator.dispose();
    });
});
