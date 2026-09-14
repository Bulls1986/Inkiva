// @vitest-environment happy-dom

import type Parent from '../block/base/parent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../muya';
import { getDiagramRenderCoordinator } from '../utils/diagram/coordinator';

const renderDiagramMock = vi.fn();
vi.mock('../utils/diagram/renderer', () => ({
    disposeDiagram: (target: HTMLElement) => target.replaceChildren(),
    normalizeDiagramSource: (source: string) => source.replace(/\r\n?/g, '\n'),
    renderDiagram: (...args: unknown[]) => renderDiagramMock(...args),
}));

const bootedHosts: HTMLElement[] = [];

beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('IntersectionObserver', undefined);
    const host = document.createElement('div');
    document.body.appendChild(host);
    bootedHosts.push(host);
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    renderDiagramMock.mockReset();
    while (bootedHosts.length)
        bootedHosts.pop()!.remove();
});

describe('muya diagram disposal', () => {
    it('keeps a diagram preview alive across a block move and disposes it once on removal', () => {
        const host = bootedHosts[0];
        const muya = new Muya(host, {
            markdown: '```mermaid\ngraph TD\n  A --> B\n```\n\nparagraph\n',
        } as ConstructorParameters<typeof Muya>[1]);
        muya.init();

        const scrollPage = muya.editor.scrollPage!;
        const diagramBlock = scrollPage.firstChild!;
        const preview = (diagramBlock as Parent).attachments.head!;
        const dispose = vi.spyOn(preview, 'dispose');

        diagramBlock.insertInto(scrollPage, null);

        expect(dispose).not.toHaveBeenCalled();
        expect(diagramBlock.parent).toBe(scrollPage);

        diagramBlock.remove('api');
        expect(dispose).toHaveBeenCalledTimes(1);

        muya.destroy();
        expect(dispose).toHaveBeenCalledTimes(1);
    });

    it('cancels a diagram preview timer when the editor is destroyed', async () => {
        const host = bootedHosts[0];
        const muya = new Muya(host, {
            markdown: '```mermaid\ngraph TD\n  A --> B\n```\n',
        } as ConstructorParameters<typeof Muya>[1]);
        muya.init();

        muya.destroy();
        await vi.advanceTimersByTimeAsync(200);

        expect(renderDiagramMock).not.toHaveBeenCalled();
    });

    it('rejects a late renderer result after editor disposal without writing to the old block', async () => {
        let resolveRender!: (result: { svg: string; dispose: () => void }) => void;
        renderDiagramMock.mockReturnValue(new Promise((resolve) => {
            resolveRender = resolve;
        }));

        const host = bootedHosts[0];
        const muya = new Muya(host, {
            markdown: '```mermaid\ngraph TD\n  A --> B\n```\n',
        } as ConstructorParameters<typeof Muya>[1]);
        muya.init();
        const preview = muya.domNode.querySelector('.mu-diagram-preview') as HTMLElement;

        await vi.advanceTimersByTimeAsync(200);
        expect(renderDiagramMock).toHaveBeenCalledTimes(1);

        const dispose = vi.fn();
        muya.destroy();
        resolveRender({ svg: '<svg data-late-render="true"></svg>', dispose });
        await Promise.resolve();
        await Promise.resolve();

        expect(dispose).toHaveBeenCalledTimes(1);
        expect(preview.querySelector('[data-late-render="true"]')).toBeNull();
    });

    it('disposes an in-flight preview when a document is replaced', async () => {
        let resolveRender!: (result: { svg: string; dispose: () => void }) => void;
        renderDiagramMock.mockReturnValue(new Promise((resolve) => {
            resolveRender = resolve;
        }));

        const host = bootedHosts[0];
        const muya = new Muya(host, {
            markdown: '```mermaid\ngraph TD\n  A --> B\n```\n',
        } as ConstructorParameters<typeof Muya>[1]);
        muya.init();
        const preview = muya.domNode.querySelector('.mu-diagram-preview') as HTMLElement;

        await vi.advanceTimersByTimeAsync(200);
        expect(renderDiagramMock).toHaveBeenCalledTimes(1);

        const dispose = vi.fn();
        muya.editor.setContent('replacement paragraph');
        resolveRender({ svg: '<svg data-late-document-render="true"></svg>', dispose });
        await Promise.resolve();
        await Promise.resolve();

        expect(dispose).toHaveBeenCalledTimes(1);
        expect(preview.querySelector('[data-late-document-render="true"]')).toBeNull();
        muya.destroy();
    });
    it('closes the owner coordinator when Muya is destroyed', async () => {
        const host = bootedHosts[0];
        const muya = new Muya(host, {
            markdown: 'plain paragraph\n',
        } as ConstructorParameters<typeof Muya>[1]);
        muya.init();
        const coordinator = getDiagramRenderCoordinator(muya);

        muya.destroy();
        const handle = coordinator.schedule({
            blockId: 'after-destroy',
            generation: 1,
            target: document.createElement('div'),
            options: {
                type: 'mermaid',
                code: 'graph TD\n  A --> B',
                mermaidTheme: 'default',
                vegaTheme: 'default',
                sequenceTheme: 'hand',
            },
        });

        await expect(handle.promise).resolves.toMatchObject({ status: 'cancelled' });
        expect(renderDiagramMock).not.toHaveBeenCalled();
    });
});
