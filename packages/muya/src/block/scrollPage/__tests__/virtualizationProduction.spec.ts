// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../../muya';
import { MarkdownToState } from '../../../state/markdownToState';
import { PROGRESSIVE_RENDER_THRESHOLD } from '../index';

const editors: Muya[] = [];

function paragraphs(count: number, prefix = 'production'): string {
    return `${Array.from({ length: count }, (_, index) => `${prefix} ${index}`).join('\n\n')}\n`;
}

afterEach(() => {
    while (editors.length) {
        const muya = editors.pop()!;
        muya.destroy();
        muya.domNode.remove();
    }
});

describe('stage C1 virtualization production contract', () => {
    it('enables top-level virtualization for large documents when the host opts in', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const totalBlocks = PROGRESSIVE_RENDER_THRESHOLD + 120;
        const muya = new Muya(host, {
            markdown: paragraphs(totalBlocks),
            virtualizeLargeDocuments: true,
        });
        editors.push(muya);

        muya.init();
        await muya.whenRenderComplete();

        const snapshot = muya.editor.scrollPage!.getVirtualizationSnapshot();
        expect(snapshot.enabled).toBe(true);
        expect(snapshot.totalBlocks).toBe(totalBlocks);
        expect(snapshot.mountedBlocks).toBeGreaterThan(0);
        expect(snapshot.mountedBlocks).toBeLessThan(totalBlocks);
        expect(snapshot.materializedBlocks).toBeLessThan(totalBlocks / 2);
        expect(snapshot.retainedDetachedDomBlocks).toBeLessThan(16);
        expect(muya.editor.scrollPage!.domNode!.dataset.virtualizationEnabled).toBe('true');
        expect(Number(muya.editor.scrollPage!.domNode!.dataset.virtualTotalBlocks)).toBe(totalBlocks);
        expect(Number(muya.editor.scrollPage!.domNode!.dataset.virtualMaterializedBlocks)).toBe(
            snapshot.materializedBlocks,
        );
        expect(Number(muya.editor.scrollPage!.domNode!.dataset.virtualRetainedDetachedBlocks)).toBe(
            snapshot.retainedDetachedDomBlocks,
        );
    });

    it('keeps a collapsed active block pinned without expanding the DOM across the whole gap', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const totalBlocks = PROGRESSIVE_RENDER_THRESHOLD + 240;
        const muya = new Muya(host, {
            markdown: paragraphs(totalBlocks),
            virtualizeLargeDocuments: true,
        });
        editors.push(muya);

        muya.init();
        await muya.whenRenderComplete();
        const scrollPage = muya.editor.scrollPage!;
        const first = scrollPage.firstContentInDescendant()!;
        first.setCursor(0, 0, true);
        scrollPage.updateVirtualWindowForViewport(
            scrollPage.getVirtualizationSnapshot().totalEstimatedHeight,
            600,
        );

        const snapshot = scrollPage.getVirtualizationSnapshot();
        expect(first.outMostBlock!.domNode!.isConnected).toBe(true);
        expect(snapshot.windowStart).toBeGreaterThan(0);
        expect(snapshot.windowEnd).toBe(totalBlocks);
        expect(snapshot.mountedBlocks).toBeLessThan(100);
    });

    it('does not retain virtualized documents in the warm render cache', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const totalBlocks = PROGRESSIVE_RENDER_THRESHOLD + 80;
        const muya = new Muya(host, {
            markdown: paragraphs(totalBlocks, 'first'),
            virtualizeLargeDocuments: true,
        });
        editors.push(muya);

        muya.init();
        await muya.whenRenderComplete();
        const scrollPage = muya.editor.scrollPage!;
        for (let index = 0; index < 4; index += 1) {
            scrollPage.updateState(
                new MarkdownToState().generate(paragraphs(totalBlocks, `next-${index}`)),
                true,
                false,
                0,
                `virtual-doc-${index}`,
            );
            await scrollPage.whenRenderComplete();
        }

        const snapshot = scrollPage.getVirtualizationSnapshot();
        expect(snapshot.renderCacheEntries).toBe(0);
        expect(snapshot.mountedBlocks).toBeLessThan(totalBlocks);
    });

    it('preserves measured geometry for unchanged blocks across an incremental edit', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const totalBlocks = PROGRESSIVE_RENDER_THRESHOLD + 80;
        const muya = new Muya(host, {
            markdown: paragraphs(totalBlocks),
            virtualizeLargeDocuments: true,
        });
        editors.push(muya);

        muya.init();
        await muya.whenRenderComplete();
        const scrollPage = muya.editor.scrollPage!;
        const internals = scrollPage as unknown as {
            _virtualBlocks: object[];
            _virtualMeasuredHeights: Map<number, number>;
        };
        const preservedBlock = internals._virtualBlocks[5];
        internals._virtualMeasuredHeights.set(5, 321);

        const first = scrollPage.firstContentInDescendant()!;
        first.setCursor(first.text.length, first.text.length, true);
        first.text = `${first.text} edited`;
        muya.editor.flush();

        await vi.waitFor(() => expect(muya.editor.history.canUndo()).toBe(true));

        const nextIndex = internals._virtualBlocks.indexOf(preservedBlock);
        expect(nextIndex).toBeGreaterThanOrEqual(0);
        expect(internals._virtualMeasuredHeights.get(nextIndex)).toBe(321);

        muya.undo();
        await vi.waitFor(() => expect(muya.getMarkdown()).not.toContain('production 0 edited'));
        expect(internals._virtualMeasuredHeights.get(
            internals._virtualBlocks.indexOf(preservedBlock),
        )).toBe(321);
    });

    it('ignores blank-root clicks when the logical tail block is dematerialized', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const totalBlocks = PROGRESSIVE_RENDER_THRESHOLD + 180;
        const muya = new Muya(host, {
            markdown: paragraphs(totalBlocks),
            virtualizeLargeDocuments: true,
        });
        editors.push(muya);

        muya.init();
        await muya.whenRenderComplete();
        const scrollPage = muya.editor.scrollPage!;
        scrollPage.updateVirtualWindowForViewport(
            scrollPage.getVirtualizationSnapshot().totalEstimatedHeight * 0.5,
            600,
        );

        const last = scrollPage.lastChild!;
        expect(last.domNode).toBeNull();
        expect(() => scrollPage.domNode!.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            clientY: 10_000,
        }))).not.toThrow();
    });
});
