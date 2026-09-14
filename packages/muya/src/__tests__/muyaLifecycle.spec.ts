// @vitest-environment happy-dom

import type Parent from '../block/base/parent';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../muya';
import { getDiagramRenderCoordinator } from '../utils/diagram/coordinator';

const bootedHosts: HTMLElement[] = [];
const bootedMuya: Muya[] = [];

afterEach(() => {
    while (bootedMuya.length)
        bootedMuya.pop()!.destroy();
    while (bootedHosts.length)
        bootedHosts.pop()!.remove();
    vi.unstubAllGlobals();
});

function bootMuya(markdown: string, options: Record<string, unknown> = {}): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { markdown, ...options } as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    bootedHosts.push(muya.domNode);
    bootedMuya.push(muya);
    return muya;
}

describe('muya resource lifecycle', () => {
    it('keeps a moved block disposable until it is really removed', () => {
        const muya = bootMuya('first\n\nsecond\n');
        const scrollPage = muya.editor.scrollPage!;
        const first = scrollPage.firstChild!;

        expect(first.next).not.toBeNull();
        const dispose = vi.spyOn(first, 'dispose');

        first.insertInto(scrollPage, null);

        expect(dispose).not.toHaveBeenCalled();
        expect(first.parent).toBe(scrollPage);
        expect(scrollPage.lastChild).toBe(first);

        first.remove();
        expect(dispose).toHaveBeenCalledTimes(1);
    });

    it('propagates move semantics when a content block is detached', () => {
        const muya = bootMuya('first\n\nsecond\n');
        const scrollPage = muya.editor.scrollPage!;
        const source = scrollPage.firstChild!;

        expect(source.isParent()).toBe(true);
        const content = (source as Parent).firstContentInDescendant()!;
        const dispose = vi.spyOn(content, 'dispose');

        (source as Parent).removeChild(content, 'move');

        expect(dispose).not.toHaveBeenCalled();
        expect(content.parent).toBeNull();

        (source as Parent).insertBefore(content as unknown as Parent, null, 'api');
        expect(content.parent).toBe(source);

        content.remove('api');
        expect(dispose).toHaveBeenCalledTimes(1);
    });

    it('cancels pending JSON state work and the editor event stream on destroy', () => {
        let nextFrame = 100;
        const requestAnimationFrameMock = vi.fn(() => nextFrame++);
        const cancelAnimationFrameMock = vi.fn();
        vi.stubGlobal('requestAnimationFrame', requestAnimationFrameMock);
        vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameMock);

        const muya = bootMuya('hello\n');
        const root = muya.domNode;
        const getSelection = vi.spyOn(muya.editor.selection, 'getSelection');
        root.dispatchEvent(new Event('click'));
        expect(getSelection).toHaveBeenCalledTimes(1);
        getSelection.mockClear();

        const jsonState = muya.editor.jsonState as unknown as {
            _operationCache: unknown[];
            _rafId: number | null;
            insertOperation: (path: number[], state: never) => void;
        };
        jsonState.insertOperation([0], { name: 'paragraph', text: 'pending' } as never);
        const pendingFrame = jsonState._rafId;

        expect(pendingFrame).not.toBeNull();
        muya.destroy();

        expect(cancelAnimationFrameMock).toHaveBeenCalledWith(pendingFrame);
        expect(jsonState._rafId).toBeNull();
        expect(jsonState._operationCache).toHaveLength(0);
        root.dispatchEvent(new Event('click'));
        expect(getSelection).not.toHaveBeenCalled();
        expect(muya.eventCenter.events).toHaveLength(0);
        expect(Object.keys(muya.eventCenter.listeners)).toHaveLength(0);
    });

    it('disposes the owner diagram coordinator and stays idempotent', () => {
        const muya = bootMuya('hello\n');
        const coordinator = getDiagramRenderCoordinator(muya);

        muya.destroy();
        muya.destroy();

        expect(coordinator.disposed).toBe(true);
        expect(coordinator.cacheSize).toBe(0);
        expect(coordinator.inFlightCount).toBe(0);
        expect(muya.eventCenter.events).toHaveLength(0);
        expect(Object.keys(muya.eventCenter.listeners)).toHaveLength(0);
    });

    it('disconnects node-owned observers when a code block is destroyed', () => {
        const disconnect = vi.fn();
        class ResizeObserverDouble {
            observe = vi.fn();
            disconnect = disconnect;

            constructor(_callback: ResizeObserverCallback) {}
        }
        vi.stubGlobal('ResizeObserver', ResizeObserverDouble);

        const muya = bootMuya('```\ncode\n```\n', { codeBlockLineNumbers: true });
        let codeContent: { update: () => void } | undefined;
        muya.editor.scrollPage!.breadthFirstTraverse((node) => {
            if (node.blockName === 'codeblock.content')
                codeContent = node as unknown as { update: () => void };
        });
        codeContent!.update();

        expect(disconnect).not.toHaveBeenCalled();
        muya.destroy();
        expect(disconnect).toHaveBeenCalledTimes(1);
    });

    it('cancels pending ScrollPage active-status frames on destroy', () => {
        let nextFrame = 100;
        const requestAnimationFrameMock = vi.fn(() => nextFrame++);
        const cancelAnimationFrameMock = vi.fn();
        vi.stubGlobal('requestAnimationFrame', requestAnimationFrameMock);
        vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameMock);

        const muya = bootMuya('hello\n');
        const content = muya.editor.scrollPage!.firstContentInDescendant()!;
        muya.editor.scrollPage!.handleFocusFromContent(content);
        const pendingFrame = requestAnimationFrameMock.mock.results.at(-1)?.value;

        muya.destroy();

        expect(cancelAnimationFrameMock).toHaveBeenCalledWith(pendingFrame);
    });

    it('keeps lifecycle registries empty across a repeatable mount/destroy soak', () => {
        const counts: Array<{ domEvents: number; subscriptions: number; inFlight: number }> = [];

        for (let cycle = 0; cycle < 20; cycle++) {
            const muya = bootMuya(`cycle ${cycle}\n`);
            const coordinator = getDiagramRenderCoordinator(muya);
            muya.destroy();
            counts.push({
                domEvents: muya.eventCenter.events.length,
                subscriptions: Object.values(muya.eventCenter.listeners)
                    .reduce((total, listeners) => total + listeners.length, 0),
                inFlight: coordinator.inFlightCount,
            });
        }

        expect(counts).toHaveLength(20);
        expect(Math.max(...counts.map(count => count.domEvents))).toBe(0);
        expect(Math.max(...counts.map(count => count.subscriptions))).toBe(0);
        expect(Math.max(...counts.map(count => count.inFlight))).toBe(0);
    });
});
