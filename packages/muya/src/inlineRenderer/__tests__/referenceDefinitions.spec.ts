// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../muya';

const hosts: HTMLElement[] = [];

afterEach(() => {
    while (hosts.length)
        hosts.pop()?.remove();
});

function bootMuya(markdown: string): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { markdown } as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    hosts.push(muya.domNode);
    return muya;
}

describe('inline reference definition cache', () => {
    it('does not deep-scan the whole AST for repeated paragraph renders', () => {
        const paragraphs = Array.from(
            { length: 200 },
            (_, index) => `Paragraph ${index}`,
        ).join('\n\n');
        const muya = bootMuya(`[ref]: https://example.com/old\n\n${paragraphs}`);
        const body = muya.editor.scrollPage!.lastContentInDescendant()!;
        const getState = vi.spyOn(muya.editor.jsonState, 'getState');

        body.update();
        body.update();

        expect(getState).not.toHaveBeenCalled();
    });

    it('refreshes cached definitions only when a definition changes', () => {
        const muya = bootMuya('[ref]: https://example.com/old\n\nSee [reference][ref]\n');
        const definition = muya.editor.scrollPage!.firstContentInDescendant()!;
        const getState = vi.spyOn(muya.editor.jsonState, 'getState');

        definition.text = '[ref]: https://example.com/new';
        definition.update();

        expect(getState).not.toHaveBeenCalled();
        expect(muya.editor.inlineRenderer.labels.get('ref')?.href).toBe('https://example.com/new');
    });

    it('invalidates cached definitions when a definition block is removed', () => {
        const muya = bootMuya('[ref]: https://example.com/old\n\nSee [reference][ref]\n');
        const definition = muya.editor.scrollPage!.firstChild!;
        definition.remove();

        const body = muya.editor.scrollPage!.lastContentInDescendant()!;
        body.update();

        expect(muya.editor.inlineRenderer.labels.has('ref')).toBe(false);
    });

    it('invalidates cached definitions when replacing the document', () => {
        const muya = bootMuya('Plain text');
        const getState = vi.spyOn(muya.editor.jsonState, 'getState');

        muya.setContent('[a][r]\n\n[r]: https://example.com/replaced\n');

        expect(getState).not.toHaveBeenCalled();
        expect(muya.domNode.querySelector('a.mu-reference-link')?.getAttribute('href'))
            .toBe('https://example.com/replaced');
    });
});
