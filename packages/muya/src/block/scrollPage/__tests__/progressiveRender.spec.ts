// @vitest-environment happy-dom

import type Parent from '../../base/parent';
import { afterEach, describe, expect, it } from 'vitest';
import { Muya } from '../../../muya';
import {
    PROGRESSIVE_RENDER_INITIAL_BLOCKS,
    PROGRESSIVE_RENDER_THRESHOLD,
    ScrollPage,
} from '../index';

const mountedEditors: Muya[] = [];

afterEach(() => {
    while (mountedEditors.length) {
        const muya = mountedEditors.pop()!;
        muya.destroy();
        muya.domNode.remove();
    }
});

function paragraphs(count: number): string {
    return `${Array.from({ length: count }, (_, index) => `paragraph ${index}`).join('\n\n')}\n`;
}

describe('scrollPage progressive rendering', () => {
    it('mounts only the initial block window before completing in the background', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const muya = new Muya(host, { markdown: paragraphs(PROGRESSIVE_RENDER_THRESHOLD + 20) });
        mountedEditors.push(muya);

        muya.init();

        const scrollPage = muya.editor.scrollPage!;
        expect(scrollPage.children.length).toBe(PROGRESSIVE_RENDER_INITIAL_BLOCKS);
        expect(scrollPage.isProgressiveRenderPending()).toBe(true);
        expect(scrollPage.domNode!.querySelectorAll('.mu-paragraph')).toHaveLength(
            PROGRESSIVE_RENDER_INITIAL_BLOCKS,
        );

        await muya.whenRenderComplete();

        expect(scrollPage.isProgressiveRenderPending()).toBe(false);
        expect(scrollPage.children.length).toBe(PROGRESSIVE_RENDER_THRESHOLD + 20);
        expect(scrollPage.domNode!.querySelectorAll('.mu-paragraph')).toHaveLength(
            PROGRESSIVE_RENDER_THRESHOLD + 20,
        );
    });

    it('cancels stale progressive work when content is replaced', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const muya = new Muya(host, { markdown: paragraphs(PROGRESSIVE_RENDER_THRESHOLD + 20) });
        mountedEditors.push(muya);

        muya.init();
        muya.setContent('replacement\n');
        await muya.whenRenderComplete();

        const scrollPage = muya.editor.scrollPage!;
        expect(scrollPage.isProgressiveRenderPending()).toBe(false);
        expect(scrollPage.children.length).toBe(1);
        expect(scrollPage.firstContentInDescendant()!.text).toBe('replacement');
        expect(scrollPage.domNode!.querySelectorAll('.mu-paragraph')).toHaveLength(1);
    });

    it('keeps immediate cursor restoration on a complete tree', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const targetIndex = PROGRESSIVE_RENDER_THRESHOLD + 10;
        const muya = new Muya(host, { markdown: paragraphs(targetIndex + 1) });
        mountedEditors.push(muya);

        muya.init();
        const restored = muya.setCursorByOffset({
            anchor: { line: targetIndex * 2, ch: 5 },
            focus: { line: targetIndex * 2, ch: 5 },
        });

        expect(restored).toBe(true);
        expect(muya.editor.scrollPage!.isProgressiveRenderPending()).toBe(false);
        expect(muya.editor.selection.getSelection()!.anchor.block.text).toBe(
            `paragraph ${targetIndex}`,
        );
    });

    it('keeps a user-inserted top-level block before the progressive tail', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const muya = new Muya(host, { markdown: paragraphs(PROGRESSIVE_RENDER_THRESHOLD + 20) });
        mountedEditors.push(muya);

        muya.init();

        const inserted = ScrollPage.loadBlock('paragraph').create(muya, {
            name: 'paragraph',
            text: 'inserted while rendering',
        });
        muya.editor.scrollPage!.append(inserted, 'user');

        await muya.whenRenderComplete();
        muya.flush();

        const texts = Array.from(muya.editor.scrollPage!.children.iterator())
            .map(block => (block as Parent).firstContentInDescendant()?.text);
        expect(texts[PROGRESSIVE_RENDER_INITIAL_BLOCKS]).toBe('inserted while rendering');
        expect(texts[PROGRESSIVE_RENDER_INITIAL_BLOCKS + 1]).toBe('paragraph 32');
        expect(Array.from(muya.editor.scrollPage!.domNode!.children)
            .map(node => node.textContent)
            .filter(text => text === 'inserted while rendering' || text === 'paragraph 32'))
            .toEqual(['inserted while rendering', 'paragraph 32']);
    });
});
