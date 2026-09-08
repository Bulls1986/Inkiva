import type { TState } from '@muyajs/core';
import { expect, test } from '../fixtures/muya';
import { editor } from '../helpers/selectors';

// marktext #3560: a wide rendered sequence-diagram <svg> overflowed the block
// and was clipped. The fix gives the fixed-size (no-viewBox) <svg> a viewBox
// derived from its width/height so `max-width: 100%` SCALES it to fit (rather
// than just clipping the box). A wide diagram must end up no wider than its
// block — i.e. fully visible, scaled down.
test('a wide sequence diagram scales to fit its block, not clipped (#3560)', async ({ page }) => {
    await page.evaluate(() => {
        // many actors + long messages → a diagram far wider than the editor
        const seq = Array.from({ length: 12 }, (_, i) =>
            `Actor${i}->Actor${i + 1}: ${'a reasonably long message '.repeat(8)}${i}`).join('\n');
        window.muya!.setContent([{
            name: 'diagram',
            text: seq,
            meta: { lang: 'yaml', type: 'sequence' },
        }] as TState[]);
    });

    const svg = page.locator(`${editor.diagramPreview} > svg`).first();
    await expect(svg).toBeAttached({ timeout: 15_000 });
    // A diagram keeps its source editor visible while active. Move through the
    // public editor focus seam so this layout assertion measures the rendered
    // preview, matching what a user sees after leaving the block.
    await page.evaluate(() => {
        window.muya!.editor.activeContentBlock = null;
    });
    await expect(svg).toBeVisible({ timeout: 15_000 });

    // the viewBox is added asynchronously (the diagram draws from a font-load
    // callback), so poll for it
    await expect.poll(() => svg.getAttribute('viewBox'), { timeout: 8_000 }).not.toBeNull();

    await expect.poll(() => page.evaluate((sel) => {
        const svgEl = document.querySelector(`${sel} > svg`) as SVGSVGElement;
        if (!svgEl) return { wideEnough: false, fits: false };
        const block = svgEl.closest('figure.mu-diagram-block') as HTMLElement;
        // the diagram is intrinsically wider than the block (otherwise the test
        // would pass trivially), yet renders no wider than the block (scaled).
        const intrinsic = svgEl.viewBox.baseVal.width;
        const rendered = svgEl.getBoundingClientRect().width;
        const blockWidth = block.getBoundingClientRect().width;
        return { wideEnough: intrinsic > blockWidth, fits: rendered <= blockWidth + 1 };
    }, editor.diagramPreview), { timeout: 8_000 }).toMatchObject({
        wideEnough: true,
        fits: true,
    });
});
