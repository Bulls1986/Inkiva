import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/muya';
import { getMarkdown } from '../helpers/api';
import { slowType } from '../helpers/keyboard';
import { editor } from '../helpers/selectors';

/**
 * Real-Chromium regression for the PR3 conversion of the format / code-block
 * cursor handlers from `this.selection.setSelection(...)` to
 * `this.setCursor(...)`. Exercises the two user paths that now flow through
 * `setCursor`:
 *   - typing a character (paragraph `inputHandler` -> `setCursor`), and
 *   - shift+Arrow extending a selection (`keyupHandler` -> `setCursor`),
 * asserting the typed text lands and the resulting caret / selection offsets
 * are exactly where the keystrokes placed them.
 *
 * Caret placement uses a real DOM Range so the click lands on an exact text
 * offset; selection state is read from muya's public selection API. Drives the
 * suite's `expect.poll` idiom — no raw sleeps.
 */

interface SelectionSnapshot {
    anchorText: string | null;
    focusText: string | null;
    anchorOffset: number | null;
    focusOffset: number | null;
    isCollapsed: boolean | null;
}

async function readSelection(page: Page): Promise<SelectionSnapshot> {
    return page.evaluate(() => {
        const sel = window.muya!.editor.selection;
        const live = sel.getSelection();
        return {
            anchorText: sel.anchorBlock?.text ?? null,
            focusText: sel.focusBlock?.text ?? null,
            anchorOffset: sel.anchor?.offset ?? null,
            focusOffset: sel.focus?.offset ?? null,
            isCollapsed: live ? live.isCollapsed : null,
        };
    });
}

// Place the browser selection at an exact text offset. Clicking the centre of
// a whitespace character is font-dependent: after the editor switches to the
// reference serif stack Chromium can resolve the same click one character to
// the right. Dispatching the real click path after setting the native range
// keeps this test on the same Muya selection/update route without relying on
// pixel geometry.
async function placeCaretAtChar(
    page: Page,
    selector: string,
    paragraphIndex: number,
    charOffset: number,
): Promise<void> {
    await page.evaluate(
        ({ selector, paragraphIndex, charOffset }) => {
            const p = document.querySelectorAll(selector)[paragraphIndex] as HTMLElement;
            const textNode = document.createTreeWalker(p, NodeFilter.SHOW_TEXT).nextNode()!;
            const editor = window.muya!.domNode as HTMLElement;
            editor.focus();
            const range = document.createRange();
            range.setStart(textNode, charOffset);
            range.collapse(true);
            const selection = window.getSelection()!;
            selection.removeAllRanges();
            selection.addRange(range);
            textNode.parentElement!.dispatchEvent(new MouseEvent('click', {
                bubbles: true,
                button: 0,
                clientX: 0,
                clientY: 0,
            }));
        },
        { selector, paragraphIndex, charOffset },
    );
}

test.describe('selection setcursor regression', () => {
    test('typing routes through setCursor and lands the character at the caret', async ({ page }) => {
        await page.evaluate(() => window.muya!.setContent('hello world\n'));
        const para = page.locator(editor.paragraph).first();
        await expect(para).toBeVisible();

        // Click between "hello" and " world" (offset 5), then type 'X'.
        await placeCaretAtChar(page, editor.paragraph, 0, 5);
        await slowType(page, 'X');

        await expect(para).toContainText('helloX world');
        expect(await getMarkdown(page)).toContain('helloX world');

        // After inputHandler -> setCursor the caret is collapsed right after the
        // inserted 'X' (offset 6).
        await expect.poll(() => readSelection(page).then(s => s.anchorOffset)).toBe(6);
        const snap = await readSelection(page);
        expect(snap.focusOffset).toBe(6);
        expect(snap.isCollapsed).toBe(true);
        expect(snap.anchorText).toBe('helloX world');
    });

    test('shift+Arrow extends a selection that survives setCursor', async ({ page }) => {
        await page.evaluate(() => window.muya!.setContent('hello world\n'));
        const para = page.locator(editor.paragraph).first();
        await expect(para).toBeVisible();

        // Caret after "hello" (offset 5), then extend two chars to the right.
        await placeCaretAtChar(page, editor.paragraph, 0, 5);
        await expect.poll(() => readSelection(page).then(s => s.anchorOffset)).toBe(5);

        await page.keyboard.press('Shift+ArrowRight');
        await page.keyboard.press('Shift+ArrowRight');

        // Forward selection from 5 to 7 (anchor stays at 5, focus advances).
        await expect.poll(() => readSelection(page).then(s => s.focusOffset)).toBe(7);
        const forward = await readSelection(page);
        expect(forward.anchorOffset).toBe(5);
        expect(forward.isCollapsed).toBe(false);
        expect(forward.anchorText).toBe('hello world');

        // Now collapse and extend LEFT to build a backward selection: the anchor
        // sits AFTER the focus, which must survive the setCursor round-trip.
        await page.keyboard.press('ArrowRight');
        await expect.poll(() => readSelection(page).then(s => s.anchorOffset)).toBe(7);
        await page.keyboard.press('Shift+ArrowLeft');
        await page.keyboard.press('Shift+ArrowLeft');

        await expect.poll(() => readSelection(page).then(s => s.focusOffset)).toBe(5);
        const backward = await readSelection(page);
        expect(backward.anchorOffset).toBe(7);
        expect(backward.isCollapsed).toBe(false);
        // anchor (7) is after focus (5): a genuine backward selection.
        expect(backward.anchorOffset).toBeGreaterThan(backward.focusOffset!);
    });
});
