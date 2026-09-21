import { expect, test } from '../fixtures/muya';

const TOTAL_BLOCKS = 420;

function largeMarkdown(): string {
    return `${Array.from({ length: TOTAL_BLOCKS }, (_, index) => `production ${index}`).join('\n\n')}\n`;
}

test.describe('Stage C1 virtualization productionization', () => {
    test.beforeEach(async ({ page }) => {
        await page.evaluate(() => {
            const editor = document.querySelector<HTMLElement>('#editor')!;
            window.muya!.options.virtualizeLargeDocuments = true;
            const state = globalThis as typeof globalThis & {
                __INKIVA_VIRTUAL_RENDERER_PROTOTYPE__?: boolean;
            };
            delete state.__INKIVA_VIRTUAL_RENDERER_PROTOTYPE__;
            editor.style.minHeight = '0';
            editor.style.height = '720px';
            editor.style.overflowY = 'auto';
        });
        await page.evaluate(markdown => window.muya!.setContent(markdown), largeMarkdown());
        await page.evaluate(() => window.muya!.whenRenderComplete());
    });

    test('keeps offscreen and overscan media cold until it is actually visible', async ({ page }) => {
        const imageUrl = 'https://inkiva.test/virtual-offscreen.png';
        let imageRequests = 0;
        await page.route(imageUrl, async (route) => {
            imageRequests += 1;
            await route.fulfill({
                status: 200,
                contentType: 'image/png',
                body: Buffer.from(
                    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
                    'base64',
                ),
            });
        });

        const prefixCount = 260;
        const markdown = `${Array.from(
            { length: prefixCount },
            (_, index) => `media-prefix ${index}`,
        ).join('\n\n')}\n\n\`\`\`mermaid\ngraph TD\n  A --> B\n\`\`\`\n\n![virtual image](${imageUrl})\n`;
        await page.evaluate(content => window.muya!.setContent(content), markdown);
        await page.evaluate(() => window.muya!.whenRenderComplete());
        await page.waitForTimeout(600);

        const before = await page.evaluate((diagramIndex) => {
            const scrollPage = window.muya!.editor.scrollPage!;
            const diagram = scrollPage.find(diagramIndex)!;
            const preview = diagram.domNode!.querySelector<HTMLElement>('.mu-diagram-preview');
            return {
                snapshot: scrollPage.getVirtualizationSnapshot(),
                diagramConnected: diagram.domNode!.isConnected,
                diagramAttempts: Number(preview?.getAttribute('data-diagram-render-attempts') ?? '0'),
            };
        }, prefixCount);

        expect(before.snapshot.enabled).toBe(true);
        expect(before.diagramConnected).toBe(false);
        expect(before.diagramAttempts).toBe(0);
        expect(imageRequests).toBe(0);

        await page.evaluate((mediaIndex) => {
            const editor = document.querySelector<HTMLElement>('#editor')!;
            const scrollPage = window.muya!.editor.scrollPage!;
            const targetOffset = scrollPage.getVirtualBlockOffset(mediaIndex);
            if (targetOffset === null)
                throw new Error('expected virtual media offset');
            // Keep the media just below the viewport but within the one-viewport
            // overscan range. This verifies DOM mounting independently from
            // IntersectionObserver-driven media work.
            editor.scrollTop = Math.max(0, targetOffset - editor.clientHeight - 180);
            editor.dispatchEvent(new Event('scroll'));
        }, prefixCount);

        await expect.poll(async () => page.evaluate(({ diagramIndex, imageIndex }) => {
            const scrollPage = window.muya!.editor.scrollPage!;
            return Boolean(
                scrollPage.find(diagramIndex)?.domNode?.isConnected
                && scrollPage.find(imageIndex)?.domNode?.isConnected,
            );
        }, { diagramIndex: prefixCount, imageIndex: prefixCount + 1 })).toBe(true);

        const overscanState = await page.evaluate(({ diagramIndex, imageIndex }) => {
            const scrollPage = window.muya!.editor.scrollPage!;
            const diagram = scrollPage.find(diagramIndex)!;
            const image = scrollPage.find(imageIndex)!;
            return {
                snapshot: scrollPage.getVirtualizationSnapshot(),
                diagramConnected: diagram.domNode!.isConnected,
                imageConnected: image.domNode!.isConnected,
            };
        }, { diagramIndex: prefixCount, imageIndex: prefixCount + 1 });
        expect(overscanState.snapshot.mountedBlocks).toBeLessThan(overscanState.snapshot.totalBlocks);
        expect(overscanState.diagramConnected).toBe(true);
        expect(overscanState.imageConnected).toBe(true);
        expect(imageRequests).toBe(0);

        const mediaVisible = await page.evaluate(async (imageIndex) => {
            const editor = document.querySelector<HTMLElement>('#editor')!;
            for (let attempt = 0; attempt < 8; attempt += 1) {
                const image = window.muya!.editor.scrollPage!.find(imageIndex)!;
                const lazy = image.domNode!.querySelector<HTMLElement>('[data-image-lazy]');
                if (!lazy)
                    return true;

                const lazyRect = lazy.getBoundingClientRect();
                const editorRect = editor.getBoundingClientRect();
                const visible = lazyRect.bottom > editorRect.top + 64
                    && lazyRect.top < editorRect.bottom - 64;
                if (visible)
                    return true;

                const lazyCenter = (lazyRect.top + lazyRect.bottom) / 2;
                const editorCenter = (editorRect.top + editorRect.bottom) / 2;
                editor.scrollTop += lazyCenter - editorCenter;
                editor.dispatchEvent(new Event('scroll'));
                await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            }
            return false;
        }, prefixCount + 1);
        expect(mediaVisible).toBe(true);

        await expect.poll(() => imageRequests, { timeout: 10_000 }).toBeGreaterThan(0);
        await expect.poll(async () => page.evaluate((diagramIndex) => {
            const diagram = window.muya!.editor.scrollPage!.find(diagramIndex)!;
            const preview = diagram.domNode!.querySelector<HTMLElement>('.mu-diagram-preview');
            return Number(preview?.getAttribute('data-diagram-render-attempts') ?? '0');
        }, prefixCount), { timeout: 10_000 }).toBeGreaterThan(0);
    });

    test('is enabled without a prototype flag and responds to viewport resize', async ({ page }) => {
        const initial = await page.evaluate(() =>
            window.muya!.editor.scrollPage!.getVirtualizationSnapshot(),
        );

        expect(initial.enabled).toBe(true);
        expect(initial.totalBlocks).toBe(TOTAL_BLOCKS);
        expect(initial.mountedBlocks).toBeLessThan(TOTAL_BLOCKS);
        expect(initial.materializedBlocks).toBeLessThan(TOTAL_BLOCKS / 2);
        expect(initial.retainedDetachedDomBlocks).toBeLessThan(16);

        await page.evaluate(() => {
            const editor = document.querySelector<HTMLElement>('#editor')!;
            editor.style.height = '320px';
        });
        await page.waitForTimeout(100);

        const compact = await page.evaluate(() =>
            window.muya!.editor.scrollPage!.getVirtualizationSnapshot(),
        );
        expect(compact.viewportHeight).toBeLessThanOrEqual(320);
        expect(compact.mountedBlocks).toBeLessThanOrEqual(initial.mountedBlocks);
    });

    test('keeps wheel scrolling monotonic across multiple asynchronously rendered diagrams', async ({ page }) => {
        const tallMermaid = (prefix: string) => [
            'graph TD',
            ...Array.from({ length: 18 }, (_, index) =>
                index === 0
                    ? `  ${prefix}0[${prefix} 0] --> ${prefix}1[${prefix} 1]`
                    : index < 17
                        ? `  ${prefix}${index} --> ${prefix}${index + 1}[${prefix} ${index + 1}]`
                        : '',
            ).filter(Boolean),
        ].join('\n');
        const spacer = (label: string, count: number) =>
            Array.from({ length: count }, (_, index) => `${label} ${index}`).join('\n\n');
        const markdown = [
            spacer('before-first-diagram', 80),
            `\`\`\`mermaid\n${tallMermaid('A')}\n\`\`\``,
            spacer('between-diagrams', 90),
            `\`\`\`mermaid\n${tallMermaid('B')}\n\`\`\``,
            spacer('after-second-diagram', 80),
        ].join('\n\n');

        await page.evaluate(content => window.muya!.setContent(content), markdown);
        await page.evaluate(() => window.muya!.whenRenderComplete());

        const editor = page.locator('#editor');
        await editor.hover();

        let previous = 0;
        let maxSeen = 0;
        const renderedDiagramSvgs = new Set<string>();
        for (let step = 0; step < 80; step += 1) {
            await page.mouse.wheel(0, 360);
            await page.waitForTimeout(40);
            const readSample = () => page.evaluate(() => {
                const editor = document.querySelector<HTMLElement>('#editor')!;
                const editorRect = editor.getBoundingClientRect();
                const visiblePendingDiagram = Array.from(
                    document.querySelectorAll<HTMLElement>('.mu-diagram-preview[data-diagram-lazy]'),
                ).some((preview) => {
                    const rect = preview.getBoundingClientRect();
                    return rect.bottom > editorRect.top && rect.top < editorRect.bottom;
                });
                return {
                    scrollTop: editor.scrollTop,
                    visiblePendingDiagram,
                    renderedDiagramSvgs: Array.from(
                        document.querySelectorAll<SVGElement>('.mu-diagram-preview > svg'),
                    ).map(svg => svg.outerHTML),
                };
            });
            let sample = await readSample();
            if (sample.visiblePendingDiagram) {
                // DiagramPreview deliberately waits for four quiet paint frames
                // plus its debounce before expensive rendering. Pause only while
                // a pending diagram is genuinely visible so the test exercises
                // the asynchronous height correction without making fast
                // offscreen scrolling render cold diagrams.
                await page.waitForTimeout(350);
                sample = await readSample();
            }

            // A small sub-pixel adjustment is harmless, but the viewport must
            // never jump back to a previously rendered diagram while the user
            // is actively wheel-scrolling downward.
            expect(sample.scrollTop).toBeGreaterThanOrEqual(previous - 2);
            previous = sample.scrollTop;
            maxSeen = Math.max(maxSeen, sample.scrollTop);
            sample.renderedDiagramSvgs.forEach(svg => renderedDiagramSvgs.add(svg));
        }

        // Virtualization may never keep both diagrams mounted at once. Across
        // the downward traversal we must nevertheless encounter two distinct
        // rendered SVG results, proving the wheel path crossed both diagrams.
        expect(renderedDiagramSvgs.size).toBeGreaterThanOrEqual(2);
        expect(maxSeen).toBeGreaterThan(5_000);
        expect(previous).toBeGreaterThan(maxSeen - 800);
    });
});
