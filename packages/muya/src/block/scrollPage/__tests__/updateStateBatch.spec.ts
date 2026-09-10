// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../../muya';

const mountedEditors: Muya[] = [];

function bootMuya(markdown: string): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { markdown } as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    mountedEditors.push(muya);
    return muya;
}

afterEach(() => {
    while (mountedEditors.length) {
        const muya = mountedEditors.pop()!;
        muya.destroy();
        muya.domNode.remove();
    }
});

describe('scrollPage.updateState DOM mounting', () => {
    it('mounts a replacement document through a single document fragment', () => {
        const muya = bootMuya('old document\n');
        const scrollPage = muya.editor.scrollPage!;
        const appendChild = vi.spyOn(scrollPage.domNode!, 'appendChild');
        muya.setContent(
            `${Array.from({ length: 40 }, (_, index) => `paragraph ${index}`).join('\n\n')}\n`,
        );

        expect(scrollPage.domNode!.children).toHaveLength(40);
        // Appending every block directly to the live editor never passes a
        // fragment. A fragment keeps the replacement mount as one DOM operation;
        // happy-dom may internally expand that operation into child insertions.
        const fragmentCalls = appendChild.mock.calls.filter(([node]) => {
            return node instanceof DocumentFragment;
        });
        expect(fragmentCalls).toHaveLength(1);
    });
});
