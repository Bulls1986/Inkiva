// @vitest-environment happy-dom

import type Parent from '../../base/parent';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../../muya';
import { MarkdownToState } from '../../../state/markdownToState';
import {
    PROGRESSIVE_RENDER_THRESHOLD,
    ScrollPage,
    VIRTUAL_RENDERER_SEGMENT_BLOCKS,
} from '../index';

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
    it('inserts a top-level block beside an already-mounted virtual segment sibling', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const totalBlocks = PROGRESSIVE_RENDER_THRESHOLD + 260;
        const muya = new Muya(host, {
            markdown: paragraphs(totalBlocks),
            virtualizeLargeDocuments: true,
        });
        editors.push(muya);

        muya.init();
        await muya.whenRenderComplete();
        const scrollPage = muya.editor.scrollPage!;
        const targetIndex = 220;
        const targetOffset = scrollPage.getVirtualBlockOffset(targetIndex);
        if (targetOffset == null)
            throw new Error('expected virtual target offset');
        scrollPage.updateVirtualWindowForViewport(targetOffset, 600);
        const internals = scrollPage as unknown as {
            _virtualScrollContainer: HTMLElement | null;
            _virtualLastScrollTop: number;
        };
        const container = internals._virtualScrollContainer;
        if (!container)
            throw new Error('expected virtual scroll container');
        // Programmatic reveal can move the live viewport before the asynchronous
        // scroll event updates the cached virtual position. Structural state
        // reconciliation must not replay that stale cache and jump back to top.
        container.scrollTop = targetOffset;
        internals._virtualLastScrollTop = 0;

        const target = scrollPage.find(targetIndex) as Parent;
        const next = target.next;
        expect(target.domNode?.parentElement?.classList.contains('mu-virtual-segment')).toBe(true);
        expect(next?.domNode?.parentElement?.classList.contains('mu-virtual-segment')).toBe(true);

        const inserted = ScrollPage.loadBlock('paragraph').create(muya, {
            name: 'paragraph',
            text: 'inserted beside mounted virtual sibling',
        });
        expect(() => scrollPage.insertAfter(inserted, target)).not.toThrow();
        expect(inserted.parent).toBe(scrollPage);
        expect(target.next).toBe(inserted);
        const insertedContent = inserted.firstContentInDescendant();
        insertedContent.setCursor(0, 0, true);
        expect(inserted.domNode?.isConnected).toBe(true);
        expect(insertedContent.getCursor()).not.toBeNull();
        const insertedDom = inserted.domNode;
        // A previously queued scroll hydration can run before JsonState flushes
        // the structural operation. It must not reconcile the segment against
        // the stale 380-block virtual index and detach this fresh caret node.
        scrollPage.updateVirtualWindowForViewport(container.scrollTop, 600);
        expect(inserted.domNode?.isConnected).toBe(true);
        expect(insertedContent.getCursor()).not.toBeNull();
        scrollPage.setRenderedState(muya.getState());
        expect(inserted.domNode).toBe(insertedDom);
        expect(scrollPage.getVirtualizationSnapshot().windowStart).toBeGreaterThan(0);
        expect(inserted.domNode?.isConnected).toBe(true);
        expect(insertedContent.getCursor()).not.toBeNull();
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        expect(inserted.domNode?.isConnected).toBe(true);
        expect(insertedContent.getCursor()).not.toBeNull();
    });

    it('pastes multiple paragraphs into a mounted virtual segment without truncation', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const totalBlocks = PROGRESSIVE_RENDER_THRESHOLD + 260;
        const muya = new Muya(host, {
            markdown: paragraphs(totalBlocks),
            virtualizeLargeDocuments: true,
        });
        editors.push(muya);

        muya.init();
        await muya.whenRenderComplete();
        const scrollPage = muya.editor.scrollPage!;
        const targetIndex = 220;
        const targetOffset = scrollPage.getVirtualBlockOffset(targetIndex);
        if (targetOffset == null)
            throw new Error('expected virtual target offset');
        scrollPage.updateVirtualWindowForViewport(targetOffset, 600);

        const target = scrollPage.find(targetIndex) as Parent;
        const content = target.firstContentInDescendant();
        if (!content)
            throw new Error('expected mounted paragraph content');
        content.setCursor(content.text.length, content.text.length, true);
        const pasted = Array.from({ length: 36 }, (_, index) => `VIRTUAL_UNIT_${index}`).join('\n\n');
        const event = {
            preventDefault: vi.fn(),
            stopPropagation: vi.fn(),
            clipboardData: {
                getData: (type: string) => type === 'text/plain' ? pasted : '',
                files: [],
                items: [],
            },
        } as unknown as ClipboardEvent;

        await muya.editor.clipboard.pasteHandler(event, pasted, '');
        await vi.waitFor(() => {
            const markdown = muya.getMarkdown();
            expect(markdown).toContain('VIRTUAL_UNIT_0');
            expect(markdown).toContain('VIRTUAL_UNIT_35');
            expect(scrollPage.length()).toBe(totalBlocks + 35);
        });
    });

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

    it('bounds the primary materialized window to one viewport of overscan per side', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const totalBlocks = PROGRESSIVE_RENDER_THRESHOLD + 320;
        const muya = new Muya(host, {
            markdown: paragraphs(totalBlocks),
            virtualizeLargeDocuments: true,
        });
        editors.push(muya);

        muya.init();
        await muya.whenRenderComplete();
        const scrollPage = muya.editor.scrollPage!;
        const targetIndex = 180;
        const viewportHeight = 600;
        const targetOffset = scrollPage.getVirtualBlockOffset(targetIndex);
        const nextOffset = scrollPage.getVirtualBlockOffset(targetIndex + 1);
        if (targetOffset === null || nextOffset === null)
            throw new Error('expected virtual target offsets');

        scrollPage.updateVirtualWindowForViewport(targetOffset, viewportHeight);
        const snapshot = scrollPage.getVirtualizationSnapshot();
        const startOffset = scrollPage.getVirtualBlockOffset(snapshot.windowStart);
        const lastMountedOffset = scrollPage.getVirtualBlockOffset(snapshot.windowEnd - 1);
        if (startOffset === null || lastMountedOffset === null)
            throw new Error('expected mounted virtual window offsets');

        const blockAdvance = nextOffset - targetOffset;
        const roundingTolerance = Math.max(1, blockAdvance * 2);
        expect(targetOffset - startOffset).toBeLessThanOrEqual(viewportHeight + roundingTolerance);
        expect(lastMountedOffset - (targetOffset + viewportHeight)).toBeLessThanOrEqual(
            viewportHeight + roundingTolerance,
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
        expect(snapshot.mountedSegments).toBe(2);
        expect(snapshot.mountedBlocks).toBeLessThanOrEqual(snapshot.segmentSize + 1);
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

    it('updates one measured block advance without rebuilding every virtual offset', async () => {
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
            _virtualBlocks: Array<{ domNode: HTMLElement | null }>;
            _measureVirtualBlockHeights: (entries: readonly ResizeObserverEntry[]) => void;
            _rebuildVirtualOffsets: (...args: unknown[]) => void;
            _rebuildVirtualSegmentOffsets: () => void;
        };
        const firstNode = internals._virtualBlocks[0]?.domNode;
        const secondNode = internals._virtualBlocks[1]?.domNode;
        expect(firstNode?.isConnected).toBe(true);
        expect(secondNode?.isConnected).toBe(true);
        if (!firstNode || !secondNode)
            throw new Error('expected adjacent mounted virtual blocks');

        vi.spyOn(firstNode, 'getBoundingClientRect').mockReturnValue({ top: 10 } as DOMRect);
        vi.spyOn(secondNode, 'getBoundingClientRect').mockReturnValue({ top: 75 } as DOMRect);
        const rebuild = vi.spyOn(internals, '_rebuildVirtualOffsets');
        const segmentRebuild = vi.spyOn(internals, '_rebuildVirtualSegmentOffsets');

        internals._measureVirtualBlockHeights([{ target: firstNode } as unknown as ResizeObserverEntry]);

        expect(rebuild).not.toHaveBeenCalled();
        expect(segmentRebuild).not.toHaveBeenCalled();
        expect(scrollPage.getVirtualBlockOffset(1)).toBeCloseTo(65, 4);
    });

    it('propagates async height growth across a mounted virtual segment boundary', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const totalBlocks = PROGRESSIVE_RENDER_THRESHOLD + VIRTUAL_RENDERER_SEGMENT_BLOCKS * 3;
        const muya = new Muya(host, {
            markdown: paragraphs(totalBlocks),
            virtualizeLargeDocuments: true,
        });
        editors.push(muya);

        muya.init();
        await muya.whenRenderComplete();
        const scrollPage = muya.editor.scrollPage!;
        const boundaryIndex = VIRTUAL_RENDERER_SEGMENT_BLOCKS - 1;
        const boundaryOffset = scrollPage.getVirtualBlockOffset(boundaryIndex);
        if (boundaryOffset == null)
            throw new Error('expected virtual boundary offset');

        scrollPage.updateVirtualWindowForViewport(boundaryOffset, 720);
        const internals = scrollPage as unknown as {
            _virtualBlocks: Array<{ domNode: HTMLElement | null }>;
            _measureVirtualBlockHeights: (entries: readonly ResizeObserverEntry[]) => void;
            _virtualMountedIndexes: Set<number>;
            _virtualScrollContainer: HTMLElement | null;
        };
        const boundaryNode = internals._virtualBlocks[boundaryIndex]?.domNode;
        const nextNode = internals._virtualBlocks[boundaryIndex + 1]?.domNode;
        const container = internals._virtualScrollContainer;
        if (!boundaryNode || !nextNode || !container)
            throw new Error('expected adjacent mounted blocks across segment boundary');

        expect(internals._virtualMountedIndexes.has(boundaryIndex)).toBe(true);
        expect(internals._virtualMountedIndexes.has(boundaryIndex + 1)).toBe(true);
        expect(boundaryNode.parentElement).not.toBe(nextNode.parentElement);
        expect(boundaryNode.parentElement?.classList.contains('mu-virtual-segment')).toBe(true);
        expect(nextNode.parentElement?.classList.contains('mu-virtual-segment')).toBe(true);

        const nextOffsetBefore = scrollPage.getVirtualBlockOffset(boundaryIndex + 1);
        if (nextOffsetBefore == null)
            throw new Error('expected next virtual offset');
        Object.defineProperty(container, 'clientHeight', {
            configurable: true,
            value: 720,
        });
        container.scrollTop = boundaryOffset;

        vi.spyOn(boundaryNode, 'getBoundingClientRect').mockReturnValue({ top: 100 } as DOMRect);
        const nextRect = vi.spyOn(nextNode, 'getBoundingClientRect')
            .mockReturnValue({ top: 340 } as DOMRect);

        internals._measureVirtualBlockHeights([
            { target: boundaryNode } as unknown as ResizeObserverEntry,
        ]);

        expect(scrollPage.getVirtualBlockOffset(boundaryIndex + 1)).not.toBeCloseTo(nextOffsetBefore, 4);
        expect(scrollPage.getVirtualBlockOffset(boundaryIndex + 1)).toBeCloseTo(boundaryOffset + 240, 4);

        const assertViewportCovered = () => {
            const snapshot = scrollPage.getVirtualizationSnapshot();
            const mountedStart = scrollPage.getVirtualBlockOffset(snapshot.windowStart);
            const mountedEnd = scrollPage.getVirtualBlockOffset(snapshot.windowEnd);
            if (mountedStart == null || mountedEnd == null)
                throw new Error('expected logical mounted window bounds');
            expect(mountedStart).toBeLessThanOrEqual(container.scrollTop);
            expect(mountedEnd).toBeGreaterThanOrEqual(container.scrollTop + container.clientHeight);
        };
        assertViewportCovered();

        // Repeat the same generic top-level resize to prove that geometry
        // invalidation does not accumulate drift. The fixture uses ordinary
        // paragraph blocks, so this covers the non-diagram async-content path
        // that images and other media share through the block ResizeObserver.
        nextRect.mockReturnValue({ top: 460 } as DOMRect);
        internals._measureVirtualBlockHeights([
            { target: boundaryNode } as unknown as ResizeObserverEntry,
        ]);
        expect(scrollPage.getVirtualBlockOffset(boundaryIndex + 1)).toBeCloseTo(boundaryOffset + 360, 4);
        assertViewportCovered();
    });

    it('propagates async height growth for the final virtual block into total document height', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const totalBlocks = PROGRESSIVE_RENDER_THRESHOLD + VIRTUAL_RENDERER_SEGMENT_BLOCKS * 2 + 7;
        const muya = new Muya(host, {
            markdown: paragraphs(totalBlocks),
            virtualizeLargeDocuments: true,
        });
        editors.push(muya);

        muya.init();
        await muya.whenRenderComplete();
        const scrollPage = muya.editor.scrollPage!;
        const lastIndex = totalBlocks - 1;
        const lastOffset = scrollPage.getVirtualBlockOffset(lastIndex);
        if (lastOffset == null)
            throw new Error('expected final virtual block offset');

        scrollPage.updateVirtualWindowForViewport(lastOffset, 720);
        const internals = scrollPage as unknown as {
            _virtualBlocks: Array<{ domNode: HTMLElement | null }>;
            _virtualAfterSpacer: HTMLElement | null;
            _measureVirtualBlockHeights: (entries: readonly ResizeObserverEntry[]) => void;
            _virtualMeasuredHeights: Map<number, number>;
        };
        const lastNode = internals._virtualBlocks[lastIndex]?.domNode;
        const afterSpacer = internals._virtualAfterSpacer;
        if (!lastNode || !afterSpacer)
            throw new Error('expected mounted final block and after spacer');

        vi.spyOn(lastNode, 'getBoundingClientRect').mockReturnValue({ top: 100 } as DOMRect);
        vi.spyOn(afterSpacer, 'getBoundingClientRect').mockReturnValue({ top: 500 } as DOMRect);

        internals._measureVirtualBlockHeights([
            { target: lastNode } as unknown as ResizeObserverEntry,
        ]);

        expect(internals._virtualMeasuredHeights.get(lastIndex)).toBeCloseTo(400, 4);
        expect(scrollPage.getVirtualizationSnapshot().totalEstimatedHeight).toBeCloseTo(lastOffset + 400, 4);
    });

    it('ignores stale geometry invalidation from an older surface generation', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const muya = new Muya(host, {
            markdown: paragraphs(PROGRESSIVE_RENDER_THRESHOLD + 80),
            virtualizeLargeDocuments: true,
        });
        editors.push(muya);

        muya.init();
        await muya.whenRenderComplete();
        const scrollPage = muya.editor.scrollPage!;
        const internals = scrollPage as unknown as {
            _virtualBlocks: Array<{ domNode: HTMLElement | null }>;
            _virtualGeometryGeneration: number;
            _virtualMeasuredHeights: Map<number, number>;
            _invalidateVirtualGeometry: (invalidation: {
                reason: 'mounted-block-resized';
                generation: number;
                entries: readonly ResizeObserverEntry[];
            }) => void;
        };
        const firstNode = internals._virtualBlocks[0]?.domNode;
        const secondNode = internals._virtualBlocks[1]?.domNode;
        if (!firstNode || !secondNode)
            throw new Error('expected adjacent mounted virtual blocks');

        vi.spyOn(firstNode, 'getBoundingClientRect').mockReturnValue({ top: 10 } as DOMRect);
        vi.spyOn(secondNode, 'getBoundingClientRect').mockReturnValue({ top: 90 } as DOMRect);
        const generation = internals._virtualGeometryGeneration;

        internals._invalidateVirtualGeometry({
            reason: 'mounted-block-resized',
            generation: generation - 1,
            entries: [{ target: firstNode } as unknown as ResizeObserverEntry],
        });

        expect(internals._virtualMeasuredHeights.get(0)).toBeUndefined();
    });

    it('ignores a resize result for a block that has already unmounted', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const totalBlocks = PROGRESSIVE_RENDER_THRESHOLD + 320;
        const muya = new Muya(host, {
            markdown: paragraphs(totalBlocks),
            virtualizeLargeDocuments: true,
        });
        editors.push(muya);

        muya.init();
        await muya.whenRenderComplete();
        const scrollPage = muya.editor.scrollPage!;
        const internals = scrollPage as unknown as {
            _virtualBlocks: Array<{ domNode: HTMLElement | null }>;
            _virtualGeometryGeneration: number;
            _virtualMeasuredHeights: Map<number, number>;
            _invalidateVirtualGeometry: (invalidation: {
                reason: 'mounted-block-resized';
                generation: number;
                entries: readonly ResizeObserverEntry[];
            }) => void;
        };
        const staleIndex = 160;
        const staleOffset = scrollPage.getVirtualBlockOffset(staleIndex);
        if (staleOffset == null)
            throw new Error('expected stale-block virtual offset');
        scrollPage.updateVirtualWindowForViewport(staleOffset, 600);
        const staleNode = internals._virtualBlocks[staleIndex]?.domNode;
        if (!staleNode || !staleNode.isConnected)
            throw new Error('expected ordinary mounted block before moving away');

        const distantOffset = scrollPage.getVirtualBlockOffset(totalBlocks - 40);
        if (distantOffset == null)
            throw new Error('expected distant virtual offset');
        scrollPage.updateVirtualWindowForViewport(distantOffset, 600);
        expect(staleNode.isConnected).toBe(false);

        internals._invalidateVirtualGeometry({
            reason: 'mounted-block-resized',
            generation: internals._virtualGeometryGeneration,
            entries: [{ target: staleNode } as unknown as ResizeObserverEntry],
        });

        expect(internals._virtualMeasuredHeights.get(staleIndex)).toBeUndefined();
    });

    it('applies out-of-order async resize results without breaking offset monotonicity', async () => {
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
            _virtualBlocks: Array<{ domNode: HTMLElement | null }>;
            _measureVirtualBlockHeights: (entries: readonly ResizeObserverEntry[]) => void;
        };
        const firstNode = internals._virtualBlocks[0]?.domNode;
        const secondNode = internals._virtualBlocks[1]?.domNode;
        const thirdNode = internals._virtualBlocks[2]?.domNode;
        if (!firstNode || !secondNode || !thirdNode)
            throw new Error('expected three mounted virtual blocks');

        vi.spyOn(firstNode, 'getBoundingClientRect').mockReturnValue({ top: 10 } as DOMRect);
        vi.spyOn(secondNode, 'getBoundingClientRect').mockReturnValue({ top: 110 } as DOMRect);
        vi.spyOn(thirdNode, 'getBoundingClientRect').mockReturnValue({ top: 270 } as DOMRect);

        internals._measureVirtualBlockHeights([
            { target: secondNode } as unknown as ResizeObserverEntry,
            { target: firstNode } as unknown as ResizeObserverEntry,
        ]);

        expect(scrollPage.getVirtualBlockOffset(1)).toBeCloseTo(100, 4);
        expect(scrollPage.getVirtualBlockOffset(2)).toBeCloseTo(260, 4);
        let previous = -1;
        for (let index = 0; index <= totalBlocks; index += 1) {
            const offset = scrollPage.getVirtualBlockOffset(index);
            if (offset == null)
                break;
            expect(Number.isFinite(offset)).toBe(true);
            expect(offset).toBeGreaterThanOrEqual(previous);
            previous = offset;
        }
        const snapshot = scrollPage.getVirtualizationSnapshot();
        expect(Number.isFinite(snapshot.totalEstimatedHeight)).toBe(true);
        expect(snapshot.totalEstimatedHeight).toBeGreaterThanOrEqual(previous);
    });

    it('replays a mounted block resize that arrives while measurement is deferred', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const muya = new Muya(host, {
            markdown: paragraphs(PROGRESSIVE_RENDER_THRESHOLD + 80),
            virtualizeLargeDocuments: true,
        });
        editors.push(muya);

        muya.init();
        await muya.whenRenderComplete();
        const scrollPage = muya.editor.scrollPage!;
        const internals = scrollPage as unknown as {
            _virtualBlocks: Array<{ domNode: HTMLElement | null }>;
            _virtualGeometryGeneration: number;
            _virtualBlockMeasurementDeferred: boolean;
            _invalidateVirtualGeometry: (invalidation: {
                reason: 'mounted-block-resized';
                generation: number;
                entries: readonly ResizeObserverEntry[];
            }) => void;
            _resumeVirtualBlockMeasurement: () => void;
        };
        const firstNode = internals._virtualBlocks[0]?.domNode;
        const secondNode = internals._virtualBlocks[1]?.domNode;
        if (!firstNode || !secondNode)
            throw new Error('expected adjacent mounted virtual blocks');

        const nextOffsetBefore = scrollPage.getVirtualBlockOffset(1);
        if (nextOffsetBefore == null)
            throw new Error('expected next virtual offset');
        vi.spyOn(firstNode, 'getBoundingClientRect').mockReturnValue({ top: 100 } as DOMRect);
        vi.spyOn(secondNode, 'getBoundingClientRect').mockReturnValue({ top: 420 } as DOMRect);

        internals._virtualBlockMeasurementDeferred = true;
        internals._invalidateVirtualGeometry({
            reason: 'mounted-block-resized',
            generation: internals._virtualGeometryGeneration,
            entries: [{ target: firstNode } as unknown as ResizeObserverEntry],
        });
        expect(scrollPage.getVirtualBlockOffset(1)).toBeCloseTo(nextOffsetBefore, 4);

        internals._resumeVirtualBlockMeasurement();

        expect(scrollPage.getVirtualBlockOffset(1)).toBeCloseTo(320, 4);
    });

    it('preserves the latest logical viewport anchor when measured geometry changes above it', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const muya = new Muya(host, {
            markdown: paragraphs(PROGRESSIVE_RENDER_THRESHOLD + 80),
            virtualizeLargeDocuments: true,
        });
        editors.push(muya);

        muya.init();
        await muya.whenRenderComplete();
        const scrollPage = muya.editor.scrollPage!;
        const internals = scrollPage as unknown as {
            _virtualBlocks: Array<{ domNode: HTMLElement | null }>;
            _virtualViewportAnchorIndex: number | null;
            _virtualViewportAnchorOffset: number | null;
            _virtualViewportAnchorExact: boolean;
            _virtualUserScrollIntent: boolean;
            _virtualLastScrollTop: number;
            _virtualNavigationTarget: unknown;
            _virtualResizeCorrectionTarget: number | null;
            _captureVirtualViewportAnchor: (container: HTMLElement) => { index: number; viewportOffset: number };
            _measureVirtualBlockHeights: (entries: readonly ResizeObserverEntry[]) => void;
        };
        const firstNode = internals._virtualBlocks[0]?.domNode;
        const secondNode = internals._virtualBlocks[1]?.domNode;
        if (!firstNode || !secondNode)
            throw new Error('expected adjacent mounted virtual blocks');

        vi.spyOn(firstNode, 'getBoundingClientRect').mockReturnValue({ top: 10 } as DOMRect);
        vi.spyOn(secondNode, 'getBoundingClientRect').mockReturnValue({ top: 90 } as DOMRect);
        internals._virtualViewportAnchorIndex = 37;
        internals._virtualViewportAnchorOffset = -20;
        internals._virtualViewportAnchorExact = false;
        internals._virtualUserScrollIntent = false;
        internals._virtualLastScrollTop = 0;
        internals._virtualNavigationTarget = null;
        internals._virtualResizeCorrectionTarget = null;
        const capture = vi.spyOn(internals, '_captureVirtualViewportAnchor').mockReturnValue({
            index: 0,
            viewportOffset: 12,
        });

        internals._measureVirtualBlockHeights([{ target: firstNode } as unknown as ResizeObserverEntry]);

        expect(capture).toHaveBeenCalled();
        expect(internals._virtualViewportAnchorIndex).toBe(37);
        expect(internals._virtualViewportAnchorOffset).toBe(-20);
        expect(internals._virtualViewportAnchorExact).toBe(true);
    });

    it('preserves the pre-reflow exact anchor when block measurement fires before the width resize observer', async () => {
        const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
            configurable: true,
            get: () => 800,
        });
        try {
            const host = document.createElement('div');
            document.body.appendChild(host);
            const muya = new Muya(host, {
                markdown: paragraphs(PROGRESSIVE_RENDER_THRESHOLD + 80),
                virtualizeLargeDocuments: true,
            });
            editors.push(muya);

            muya.init();
            await muya.whenRenderComplete();
            const scrollPage = muya.editor.scrollPage!;
            const internals = scrollPage as unknown as {
                domNode: HTMLElement;
                _virtualBlocks: Array<{ domNode: HTMLElement | null }>;
                _virtualViewportAnchorIndex: number | null;
                _virtualViewportAnchorOffset: number | null;
                _virtualViewportAnchorExact: boolean;
                _virtualNavigationTarget: unknown;
                _virtualResizeCorrectionTarget: number | null;
                _captureVirtualViewportAnchor: (container: HTMLElement) => { index: number; viewportOffset: number };
                _measureVirtualBlockHeights: (entries: readonly ResizeObserverEntry[]) => void;
            };
            const firstNode = internals._virtualBlocks[0]?.domNode;
            const secondNode = internals._virtualBlocks[1]?.domNode;
            if (!firstNode || !secondNode)
                throw new Error('expected adjacent mounted virtual blocks');

            vi.spyOn(firstNode, 'getBoundingClientRect').mockReturnValue({ top: 10 } as DOMRect);
            vi.spyOn(secondNode, 'getBoundingClientRect').mockReturnValue({ top: 90 } as DOMRect);
            internals._virtualViewportAnchorIndex = 37;
            internals._virtualViewportAnchorOffset = -20;
            internals._virtualViewportAnchorExact = true;
            internals._virtualNavigationTarget = null;
            internals._virtualResizeCorrectionTarget = null;
            Object.defineProperty(internals.domNode, 'clientWidth', {
                configurable: true,
                value: 600,
            });
            const capture = vi.spyOn(internals, '_captureVirtualViewportAnchor').mockReturnValue({
                index: 5,
                viewportOffset: 12,
            });

            internals._measureVirtualBlockHeights([{ target: firstNode } as unknown as ResizeObserverEntry]);

            expect(capture).not.toHaveBeenCalled();
            expect(internals._virtualViewportAnchorIndex).toBe(37);
            expect(internals._virtualViewportAnchorOffset).toBe(-20);
            expect(internals._virtualViewportAnchorExact).toBe(true);
        }
        finally {
            if (originalClientWidth)
                Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
        }
    });

    it('captures the live DOM anchor when width reflow starts before the approximate viewport anchor settles', async () => {
        const originalResizeObserver = globalThis.ResizeObserver;
        const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
        class ResizeObserverDouble {
            readonly observed = new Set<Element>();

            constructor(private readonly _callback: ResizeObserverCallback) {}

            observe(target: Element): void {
                this.observed.add(target);
            }

            unobserve(target: Element): void {
                this.observed.delete(target);
            }

            disconnect(): void {
                this.observed.clear();
            }

            trigger(target: Element): void {
                this._callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
            }
        }

        Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
            configurable: true,
            get: () => 800,
        });
        vi.stubGlobal('ResizeObserver', ResizeObserverDouble);
        try {
            const host = document.createElement('div');
            document.body.appendChild(host);
            const muya = new Muya(host, {
                markdown: paragraphs(PROGRESSIVE_RENDER_THRESHOLD + 80),
                virtualizeLargeDocuments: true,
            });
            editors.push(muya);

            muya.init();
            await muya.whenRenderComplete();
            const scrollPage = muya.editor.scrollPage!;
            const internals = scrollPage as unknown as {
                domNode: HTMLElement;
                _virtualScrollContainer: HTMLElement;
                _virtualResizeObserver: ResizeObserverDouble;
                _virtualViewportAnchorIndex: number | null;
                _virtualViewportAnchorOffset: number | null;
                _virtualViewportAnchorExact: boolean;
                _virtualResizeAnchorIndex: number | null;
                _virtualResizeAnchorOffset: number | null;
                _captureVirtualViewportAnchor: (container: HTMLElement) => { index: number; viewportOffset: number };
            };

            internals._virtualViewportAnchorIndex = 37;
            internals._virtualViewportAnchorOffset = -20;
            internals._virtualViewportAnchorExact = false;
            const capture = vi.spyOn(internals, '_captureVirtualViewportAnchor').mockReturnValue({
                index: 5,
                viewportOffset: 12,
            });
            Object.defineProperty(internals.domNode, 'clientWidth', {
                configurable: true,
                value: 600,
            });
            internals._virtualScrollContainer.scrollTop = 500;

            internals._virtualResizeObserver.trigger(internals.domNode);

            expect(capture).toHaveBeenCalledTimes(1);
            expect(internals._virtualResizeAnchorIndex).toBe(5);
            expect(internals._virtualResizeAnchorOffset).toBe(12);
        }
        finally {
            vi.unstubAllGlobals();
            if (originalResizeObserver)
                vi.stubGlobal('ResizeObserver', originalResizeObserver);
            if (originalClientWidth)
                Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
        }
    });

    it('defers block measurements until viewport hydration resumes observation', async () => {
        vi.useFakeTimers();
        try {
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
            const disconnect = vi.fn();
            const observe = vi.fn();
            const fakeObserver = { disconnect, observe } as unknown as ResizeObserver;
            const internals = scrollPage as unknown as {
                _virtualBlockResizeObserver: ResizeObserver | null;
                _virtualBlockMeasurementDeferred: boolean;
                _deferVirtualBlockMeasurement: () => void;
                _hydrateVirtualWindowAtCurrentViewport: (container: HTMLElement) => void;
                _virtualScrollContainer: HTMLElement | null;
            };
            internals._virtualBlockResizeObserver = fakeObserver;

            internals._deferVirtualBlockMeasurement();

            expect(internals._virtualBlockMeasurementDeferred).toBe(true);
            expect(disconnect).not.toHaveBeenCalled();
            const container = internals._virtualScrollContainer;
            if (!container)
                throw new Error('expected virtual scroll container');
            internals._hydrateVirtualWindowAtCurrentViewport(container);
            expect(internals._virtualBlockMeasurementDeferred).toBe(false);
            expect(observe).toHaveBeenCalled();
            for (const call of observe.mock.calls)
                expect(call[1]).toEqual({ box: 'border-box' });
        }
        finally {
            vi.useRealTimers();
        }
    });

    it('materializes only entering blocks when a virtual window shifts', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const totalBlocks = PROGRESSIVE_RENDER_THRESHOLD + 160;
        const muya = new Muya(host, {
            markdown: paragraphs(totalBlocks),
            virtualizeLargeDocuments: true,
        });
        editors.push(muya);

        muya.init();
        await muya.whenRenderComplete();
        const scrollPage = muya.editor.scrollPage!;
        const internals = scrollPage as unknown as {
            _virtualBlocks: Array<{ materializeDomTree: () => HTMLElement | null; domNode: HTMLElement | null }>;
            _applyVirtualWindow: (start: number, end: number, pinned?: readonly { start: number; end: number }[]) => void;
        };
        internals._applyVirtualWindow(70, 78, []);
        const stayingIndex = 74;
        const enteringIndex = 78;
        const stayingBlock = internals._virtualBlocks[stayingIndex];
        const enteringBlock = internals._virtualBlocks[enteringIndex];
        expect(stayingBlock?.domNode?.isConnected).toBe(true);
        expect(enteringBlock?.domNode?.isConnected ?? false).toBe(false);
        if (!stayingBlock || !enteringBlock)
            throw new Error('expected virtual window blocks');

        const stayingMaterialize = vi.spyOn(stayingBlock, 'materializeDomTree');
        const enteringMaterialize = vi.spyOn(enteringBlock, 'materializeDomTree');
        internals._applyVirtualWindow(71, 79, []);

        expect(stayingMaterialize).not.toHaveBeenCalled();
        expect(enteringMaterialize).toHaveBeenCalledTimes(1);
        expect(stayingBlock.domNode?.isConnected).toBe(true);
        expect(enteringBlock.domNode?.isConnected).toBe(true);
    });

    it('keeps hydration local while retaining stable 64-block segment geometry', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const totalBlocks = PROGRESSIVE_RENDER_THRESHOLD + 300;
        const muya = new Muya(host, {
            markdown: paragraphs(totalBlocks),
            virtualizeLargeDocuments: true,
        });
        editors.push(muya);

        muya.init();
        await muya.whenRenderComplete();
        const scrollPage = muya.editor.scrollPage!;
        const internals = scrollPage as unknown as {
            _applyVirtualWindow: (start: number, end: number, pinned?: readonly { start: number; end: number }[]) => void;
        };

        internals._applyVirtualWindow(65, 70, []);

        const snapshot = scrollPage.getVirtualizationSnapshot();
        expect(snapshot.segmentSize).toBe(64);
        expect(snapshot.totalSegments).toBe(Math.ceil(totalBlocks / 64));
        expect(snapshot.windowStart).toBe(65);
        expect(snapshot.windowEnd).toBe(70);
        expect(snapshot.windowStartSegment).toBe(1);
        expect(snapshot.windowEndSegment).toBe(2);
        expect(snapshot.mountedSegments).toBe(1);
        expect(snapshot.mountedBlocks).toBe(5);
        expect(scrollPage.domNode!.querySelectorAll('[data-virtual-block-index]')).toHaveLength(5);
    });

    it('shifts the local block window without remounting the segment root', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const totalBlocks = PROGRESSIVE_RENDER_THRESHOLD + 400;
        const muya = new Muya(host, {
            markdown: paragraphs(totalBlocks),
            virtualizeLargeDocuments: true,
        });
        editors.push(muya);

        muya.init();
        await muya.whenRenderComplete();
        const scrollPage = muya.editor.scrollPage!;
        const firstOffset = scrollPage.getVirtualBlockOffset(80);
        const secondOffset = scrollPage.getVirtualBlockOffset(90);
        if (firstOffset === null || secondOffset === null)
            throw new Error('expected virtual offsets');

        scrollPage.updateVirtualWindowForViewport(firstOffset, 1);
        const firstSnapshot = scrollPage.getVirtualizationSnapshot();
        const root = scrollPage.domNode!;
        const segmentBefore = root.querySelector('.mu-virtual-segment');
        const rootInsert = vi.spyOn(root, 'insertBefore');

        scrollPage.updateVirtualWindowForViewport(secondOffset, 1);

        const secondSnapshot = scrollPage.getVirtualizationSnapshot();
        expect(secondSnapshot.windowStart).not.toBe(firstSnapshot.windowStart);
        expect(secondSnapshot.windowStartSegment).toBe(firstSnapshot.windowStartSegment);
        expect(root.querySelector('.mu-virtual-segment')).toBe(segmentBefore);
        expect(rootInsert).not.toHaveBeenCalled();
    });

    it('batches an entering segment into one root insertion', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const totalBlocks = PROGRESSIVE_RENDER_THRESHOLD + 400;
        const muya = new Muya(host, {
            markdown: paragraphs(totalBlocks),
            virtualizeLargeDocuments: true,
        });
        editors.push(muya);

        muya.init();
        await muya.whenRenderComplete();
        const scrollPage = muya.editor.scrollPage!;
        const internals = scrollPage as unknown as {
            _applyVirtualWindow: (start: number, end: number, pinned?: readonly { start: number; end: number }[]) => void;
        };
        const root = scrollPage.domNode!;
        const insertBefore = vi.spyOn(root, 'insertBefore');

        internals._applyVirtualWindow(70, 78, []);

        expect(scrollPage.getVirtualizationSnapshot().mountedBlocks).toBe(8);
        expect(root.querySelectorAll(':scope > .mu-virtual-segment')).toHaveLength(1);
        expect(root.querySelectorAll('[data-virtual-block-index]')).toHaveLength(8);
        expect(insertBefore).toHaveBeenCalledTimes(1);
    });

    it('detaches an exiting segment with one root child-list removal', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const totalBlocks = PROGRESSIVE_RENDER_THRESHOLD + 400;
        const muya = new Muya(host, {
            markdown: paragraphs(totalBlocks),
            virtualizeLargeDocuments: true,
        });
        editors.push(muya);

        muya.init();
        await muya.whenRenderComplete();
        const scrollPage = muya.editor.scrollPage!;
        const internals = scrollPage as unknown as {
            _applyVirtualWindow: (start: number, end: number, pinned?: readonly { start: number; end: number }[]) => void;
        };
        const records: MutationRecord[] = [];
        const observer = new MutationObserver(mutations => records.push(...mutations));
        observer.observe(scrollPage.domNode!, { childList: true });

        internals._applyVirtualWindow(64, 72, []);
        await Promise.resolve();
        observer.disconnect();

        const removalRecords = records.filter(record => record.removedNodes.length > 0);
        expect(removalRecords).toHaveLength(1);
        expect(removalRecords[0]?.removedNodes.length).toBe(1);
        expect((removalRecords[0]?.removedNodes[0] as HTMLElement | undefined)?.classList.contains('mu-virtual-segment')).toBe(true);
    });

    it('hydrates after two stable paint boundaries when scrollend is unavailable', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const totalBlocks = PROGRESSIVE_RENDER_THRESHOLD + 400;
        const muya = new Muya(host, {
            markdown: paragraphs(totalBlocks),
            virtualizeLargeDocuments: true,
        });
        editors.push(muya);

        muya.init();
        await muya.whenRenderComplete();
        const scrollPage = muya.editor.scrollPage!;
        const internals = scrollPage as unknown as {
            _virtualScrollContainer: HTMLElement | null;
            _scheduleVirtualWindowHydration: (container: HTMLElement) => void;
        };
        const container = internals._virtualScrollContainer;
        if (!container)
            throw new Error('expected virtual scroll container');
        const applyWindow = vi.spyOn(scrollPage, 'updateVirtualWindowForViewport');
        applyWindow.mockClear();

        let nextFrameId = 1;
        const frames = new Map<number, FrameRequestCallback>();
        vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
            const id = nextFrameId++;
            frames.set(id, callback);
            return id;
        }));
        vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => {
            frames.delete(id);
        }));
        const runNextFrame = () => {
            const next = frames.entries().next().value as [number, FrameRequestCallback] | undefined;
            if (!next)
                throw new Error('expected hydration frame');
            const [id, callback] = next;
            frames.delete(id);
            callback(performance.now());
        };

        try {
            container.scrollTop = 100;
            internals._scheduleVirtualWindowHydration(container);
            runNextFrame();
            expect(applyWindow).not.toHaveBeenCalled();

            // A newer scroll invalidates the pending second frame from the old generation.
            container.scrollTop = 200;
            internals._scheduleVirtualWindowHydration(container);
            runNextFrame();
            expect(applyWindow).not.toHaveBeenCalled();
            runNextFrame();

            expect(applyWindow).toHaveBeenCalledTimes(1);
            expect(applyWindow).toHaveBeenLastCalledWith(container.scrollTop, expect.any(Number));
        }
        finally {
            vi.unstubAllGlobals();
        }
    });

    it('hydrates after two stable paint boundaries when Chromium exposes scrollend but no scrollend event arrives', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const totalBlocks = PROGRESSIVE_RENDER_THRESHOLD + 400;
        const muya = new Muya(host, {
            markdown: paragraphs(totalBlocks),
            virtualizeLargeDocuments: true,
        });
        editors.push(muya);

        muya.init();
        await muya.whenRenderComplete();
        const scrollPage = muya.editor.scrollPage!;
        const internals = scrollPage as unknown as {
            _virtualScrollContainer: HTMLElement | null;
            _scheduleVirtualWindowHydration: (container: HTMLElement) => void;
        };
        const container = internals._virtualScrollContainer;
        if (!container)
            throw new Error('expected virtual scroll container');

        Object.defineProperty(container, 'onscrollend', {
            configurable: true,
            value: null,
        });
        const applyWindow = vi.spyOn(scrollPage, 'updateVirtualWindowForViewport');
        applyWindow.mockClear();

        let nextFrameId = 1;
        const frames = new Map<number, FrameRequestCallback>();
        vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
            const id = nextFrameId++;
            frames.set(id, callback);
            return id;
        }));
        vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => {
            frames.delete(id);
        }));
        const runNextFrame = () => {
            const next = frames.entries().next().value as [number, FrameRequestCallback] | undefined;
            if (!next)
                throw new Error('expected hydration frame');
            const [id, callback] = next;
            frames.delete(id);
            callback(performance.now());
        };

        try {
            container.scrollTop = 2_400;
            internals._scheduleVirtualWindowHydration(container);

            runNextFrame();
            expect(applyWindow).not.toHaveBeenCalled();
            runNextFrame();

            expect(applyWindow).toHaveBeenCalledTimes(1);
            expect(applyWindow).toHaveBeenLastCalledWith(container.scrollTop, expect.any(Number));
        }
        finally {
            vi.unstubAllGlobals();
        }
    });

    it('routes Chromium scrollend through the same stable-paint hydration boundary', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const muya = new Muya(host, {
            markdown: paragraphs(PROGRESSIVE_RENDER_THRESHOLD + 400),
            virtualizeLargeDocuments: true,
        });
        editors.push(muya);

        muya.init();
        await muya.whenRenderComplete();
        const scrollPage = muya.editor.scrollPage!;
        const internals = scrollPage as unknown as {
            _virtualScrollContainer: HTMLElement | null;
            _virtualScrollEndHandler: (() => void) | null;
        };
        const container = internals._virtualScrollContainer;
        const scrollEndHandler = internals._virtualScrollEndHandler;
        if (!container || !scrollEndHandler)
            throw new Error('expected virtual scrollend handler');
        const applyWindow = vi.spyOn(scrollPage, 'updateVirtualWindowForViewport');
        applyWindow.mockClear();

        let nextFrameId = 1;
        const frames = new Map<number, FrameRequestCallback>();
        vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
            const id = nextFrameId++;
            frames.set(id, callback);
            return id;
        }));
        vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => {
            frames.delete(id);
        }));
        const runNextFrame = () => {
            const next = frames.entries().next().value as [number, FrameRequestCallback] | undefined;
            if (!next)
                throw new Error('expected hydration frame');
            const [id, callback] = next;
            frames.delete(id);
            callback(performance.now());
        };

        try {
            container.scrollTop = 2_400;
            scrollEndHandler();
            expect(applyWindow).not.toHaveBeenCalled();

            runNextFrame();
            expect(applyWindow).not.toHaveBeenCalled();
            runNextFrame();

            expect(applyWindow).toHaveBeenCalledTimes(1);
            expect(applyWindow).toHaveBeenLastCalledWith(container.scrollTop, expect.any(Number));
        }
        finally {
            vi.unstubAllGlobals();
        }
    });

    it('keeps block measurement active during resize-correction scrolls', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const muya = new Muya(host, {
            markdown: paragraphs(PROGRESSIVE_RENDER_THRESHOLD + 120),
            virtualizeLargeDocuments: true,
        });
        editors.push(muya);

        muya.init();
        await muya.whenRenderComplete();
        const scrollPage = muya.editor.scrollPage!;
        const internals = scrollPage as unknown as {
            _virtualScrollContainer: HTMLElement | null;
            _virtualScrollHandler: (() => void) | null;
            _virtualResizeCorrectionTarget: number | null;
            _deferVirtualBlockMeasurement: () => void;
        };
        const container = internals._virtualScrollContainer;
        const handler = internals._virtualScrollHandler;
        if (!container || !handler)
            throw new Error('expected virtual scroll handler');

        const defer = vi.spyOn(internals, '_deferVirtualBlockMeasurement');
        container.scrollTop = 120;
        internals._virtualResizeCorrectionTarget = 120;

        handler();

        expect(defer).not.toHaveBeenCalled();
    });

    it('adopts a programmatic scroll as the new viewport anchor before any resize correction starts', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const muya = new Muya(host, {
            markdown: paragraphs(PROGRESSIVE_RENDER_THRESHOLD + 400),
            virtualizeLargeDocuments: true,
        });
        editors.push(muya);

        muya.init();
        await muya.whenRenderComplete();
        const scrollPage = muya.editor.scrollPage!;
        const internals = scrollPage as unknown as {
            _virtualScrollContainer: HTMLElement | null;
            _virtualScrollHandler: (() => void) | null;
            _virtualViewportAnchorIndex: number | null;
            _virtualViewportAnchorOffset: number | null;
            _virtualViewportAnchorExact: boolean;
            _virtualResizeCorrectionTarget: number | null;
            _virtualUserScrollIntent: boolean;
        };
        const container = internals._virtualScrollContainer;
        const handler = internals._virtualScrollHandler;
        if (!container || !handler)
            throw new Error('expected virtual scroll handler');

        internals._virtualViewportAnchorIndex = 0;
        internals._virtualViewportAnchorOffset = 0;
        internals._virtualViewportAnchorExact = true;
        internals._virtualResizeCorrectionTarget = null;
        internals._virtualUserScrollIntent = false;
        container.scrollTop = 2_400;

        handler();

        expect(internals._virtualViewportAnchorExact).toBe(false);
        expect(internals._virtualViewportAnchorIndex).not.toBe(0);
    });

    it('uses the mounted anchor DOM geometry for resize correction before prefix estimates', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const muya = new Muya(host, {
            markdown: paragraphs(PROGRESSIVE_RENDER_THRESHOLD + 120),
            virtualizeLargeDocuments: true,
        });
        editors.push(muya);

        muya.init();
        await muya.whenRenderComplete();
        const scrollPage = muya.editor.scrollPage!;
        const internals = scrollPage as unknown as {
            _virtualScrollContainer: HTMLElement | null;
            _virtualBlocks: Array<{ domNode?: HTMLElement | null }>;
            _virtualResizeScrollTopFromMountedAnchor: (
                container: HTMLElement,
                index: number,
                viewportOffset: number,
            ) => number | null;
        };
        const container = internals._virtualScrollContainer;
        if (!container)
            throw new Error('expected virtual scroll container');
        const index = 2;
        const node = internals._virtualBlocks[index]?.domNode;
        if (!(node instanceof HTMLElement))
            throw new Error('expected mounted anchor block');

        container.scrollTop = 1_000;
        vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({ top: 20 } as DOMRect);
        vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({ top: 170 } as DOMRect);

        expect(internals._virtualResizeScrollTopFromMountedAnchor(container, index, 50)).toBe(1_100);
    });

    it('keeps the active resize anchor pinned while the virtual window hydrates elsewhere', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const muya = new Muya(host, {
            markdown: paragraphs(PROGRESSIVE_RENDER_THRESHOLD + 180),
            virtualizeLargeDocuments: true,
        });
        editors.push(muya);

        muya.init();
        await muya.whenRenderComplete();
        const scrollPage = muya.editor.scrollPage!;
        const internals = scrollPage as unknown as {
            _virtualResizeAnchorIndex: number | null;
            _virtualResizeCorrectionTarget: number | null;
            _virtualPinnedRanges: () => Array<{ start: number; end: number }>;
        };

        internals._virtualResizeAnchorIndex = 37;
        internals._virtualResizeCorrectionTarget = 1_000;

        expect(internals._virtualPinnedRanges()).toEqual(expect.arrayContaining([
            { start: 37, end: 38 },
        ]));
    });

    it('refreshes the resize correction target from live mounted-anchor geometry on each settle frame', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const muya = new Muya(host, {
            markdown: paragraphs(PROGRESSIVE_RENDER_THRESHOLD + 120),
            virtualizeLargeDocuments: true,
        });
        editors.push(muya);

        muya.init();
        await muya.whenRenderComplete();
        const scrollPage = muya.editor.scrollPage!;
        const internals = scrollPage as unknown as {
            _virtualScrollContainer: HTMLElement | null;
            _virtualResizeAnchorIndex: number | null;
            _virtualResizeAnchorOffset: number | null;
            _virtualResizeScrollTopFromMountedAnchor: (container: HTMLElement, index: number, offset: number) => number | null;
            _settleVirtualResizeScroll: (container: HTMLElement, target: number) => void;
        };
        const container = document.createElement('div');
        internals._virtualScrollContainer = container;
        internals._virtualResizeAnchorIndex = 2;
        internals._virtualResizeAnchorOffset = 50;
        container.scrollTop = 1_000;

        const settleFrame: { current: FrameRequestCallback | null } = { current: null };
        const request = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
            settleFrame.current = callback;
            return 1;
        });
        const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined);
        const liveTarget = vi.spyOn(internals, '_virtualResizeScrollTopFromMountedAnchor').mockReturnValue(1_234);
        try {
            internals._settleVirtualResizeScroll(container, 1_000);
            const frame = settleFrame.current;
            if (!frame)
                throw new Error('expected resize settle frame');
            frame(0);

            expect(liveTarget).toHaveBeenCalledWith(container, 2, 50);
            expect(container.scrollTop).toBe(1_234);
        }
        finally {
            liveTarget.mockRestore();
            request.mockRestore();
            cancel.mockRestore();
        }
    });

    it('updates an active resize transaction target without scheduling a competing correction frame', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const muya = new Muya(host, {
            markdown: paragraphs(PROGRESSIVE_RENDER_THRESHOLD + 80),
            virtualizeLargeDocuments: true,
        });
        editors.push(muya);

        muya.init();
        await muya.whenRenderComplete();
        const scrollPage = muya.editor.scrollPage!;
        const internals = scrollPage as unknown as {
            _settleVirtualResizeScroll: (container: HTMLElement, target: number) => void;
            _virtualResizeCorrectionTarget: number | null;
        };
        const container = document.createElement('div');
        const request = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 1);
        const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined);
        try {
            internals._settleVirtualResizeScroll(container, 100);
            expect(internals._virtualResizeCorrectionTarget).toBe(100);
            expect(request).toHaveBeenCalledTimes(1);

            internals._settleVirtualResizeScroll(container, 200);

            expect(internals._virtualResizeCorrectionTarget).toBe(200);
            expect(request).toHaveBeenCalledTimes(1);
        }
        finally {
            request.mockRestore();
            cancel.mockRestore();
        }
    });

    it('keeps the resize transaction authoritative for a late synthetic scroll instead of expiring by wall clock', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const muya = new Muya(host, {
            markdown: paragraphs(PROGRESSIVE_RENDER_THRESHOLD + 120),
            virtualizeLargeDocuments: true,
        });
        editors.push(muya);

        muya.init();
        await muya.whenRenderComplete();
        const scrollPage = muya.editor.scrollPage!;
        const internals = scrollPage as unknown as {
            _virtualScrollContainer: HTMLElement | null;
            _virtualScrollHandler: (() => void) | null;
            _virtualResizeAnchorIndex: number | null;
            _virtualResizeAnchorOffset: number | null;
            _virtualResizeCorrectionTarget: number | null;
            _settleVirtualResizeScroll: (container: HTMLElement, target: number) => void;
        };
        const container = internals._virtualScrollContainer;
        const handler = internals._virtualScrollHandler;
        if (!container || !handler)
            throw new Error('expected virtual scroll handler');

        internals._virtualResizeAnchorIndex = 2;
        internals._virtualResizeAnchorOffset = 50;
        const liveTarget = vi.spyOn(
            internals as unknown as {
                _virtualResizeScrollTopFromMountedAnchor: (container: HTMLElement, index: number, offset: number) => number | null;
            },
            '_virtualResizeScrollTopFromMountedAnchor',
        ).mockReturnValue(1_234);
        const settleFrame: { current: FrameRequestCallback | null } = { current: null };
        const request = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
            settleFrame.current = callback;
            return 1;
        });
        const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined);
        try {
            internals._settleVirtualResizeScroll(container, 1_234);
            const frame = settleFrame.current;
            if (!frame)
                throw new Error('expected resize settle frame');
            frame(0);

            container.scrollTop = 100;
            handler();

            expect(internals._virtualResizeCorrectionTarget).toBe(1_234);
            expect(container.scrollTop).toBe(1_234);
        }
        finally {
            liveTarget.mockRestore();
            request.mockRestore();
            cancel.mockRestore();
        }
    });

    it('releases the resize transaction when the host starts an explicit navigation', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const muya = new Muya(host, {
            markdown: paragraphs(PROGRESSIVE_RENDER_THRESHOLD + 120),
            virtualizeLargeDocuments: true,
        });
        editors.push(muya);

        muya.init();
        await muya.whenRenderComplete();
        const scrollPage = muya.editor.scrollPage!;
        const internals = scrollPage as unknown as {
            _virtualResizeCorrectionTarget: number | null;
            _virtualResizeAnchorIndex: number | null;
            _virtualResizeAnchorOffset: number | null;
            _virtualViewportAnchorExact: boolean;
        };
        internals._virtualResizeCorrectionTarget = 1_234;
        internals._virtualResizeAnchorIndex = 5;
        internals._virtualResizeAnchorOffset = 12;
        internals._virtualViewportAnchorExact = true;

        expect(scrollPage.revealBlock(0)).toBe(true);

        expect(internals._virtualResizeCorrectionTarget).toBeNull();
        expect(internals._virtualResizeAnchorIndex).toBeNull();
        expect(internals._virtualResizeAnchorOffset).toBeNull();
        expect(internals._virtualViewportAnchorExact).toBe(false);
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
