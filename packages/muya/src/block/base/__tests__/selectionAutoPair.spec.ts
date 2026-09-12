// @vitest-environment happy-dom

import type Format from '../format';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../../muya';

const bootedHosts: HTMLElement[] = [];
let originalVersion: string | undefined;
let hadVersion = false;

beforeEach(() => {
    hadVersion = 'MUYA_VERSION' in window;
    originalVersion = window.MUYA_VERSION;
    window.MUYA_VERSION = 'test';
});

afterEach(() => {
    while (bootedHosts.length) {
        const host = bootedHosts.pop()!;
        host.remove();
    }
    document.getSelection()?.removeAllRanges();
    if (hadVersion)
        window.MUYA_VERSION = originalVersion as string;
    else
        delete (window as Partial<Window>).MUYA_VERSION;
});

function bootMuya(
    markdown: string,
    options: Partial<ConstructorParameters<typeof Muya>[1]> = {},
): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { markdown, ...options } as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    bootedHosts.push(muya.domNode);
    return muya;
}

function firstBlock(muya: Muya): Format {
    const content = muya.editor.scrollPage!.firstContentInDescendant() as unknown as Format;
    muya.editor.activeContentBlock = content as never;
    return content;
}

function pressKey(content: Format, key: string): KeyboardEvent {
    const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
    });
    content.keydownHandler(event);
    return event;
}

function expectSelectedRange(content: Format, start: number, end: number) {
    const cursor = content.getCursor();
    expect(cursor?.start.offset).toBe(start);
    expect(cursor?.end.offset).toBe(end);
}

describe('autoPair — wraps selected text on keydown before native replacement', () => {
    it('wraps a selected word with brackets', () => {
        const muya = bootMuya('hello world\n');
        const content = firstBlock(muya);
        content.setCursor(0, 5);
        const markInputBoundary = vi.spyOn(muya.editor.history, 'markInputBoundary');

        const event = pressKey(content, '(');

        expect(event.defaultPrevented).toBe(true);
        expect(markInputBoundary).toHaveBeenCalledWith('insertText', '(');
        expect(content.text).toBe('(hello) world');
        expectSelectedRange(content, 1, 6);
    });

    it('wraps a full-line selection with quotes', () => {
        const muya = bootMuya('hello world\n');
        const content = firstBlock(muya);
        content.setCursor(0, 11);

        const event = pressKey(content, '"');

        expect(event.defaultPrevented).toBe(true);
        expect(content.text).toBe('"hello world"');
        expectSelectedRange(content, 1, 12);
    });

    it('wraps a selected word with markdown syntax markers', () => {
        const muya = bootMuya('hello world\n');
        const content = firstBlock(muya);
        content.setCursor(0, 5);

        const event = pressKey(content, '*');

        expect(event.defaultPrevented).toBe(true);
        expect(content.text).toBe('*hello* world');
        expectSelectedRange(content, 1, 6);
    });

    it('wraps a selected word with backticks', () => {
        const muya = bootMuya('hello world\n');
        const content = firstBlock(muya);
        content.setCursor(0, 5);

        const event = pressKey(content, '`');

        expect(event.defaultPrevented).toBe(true);
        expect(content.text).toBe('`hello` world');
        expectSelectedRange(content, 1, 6);
    });

    it.each([
        ['*', '*hello* world'],
        ['_', '_hello_ world'],
        ['~', '~hello~ world'],
        ['$', '$hello$ world'],
        ['^', '^hello^ world'],
    ] as const)('wraps selected text with the Markdown marker `%s`', (key, expected) => {
        const muya = bootMuya('hello world\n');
        const content = firstBlock(muya);
        content.setCursor(0, 5);

        const event = pressKey(content, key);

        expect(event.defaultPrevented).toBe(true);
        expect(content.text).toBe(expected);
        expectSelectedRange(content, 1, 6);
    });

    it('leaves ordinary selected-text replacement to the browser', () => {
        const muya = bootMuya('hello world\n');
        const content = firstBlock(muya);
        content.setCursor(0, 5);

        const event = pressKey(content, 'X');

        expect(event.defaultPrevented).toBe(false);
        expect(content.text).toBe('hello world');
    });

    it('does not wrap when the relevant auto-pair option is disabled', () => {
        const muya = bootMuya('hello world\n', { autoPairBracket: false });
        const content = firstBlock(muya);
        content.setCursor(0, 5);

        const event = pressKey(content, '(');

        expect(event.defaultPrevented).toBe(false);
        expect(content.text).toBe('hello world');
    });

    it('does not wrap `^` when superscript/subscript support is disabled', () => {
        const muya = bootMuya('hello world\n', { superSubScript: false });
        const content = firstBlock(muya);
        content.setCursor(0, 5);

        const event = pressKey(content, '^');

        expect(event.defaultPrevented).toBe(false);
        expect(content.text).toBe('hello world');
    });

    it('does not apply Markdown-marker selection wrapping inside a fenced code block', () => {
        const muya = bootMuya('```js\nhello world\n```\n');
        const content = muya.editor.scrollPage!.lastContentInDescendant() as unknown as Format;
        muya.editor.activeContentBlock = content as never;
        content.setCursor(0, 5);

        const event = pressKey(content, '*');

        expect(event.defaultPrevented).toBe(false);
        expect(content.text).toBe('hello world');
    });

    it('wraps a selection in a table cell without changing table structure', () => {
        const muya = bootMuya('| head |\n| --- |\n| hello world |\n');
        const content = muya.editor.scrollPage!.lastContentInDescendant() as unknown as Format;
        muya.editor.activeContentBlock = content as never;
        content.setCursor(0, 5);

        const event = pressKey(content, '*');

        expect(event.defaultPrevented).toBe(true);
        expect(content.text).toBe('*hello* world');
        muya.flush();
        expect(muya.getMarkdown()).toContain('| *hello* world |');
    });

    it('wraps only link label text and preserves the link destination', () => {
        const muya = bootMuya('[hello world](https://example.com)\n');
        const content = firstBlock(muya);
        content.setCursor(1, 6);

        const event = pressKey(content, '*');

        expect(event.defaultPrevented).toBe(true);
        expect(content.text).toBe('[*hello* world](https://example.com)');
        muya.flush();
        expect(muya.getMarkdown()).toContain('[*hello* world](https://example.com)');
    });
});
