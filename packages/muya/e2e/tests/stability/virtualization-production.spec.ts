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
            const targetOffset = mediaIndex * 24;
            editor.scrollTop = Math.max(0, targetOffset - editor.clientHeight / 2);
            editor.dispatchEvent(new Event('scroll'));
        }, prefixCount);

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
});
