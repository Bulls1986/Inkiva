// @vitest-environment happy-dom

import type Content from '../../block/base/content';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../muya';

const hosts: HTMLElement[] = [];
let now = 0;

beforeEach(() => {
    window.MUYA_VERSION = 'test';
    vi.spyOn(Date, 'now').mockImplementation(() => now);
});

afterEach(() => {
    vi.restoreAllMocks();
    delete (window as Partial<Window>).MUYA_VERSION;
    while (hosts.length)
        hosts.pop()!.remove();
});

function bootMuya(markdown = 'a\n'): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { markdown } as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    hosts.push(muya.domNode);
    muya.clearHistory();
    return muya;
}

function firstContent(muya: Muya): Content {
    const block = muya.editor.scrollPage!.firstContentInDescendant()!;
    muya.editor.activeContentBlock = block;
    block.setCursor(block.text.length, block.text.length, true);
    return block;
}

function recordTextEdit(
    muya: Muya,
    at: number,
    nextText: string,
    inputType = 'insertText',
    data: string | null = nextText.at(-1) ?? null,
): void {
    now = at;
    const block = firstContent(muya);
    muya.editor.history.markInputBoundary(inputType, data);
    block.text = nextText;
    muya.editor.jsonState.flush();
}

function undoDepth(muya: Muya): number {
    return muya.getHistory().stack.undo.length;
}

describe('us13 operation-based undo grouping', () => {
    it('groups continuous typing by adjacent-key gaps rather than time since the first key', () => {
        const muya = bootMuya();

        recordTextEdit(muya, 1000, 'ab');
        recordTextEdit(muya, 1600, 'abc');
        recordTextEdit(muya, 2300, 'abcd');

        expect(undoDepth(muya)).toBe(1);
    });

    it('treats 750 ms as inclusive and starts a new group after 750 ms', () => {
        const within = bootMuya();
        recordTextEdit(within, 1000, 'ab');
        recordTextEdit(within, 1750, 'abc');
        expect(undoDepth(within)).toBe(1);

        const beyond = bootMuya();
        recordTextEdit(beyond, 3000, 'ab');
        recordTextEdit(beyond, 3751, 'abc');
        expect(undoDepth(beyond)).toBe(2);
    });

    it('keeps whitespace inside the same continuous typing group', () => {
        const muya = bootMuya();

        recordTextEdit(muya, 1000, 'ab', 'insertText', 'b');
        recordTextEdit(muya, 1200, 'ab ', 'insertText', ' ');

        expect(undoDepth(muya)).toBe(1);
    });

    it('makes paste a standalone group on both sides', () => {
        const muya = bootMuya();

        recordTextEdit(muya, 1000, 'ab', 'insertText', 'b');
        recordTextEdit(muya, 1100, 'abX', 'insertFromPaste', 'X');
        recordTextEdit(muya, 1200, 'abXc', 'insertText', 'c');

        expect(undoDepth(muya)).toBe(3);
    });

    it('keeps one explicit user operation atomic even when its internal mutations exceed 750 ms', () => {
        const muya = bootMuya();

        muya.editor.history.runUserOperation(() => {
            recordTextEdit(muya, 1000, 'ab');
            recordTextEdit(muya, 5000, 'abc');
        });

        expect(undoDepth(muya)).toBe(1);
    });

    it('closes the active typing group when history is restored for a tab switch', () => {
        const muya = bootMuya();

        recordTextEdit(muya, 1000, 'ab');
        const snapshot = muya.getHistory();

        muya.clearHistory();
        muya.setHistory(snapshot);
        recordTextEdit(muya, 1100, 'abc');

        expect(undoDepth(muya)).toBe(2);
    });
});
