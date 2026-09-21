// @vitest-environment happy-dom

import type Content from '../../base/content';
import type Parent from '../../base/parent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../../muya';
import { PROGRESSIVE_RENDER_THRESHOLD } from '../index';

const VIRTUAL_RENDERER_FLAG = '__INKIVA_VIRTUAL_RENDERER_PROTOTYPE__';
const mountedEditors: Muya[] = [];

interface IPrototypeSnapshot {
    enabled: boolean;
    totalBlocks: number;
    mountedBlocks: number;
    windowStart: number;
    windowEnd: number;
    beforeHeight: number;
    afterHeight: number;
    totalEstimatedHeight: number;
}

interface IPrototypeScrollPage {
    getVirtualizationPrototypeSnapshot: () => IPrototypeSnapshot;
    updateVirtualWindowForViewport: (scrollTop: number, viewportHeight: number) => void;
}

function paragraphs(count: number, needleIndex = -1, prefix = 'paragraph'): string {
    return `${Array.from({ length: count }, (_, index) => {
        const suffix = index === needleIndex ? ' needle-target' : '';
        return `${prefix} ${index}${suffix}`;
    }).join('\n\n')}\n`;
}

function prototype(scrollPage: unknown): IPrototypeScrollPage {
    return scrollPage as IPrototypeScrollPage;
}

function topLevelBlock(muya: Muya, index: number): Parent {
    return muya.editor.scrollPage!.find(index) as Parent;
}

function contentAt(muya: Muya, index: number): Content {
    return topLevelBlock(muya, index).firstContentInDescendant() as Content;
}

beforeEach(() => {
    (globalThis as Record<string, unknown>)[VIRTUAL_RENDERER_FLAG] = true;
});

afterEach(() => {
    delete (globalThis as Record<string, unknown>)[VIRTUAL_RENDERER_FLAG];
    while (mountedEditors.length) {
        const muya = mountedEditors.pop()!;
        muya.destroy();
        muya.domNode.remove();
    }
    document.getSelection()?.removeAllRanges();
});

describe('stage C0 top-level virtualization prototype', () => {
    it('keeps the full logical block tree while bounding mounted top-level DOM and preserving scroll geometry', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const totalBlocks = PROGRESSIVE_RENDER_THRESHOLD + 120;
        const muya = new Muya(host, { markdown: paragraphs(totalBlocks) });
        mountedEditors.push(muya);

        muya.init();
        await muya.whenRenderComplete();

        const scrollPage = muya.editor.scrollPage!;
        const api = prototype(scrollPage);
        const initial = api.getVirtualizationPrototypeSnapshot();

        expect(scrollPage.children.length).toBe(totalBlocks);
        expect(initial.enabled).toBe(true);
        expect(initial.totalBlocks).toBe(totalBlocks);
        expect(initial.mountedBlocks).toBeGreaterThan(0);
        expect(initial.mountedBlocks).toBeLessThan(totalBlocks);
        expect(scrollPage.domNode!.querySelectorAll('.mu-paragraph')).toHaveLength(
            initial.mountedBlocks,
        );

        muya.editor.activeContentBlock = null;
        muya.editor.selection.clear();
        const totalHeight = initial.totalEstimatedHeight;
        api.updateVirtualWindowForViewport(totalHeight / 2, 600);
        const middle = api.getVirtualizationPrototypeSnapshot();
        expect(middle.windowStart).toBeGreaterThan(0);
        expect(middle.mountedBlocks).toBeLessThan(totalBlocks);
        expect(middle.totalEstimatedHeight).toBe(totalHeight);
        expect(middle.beforeHeight + middle.afterHeight).toBeGreaterThan(0);

        api.updateVirtualWindowForViewport(totalHeight, 600);
        const bottom = api.getVirtualizationPrototypeSnapshot();
        expect(bottom.windowEnd).toBe(totalBlocks);
        expect(bottom.totalEstimatedHeight).toBe(totalHeight);

        api.updateVirtualWindowForViewport(0, 600);
        const restoredTop = api.getVirtualizationPrototypeSnapshot();
        expect(restoredTop.windowStart).toBe(0);
        expect(restoredTop.totalEstimatedHeight).toBe(totalHeight);
        expect(restoredTop.beforeHeight).toBe(0);
    });

    it('bounds virtual window disposal work by the previously mounted segments instead of total blocks', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const totalBlocks = PROGRESSIVE_RENDER_THRESHOLD + 600;
        const muya = new Muya(host, { markdown: paragraphs(totalBlocks) });
        mountedEditors.push(muya);

        muya.init();
        await muya.whenRenderComplete();

        const scrollPage = muya.editor.scrollPage!;
        const api = prototype(scrollPage);
        const initial = api.getVirtualizationPrototypeSnapshot();
        muya.editor.activeContentBlock = null;
        muya.editor.selection.clear();

        let dematerializeCalls = 0;
        for (let index = 0; index < totalBlocks; index += 1) {
            const block = topLevelBlock(muya, index);
            const original = block.dematerializeDomTree.bind(block);
            vi.spyOn(block, 'dematerializeDomTree').mockImplementation(() => {
                dematerializeCalls += 1;
                return original();
            });
        }

        api.updateVirtualWindowForViewport(initial.totalEstimatedHeight / 2, 600);

        expect(dematerializeCalls).toBeLessThanOrEqual(initial.mountedSegments * initial.segmentSize);
        expect(api.getVirtualizationPrototypeSnapshot().mountedBlocks).toBeLessThan(totalBlocks / 2);
    });

    it('expands the render window for cross-block selection and Ctrl+A instead of truncating logical selection', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const totalBlocks = PROGRESSIVE_RENDER_THRESHOLD + 80;
        const muya = new Muya(host, { markdown: paragraphs(totalBlocks) });
        mountedEditors.push(muya);

        muya.init();
        await muya.whenRenderComplete();

        const first = contentAt(muya, 0);
        const far = contentAt(muya, PROGRESSIVE_RENDER_THRESHOLD + 20);
        muya.editor.selection.setSelection(
            { offset: 0, block: first, path: first.path },
            { offset: far.text.length, block: far, path: far.path },
        );

        expect(first.outMostBlock!.domNode!.isConnected).toBe(true);
        expect(far.outMostBlock!.domNode!.isConnected).toBe(true);
        expect(muya.editor.selection.anchorBlock).toBe(first);
        expect(muya.editor.selection.focusBlock).toBe(far);

        muya.selectAll();
        const last = contentAt(muya, totalBlocks - 1);
        expect(last.outMostBlock!.domNode!.isConnected).toBe(true);
        expect(muya.editor.selection.anchorBlock).toBe(first);
        expect(muya.editor.selection.focusBlock).toBe(last);
        const selectAllSnapshot
            = prototype(muya.editor.scrollPage!).getVirtualizationPrototypeSnapshot();
        expect(selectAllSnapshot.mountedBlocks).toBeLessThan(totalBlocks / 2);

        const copied = muya.editor.clipboard.getClipboardData().text;
        expect(copied).toContain('paragraph 0');
        expect(copied).toContain(`paragraph ${totalBlocks - 1}`);

        const active = muya.editor.selection.anchorBlock!;
        active.domNode!.focus();
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Delete',
            bubbles: true,
        }));
        muya.flush();
        expect(muya.editor.scrollPage!.length()).toBe(1);
        expect(muya.getMarkdown().trim()).toBe('');
    });

    it('uses independent spacers for viewport gaps around distant selection endpoints', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const totalBlocks = PROGRESSIVE_RENDER_THRESHOLD + 180;
        const muya = new Muya(host, { markdown: paragraphs(totalBlocks) });
        mountedEditors.push(muya);

        muya.init();
        await muya.whenRenderComplete();

        const scrollPage = muya.editor.scrollPage!;
        const api = prototype(scrollPage);
        const initial = api.getVirtualizationPrototypeSnapshot();
        const anchor = contentAt(muya, 24);
        const focus = contentAt(muya, totalBlocks - 24);

        muya.editor.selection.setSelection(
            { offset: 0, block: anchor, path: anchor.path },
            { offset: focus.text.length, block: focus, path: focus.path },
        );
        api.updateVirtualWindowForViewport(initial.totalEstimatedHeight / 2, 500);

        expect(anchor.outMostBlock!.domNode!.isConnected).toBe(true);
        expect(focus.outMostBlock!.domNode!.isConnected).toBe(true);
        expect(scrollPage.domNode!.querySelectorAll('.mu-virtual-render-placeholder-middle').length)
            .toBeGreaterThanOrEqual(2);
        expect(api.getVirtualizationPrototypeSnapshot().mountedBlocks).toBeLessThan(totalBlocks / 2);
    });

    it('mounts an offscreen Find result and keeps the active IME block pinned across window recalculation', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const totalBlocks = PROGRESSIVE_RENDER_THRESHOLD + 100;
        const needleIndex = totalBlocks - 12;
        const muya = new Muya(host, { markdown: paragraphs(totalBlocks, needleIndex) });
        mountedEditors.push(muya);

        muya.init();
        await muya.whenRenderComplete();

        await muya.editor.searchModule.searchAsync('needle-target');
        const match = muya.editor.searchModule.matches[0];
        expect(match).toBeDefined();
        expect(match.block.outMostBlock!.domNode!.isConnected).toBe(true);

        prototype(muya.editor.scrollPage!).updateVirtualWindowForViewport(0, 500);
        expect(match.block.outMostBlock!.domNode!.isConnected).toBe(true);

        await muya.editor.searchModule.searchAsync('');
        prototype(muya.editor.scrollPage!).updateVirtualWindowForViewport(0, 500);
        expect(match.block.outMostBlock!.domNode?.isConnected ?? false).toBe(false);

        const composing = contentAt(muya, 36);
        composing.setCursor(0, 0, true);
        composing.composeHandler(new Event('compositionstart'));
        prototype(muya.editor.scrollPage!).updateVirtualWindowForViewport(5_000, 500);
        expect(composing.outMostBlock!.domNode!.isConnected).toBe(true);

        composing.composeHandler(new Event('compositionend'));
        const viewportBlock = contentAt(muya, 220);
        viewportBlock.setCursor(0, 0, true);
        prototype(muya.editor.scrollPage!).updateVirtualWindowForViewport(5_000, 500);
        expect(composing.outMostBlock!.domNode?.isConnected ?? false).toBe(false);
    });

    it('routes Ctrl/Cmd+End and Home to logical document boundaries without full mount', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const totalBlocks = PROGRESSIVE_RENDER_THRESHOLD + 100;
        const muya = new Muya(host, { markdown: paragraphs(totalBlocks) });
        mountedEditors.push(muya);

        muya.init();
        await muya.whenRenderComplete();

        const first = contentAt(muya, 0);
        const last = contentAt(muya, totalBlocks - 1);
        first.setCursor(0, 0, true);

        const endEvent = new KeyboardEvent('keydown', {
            key: 'End',
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
        });
        first.keydownHandler(endEvent);
        expect(endEvent.defaultPrevented).toBe(true);
        expect(muya.editor.activeContentBlock).toBe(last);
        expect(last.getCursor()?.start.offset).toBe(last.text.length);
        expect(last.outMostBlock!.domNode!.isConnected).toBe(true);
        expect(prototype(muya.editor.scrollPage!).getVirtualizationPrototypeSnapshot().mountedBlocks)
            .toBeLessThan(totalBlocks / 2);

        const homeEvent = new KeyboardEvent('keydown', {
            key: 'Home',
            metaKey: true,
            bubbles: true,
            cancelable: true,
        });
        last.keydownHandler(homeEvent);
        expect(homeEvent.defaultPrevented).toBe(true);
        expect(muya.editor.activeContentBlock).toBe(first);
        expect(first.getCursor()?.start.offset).toBe(0);
        expect(first.outMostBlock!.domNode!.isConnected).toBe(true);
        expect(prototype(muya.editor.scrollPage!).getVirtualizationPrototypeSnapshot().mountedBlocks)
            .toBeLessThan(totalBlocks / 2);
    });

    it('survives rebuild Undo/Redo without falling back to a fully mounted document', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const totalBlocks = PROGRESSIVE_RENDER_THRESHOLD + 60;
        const before = paragraphs(totalBlocks, -1, 'before');
        const after = paragraphs(totalBlocks, -1, 'after');
        const muya = new Muya(host, { markdown: before });
        mountedEditors.push(muya);

        muya.init();
        await muya.whenRenderComplete();
        expect(muya.replaceContent(after)).toBe(true);
        await muya.whenRenderComplete();
        expect(muya.getMarkdown()).toContain('after 0');
        expect(prototype(muya.editor.scrollPage!).getVirtualizationPrototypeSnapshot().mountedBlocks)
            .toBeLessThan(totalBlocks);

        muya.undo();
        await muya.whenRenderComplete();
        expect(muya.getMarkdown()).toContain('before 0');
        expect(prototype(muya.editor.scrollPage!).getVirtualizationPrototypeSnapshot().mountedBlocks)
            .toBeLessThan(totalBlocks);

        muya.redo();
        await muya.whenRenderComplete();
        expect(muya.getMarkdown()).toContain('after 0');
        expect(prototype(muya.editor.scrollPage!).getVirtualizationPrototypeSnapshot().mountedBlocks)
            .toBeLessThan(totalBlocks);
    });
});
