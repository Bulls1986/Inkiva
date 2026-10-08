// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { Muya } from '../../../muya';
import type Format from '../format';

describe('V06-03 transactional Markdown link destination', () => {
    it('edits the destination of an existing link without removing its label or title', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const muya = new Muya(host, { markdown: '[Guide](./old.md "Title")' });
        muya.init();
        const block = muya.editor.scrollPage!.firstContentInDescendant() as Format;
        muya.editor.activeContentBlock = block;
        (block as unknown as { getCursor: () => unknown }).getCursor = () => ({
            start: { offset: 3 }, end: { offset: 3 },
        });
        muya.editor.history.runUserOperation(() => {
            block.format('link', './docs/new.md');
        });
        expect(block.text).toBe('[Guide](./docs/new.md "Title")');
        muya.destroy();
        host.remove();
    });

    it('inserts a selected label and encoded destination in one Undo operation', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const muya = new Muya(host, { markdown: 'read here' });
        muya.init();
        const block = muya.editor.scrollPage!.firstContentInDescendant() as Format;
        muya.editor.activeContentBlock = block;
        // Happy DOM does not round-trip a noncollapsed native selection.
        // Drive the real format mutation with a focused logical range.
        (block as unknown as { getCursor: () => unknown }).getCursor = () => ({
            start: { offset: 0 }, end: { offset: 4 },
        });
        muya.editor.history.runUserOperation(() => {
            block.format('link', './docs/README%20v2.md');
        });
        expect(block.text).toBe('[read](./docs/README%20v2.md) here');
        muya.undo();
        expect(muya.getMarkdown().trim()).toBe('read here');
        muya.destroy();
        host.remove();
    });
});
