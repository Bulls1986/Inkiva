// @vitest-environment happy-dom

import type Content from '../block/base/content';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Muya } from '../muya';

const bootedHosts: HTMLElement[] = [];
let hadVersion = false;
let originalVersion: string | undefined;

beforeEach(() => {
    hadVersion = 'MUYA_VERSION' in window;
    originalVersion = window.MUYA_VERSION;
    window.MUYA_VERSION = 'test';
});

afterEach(() => {
    while (bootedHosts.length)
        bootedHosts.pop()!.remove();

    if (hadVersion)
        window.MUYA_VERSION = originalVersion as string;
    else
        delete (window as Partial<Window>).MUYA_VERSION;
});

function bootMuya(markdown: string): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { markdown } as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    bootedHosts.push(muya.domNode);
    return muya;
}

function markerClasses(muya: Muya): string[] {
    return Array.from(muya.domNode.querySelectorAll('span.mu-remove'))
        .map(node => node.className);
}

describe('inline Markdown syntax visibility', () => {
    it('treats the token end as outside so markers hide immediately after the closing delimiter', () => {
        const muya = bootMuya('**hello**bar');
        const block = muya.editor.scrollPage!.firstContentInDescendant() as Content;

        block.setCursor(6, 6, true);
        expect(markerClasses(muya).filter(name => name.includes('mu-gray'))).toHaveLength(2);

        // The strong token occupies [0, 9). Offset 9 is immediately after
        // the closing delimiter and therefore outside the semantic run.
        block.setCursor(9, 9, true);

        expect(markerClasses(muya).filter(name => name.includes('mu-hide'))).toHaveLength(2);
        expect(markerClasses(muya).filter(name => name.includes('mu-gray'))).toHaveLength(0);
        expect(muya.getMarkdown()).toContain('**hello**bar');
    });

    it('revealing and hiding syntax does not mutate Markdown or create undo history', () => {
        const markdown = 'before **bold** after';
        const muya = bootMuya(markdown);
        const block = muya.editor.scrollPage!.firstContentInDescendant() as Content;

        muya.clearHistory();
        expect(muya.editor.history.canUndo()).toBe(false);

        block.setCursor(10, 10, true);
        expect(markerClasses(muya).filter(name => name.includes('mu-gray'))).toHaveLength(2);

        block.setCursor(markdown.length, markdown.length, true);
        expect(markerClasses(muya).filter(name => name.includes('mu-hide'))).toHaveLength(2);

        expect(muya.getMarkdown().trim()).toBe(markdown);
        expect(muya.editor.history.canUndo()).toBe(false);
    });

    it.each([
        ['single emphasis marker', '*draft'],
        ['unclosed inline link', '[label](https://example.com'],
        ['unclosed code fence', '```ts\nconst value = 1;'],
    ])('preserves incomplete Markdown intermediate state: %s', (_name, markdown) => {
        const muya = bootMuya(markdown);

        expect(muya.getMarkdown().trim()).toBe(markdown);
        expect(muya.domNode.querySelector('.mu-content')).not.toBeNull();
    });
});
