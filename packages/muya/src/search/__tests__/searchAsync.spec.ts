// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
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

describe('search.searchAsync()', () => {
    it('publishes the first batch before completing a large document search', async () => {
        const markdown = Array.from(
            { length: 1200 },
            (_, index) => `Paragraph ${index} ${'content '.repeat(8)}`,
        ).join('\n\n');
        const muya = bootMuya(markdown);
        const search = muya.editor.searchModule;
        const updates: number[] = [];

        const pending = search.searchAsync('Paragraph', {}, (current) => {
            updates.push(current.matches.length);
        });

        expect(search.matches).toHaveLength(0);

        await pending;

        expect(search.matches).toHaveLength(1200);
        expect(search.index).toBe(0);
        expect(updates.some(count => count > 0)).toBe(true);
        expect(updates.at(-1)).toBe(1200);
    });
});

describe('search.searchAsync() cancellation', () => {
    it('does not publish stale matches after the document is reset', async () => {
        const markdown = Array.from(
            { length: 1200 },
            (_, index) => `Paragraph ${index} ${'content '.repeat(8)}`,
        ).join('\n\n');
        const muya = bootMuya(markdown);
        const search = muya.editor.searchModule;

        const pending = search.searchAsync('Paragraph');
        search.reset();

        await pending;

        expect(search.matches).toHaveLength(0);
        expect(search.index).toBe(-1);
        expect(search.value).toBe('');
    });
});
