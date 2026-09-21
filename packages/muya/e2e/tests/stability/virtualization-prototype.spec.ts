import { expect, test } from '../fixtures/muya';

const TOTAL_BLOCKS = 360;

function largeMarkdown(needleIndex = TOTAL_BLOCKS - 12): string {
    return `${Array.from({ length: TOTAL_BLOCKS }, (_, index) => {
        const suffix = index === needleIndex ? ' needle-target' : '';
        return `paragraph ${index}${suffix}`;
    }).join('\n\n')}\n`;
}

test.describe('Stage C0 virtualization prototype', () => {
    test.beforeEach(async ({ page }) => {
        await page.evaluate(() => {
            (globalThis as typeof globalThis & {
                __INKIVA_VIRTUAL_RENDERER_PROTOTYPE__?: boolean;
            }).__INKIVA_VIRTUAL_RENDERER_PROTOTYPE__ = true;
            const editor = document.querySelector<HTMLElement>('#editor')!;
            editor.style.height = '600px';
            editor.style.overflowY = 'auto';
        });
        await page.evaluate((markdown) => window.muya!.setContent(markdown), largeMarkdown());
        await page.evaluate(() => window.muya!.whenRenderComplete());
    });

    test('keeps DOM bounded while scrolling top-middle-bottom-top without geometry drift', async ({ page }) => {
        const initial = await page.evaluate(() => {
            window.muya!.editor.activeContentBlock = null;
            window.muya!.editor.selection.clear();
            return window.muya!.editor.scrollPage!.getVirtualizationPrototypeSnapshot();
        });

        expect(initial.enabled).toBe(true);
        expect(initial.totalBlocks).toBe(TOTAL_BLOCKS);
        expect(initial.mountedBlocks).toBeLessThan(TOTAL_BLOCKS);

        const traverse = async () => {
            const samples = [];
            for (const fraction of [0, 0.5, 1, 0]) {
                await page.evaluate((targetFraction) => {
                    const editor = document.querySelector<HTMLElement>('#editor')!;
                    editor.scrollTop = (editor.scrollHeight - editor.clientHeight) * targetFraction;
                }, fraction);
                await page.waitForTimeout(50);
                samples.push(await page.evaluate(() => {
                    const editor = document.querySelector<HTMLElement>('#editor')!;
                    return {
                        snapshot: window.muya!.editor.scrollPage!.getVirtualizationPrototypeSnapshot(),
                        scrollTop: editor.scrollTop,
                        scrollHeight: editor.scrollHeight,
                        clientHeight: editor.clientHeight,
                    };
                }));
            }
            return samples;
        };

        // The first traversal intentionally lets real block measurements
        // replace estimates. Geometry must be stable when the same virtual
        // windows are traversed again.
        await traverse();
        const samples = await traverse();

        expect(samples[1]!.snapshot.windowStart).toBeGreaterThan(0);
        expect(samples[2]!.snapshot.windowEnd).toBe(TOTAL_BLOCKS);
        expect(samples[3]!.snapshot.windowStart).toBe(0);
        for (const sample of samples) {
            expect(sample.snapshot.mountedBlocks).toBeLessThan(TOTAL_BLOCKS);
            expect(sample.snapshot.totalEstimatedHeight).toBeGreaterThan(sample.clientHeight);
            expect(sample.scrollHeight).toBeGreaterThanOrEqual(sample.clientHeight);
        }
        // Once those windows have been measured, returning to the same top
        // viewport must reproduce the same scroll geometry without drift.
        expect(samples[0]!.scrollHeight).toBe(samples[3]!.scrollHeight);
    });

    test('preserves native cross-block selection and Ctrl+A without Selection/Range errors', async ({ page }) => {
        const pageErrors: string[] = [];
        page.on('pageerror', error => pageErrors.push(error.message));

        const crossBlock = await page.evaluate(() => {
            const scrollPage = window.muya!.editor.scrollPage!;
            const first = scrollPage.find(0)!.firstContentInDescendant()!;
            const far = scrollPage.find(240)!.firstContentInDescendant()!;
            window.muya!.editor.selection.setSelection(
                { offset: 0, block: first, path: first.path },
                { offset: far.text.length, block: far, path: far.path },
            );
            const nativeSelection = document.getSelection();
            return {
                anchorConnected: first.outMostBlock!.domNode!.isConnected,
                focusConnected: far.outMostBlock!.domNode!.isConnected,
                rangeCount: nativeSelection?.rangeCount ?? 0,
                textLength: nativeSelection?.toString().length ?? 0,
            };
        });

        expect(crossBlock.anchorConnected).toBe(true);
        expect(crossBlock.focusConnected).toBe(true);
        expect(crossBlock.rangeCount).toBe(1);
        expect(crossBlock.textLength).toBeGreaterThan(0);

        const selectAll = await page.evaluate(() => {
            window.muya!.selectAll();
            const scrollPage = window.muya!.editor.scrollPage!;
            const nativeSelection = document.getSelection();
            return {
                mounted: scrollPage.getVirtualizationPrototypeSnapshot().mountedBlocks,
                lastConnected: scrollPage.lastChild!.domNode!.isConnected,
                rangeCount: nativeSelection?.rangeCount ?? 0,
                text: nativeSelection?.toString() ?? '',
            };
        });

        expect(selectAll.mounted).toBeLessThan(TOTAL_BLOCKS / 2);
        expect(selectAll.lastConnected).toBe(true);
        expect(selectAll.rangeCount).toBe(1);
        expect(selectAll.text).toContain(`paragraph ${TOTAL_BLOCKS - 1}`);
        expect(pageErrors.filter(message => /InvalidStateError|Selection|Range/i.test(message))).toEqual([]);
    });

    test('mounts offscreen Find targets and pins a composing block until compositionend', async ({ page }) => {
        const pageErrors: string[] = [];
        page.on('pageerror', error => pageErrors.push(error.message));

        const found = await page.evaluate(async () => {
            const search = await window.muya!.editor.searchModule.searchAsync(
                'needle-target',
                { selectHighlight: true },
            );
            const match = search.matches[0];
            return {
                count: search.matches.length,
                connected: match?.block.outMostBlock?.domNode?.isConnected === true,
                selected: window.muya!.editor.selection.anchorBlock === match?.block,
            };
        });
        expect(found.count).toBe(1);
        expect(found.connected).toBe(true);
        expect(found.selected).toBe(true);

        const pinnedDuringComposition = await page.evaluate(() => {
            const scrollPage = window.muya!.editor.scrollPage!;
            const composing = scrollPage.find(36)!.firstContentInDescendant()!;
            composing.setCursor(0, 0, true);
            const node = composing.domNode!;
            const original = composing.text;
            node.dispatchEvent(new CompositionEvent('compositionstart', {
                bubbles: true,
                cancelable: true,
                data: '',
            }));
            node.textContent = `${original}nihao`;
            node.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                data: 'nihao',
                inputType: 'insertCompositionText',
                isComposing: true,
            }));
            scrollPage.updateVirtualWindowForViewport(6_000, 600);
            const pinned = composing.outMostBlock!.domNode!.isConnected;

            const finalText = `${original}你好`;
            node.textContent = finalText;
            const textNode = node.firstChild!;
            const range = document.createRange();
            range.setStart(textNode, finalText.length);
            range.collapse(true);
            const nativeSelection = document.getSelection()!;
            nativeSelection.removeAllRanges();
            nativeSelection.addRange(range);
            node.dispatchEvent(new CompositionEvent('compositionend', {
                bubbles: true,
                cancelable: true,
                data: '你好',
            }));
            node.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                data: '你好',
                inputType: 'insertCompositionText',
                isComposing: false,
            }));
            return pinned;
        });

        expect(pinnedDuringComposition).toBe(true);
        await expect.poll(async () => page.evaluate(() => {
            const composing = window.muya!.editor.scrollPage!.find(36)!.firstContentInDescendant()!;
            return composing.text.includes('你好') && window.muya!.getMarkdown().includes('你好');
        })).toBe(true);

        const detachedAfterComposition = await page.evaluate(() => {
            const scrollPage = window.muya!.editor.scrollPage!;
            const composing = scrollPage.find(36)!.firstContentInDescendant()!;
            const viewportBlock = scrollPage.find(260)!.firstContentInDescendant()!;
            viewportBlock.setCursor(0, 0, true);
            scrollPage.updateVirtualWindowForViewport(6_000, 600);
            return !(composing.outMostBlock!.domNode?.isConnected ?? false);
        });
        expect(detachedAfterComposition).toBe(true);
        expect(pageErrors.filter(message => /InvalidStateError|Selection|Range/i.test(message))).toEqual([]);
    });

    test('keeps virtualization active across rebuild Undo/Redo', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const before = window.muya!.getMarkdown();
            const after = before.replaceAll('paragraph', 'changed');
            window.muya!.replaceContent(after);
            await window.muya!.whenRenderComplete();
            const afterSnapshot = window.muya!.editor.scrollPage!.getVirtualizationPrototypeSnapshot();

            window.muya!.undo();
            await window.muya!.whenRenderComplete();
            const undoMarkdown = window.muya!.getMarkdown();
            const undoSnapshot = window.muya!.editor.scrollPage!.getVirtualizationPrototypeSnapshot();

            window.muya!.redo();
            await window.muya!.whenRenderComplete();
            const redoMarkdown = window.muya!.getMarkdown();
            const redoSnapshot = window.muya!.editor.scrollPage!.getVirtualizationPrototypeSnapshot();
            return { afterSnapshot, undoMarkdown, undoSnapshot, redoMarkdown, redoSnapshot };
        });

        expect(result.undoMarkdown).toContain('paragraph 0');
        expect(result.redoMarkdown).toContain('changed 0');
        expect(result.afterSnapshot.mountedBlocks).toBeLessThan(TOTAL_BLOCKS);
        expect(result.undoSnapshot.mountedBlocks).toBeLessThan(TOTAL_BLOCKS);
        expect(result.redoSnapshot.mountedBlocks).toBeLessThan(TOTAL_BLOCKS);
    });
});
