// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../muya';

const mountedEditors: Muya[] = [];

afterEach(() => {
    while (mountedEditors.length) {
        const muya = mountedEditors.pop()!;
        muya.destroy();
        muya.domNode.remove();
    }
});

describe('inline renderer plain-text fast path', () => {
    it('does not invoke the inline renderer for a large plain paragraph', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const muya = new Muya(host, { markdown: 'seed\n' });
        muya.init();
        mountedEditors.push(muya);

        const output = vi.spyOn(muya.editor.inlineRenderer.renderer, 'output');
        const text = `Detail 299 keeps the paragraph plain.\n${'x'.repeat(18_000)}`;
        muya.setContent(text);

        expect(output).not.toHaveBeenCalled();
        expect(muya.domNode.querySelector('.mu-paragraph-content')?.textContent).toBe(text);
    });
});
