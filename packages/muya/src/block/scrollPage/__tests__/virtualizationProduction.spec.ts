// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
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
});
