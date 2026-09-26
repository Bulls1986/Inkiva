// @vitest-environment happy-dom

import type Content from '../../block/base/content';
import type TableBlock from '../../block/gfm/table';
import type { Muya } from '../../muya';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya as MuyaClass } from '../../muya';
import { SelectionCaretType, SelectionDirection } from '../../selection/types';

vi.mock('../../utils/prism/index', () => ({
    default: {},
    walkTokens: () => null,
    loadedLanguages: new Set(),
    transformAliasToOrigin: (s: string) => s,
    loadLanguage: () => Promise.resolve([]),
    search: () => [],
}));

vi.mock('../../utils/paste', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../utils/paste')>();
    return { ...actual, normalizePastedHTML: async (html: string) => html };
});

interface IOverwriteRequest {
    startRow: number;
    startColumn: number;
    endRow: number;
    endColumn: number;
    nonEmptyCount: number;
}

const hosts: HTMLElement[] = [];
let hadVersion = false;
let originalVersion: string | undefined;

beforeEach(() => {
    hadVersion = 'MUYA_VERSION' in window;
    originalVersion = window.MUYA_VERSION;
    window.MUYA_VERSION = 'test';
});

afterEach(() => {
    while (hosts.length)
        hosts.pop()!.remove();
    if (hadVersion)
        window.MUYA_VERSION = originalVersion as string;
    else
        delete (window as Partial<Window>).MUYA_VERSION;
});

function bootMuya(
    markdown: string,
    confirmTableOverwrite?: (request: IOverwriteRequest) => Promise<boolean>,
): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const options = {
        markdown,
        confirmTableOverwrite,
    } as unknown as ConstructorParameters<typeof MuyaClass>[1];
    const muya = new MuyaClass(host, options);
    muya.init();
    hosts.push(muya.domNode);
    return muya;
}

function firstCell(muya: Muya): Content {
    return muya.editor.scrollPage!.firstContentInDescendant()!;
}

function firstTable(muya: Muya): TableBlock {
    return firstCell(muya).closestBlock('table') as TableBlock;
}

function stubSelection(muya: Muya, block: Content, start = 0, end = block.text.length) {
    const path = block.path;
    muya.editor.selection.getSelection = () => ({
        anchor: { offset: start, block, path },
        focus: { offset: end, block, path },
        isCollapsed: start === end,
        isSelectionInSameBlock: true,
        direction: SelectionDirection.FORWARD,
        type: SelectionCaretType.RANGE,
    });
}

function pasteEvent(text: string) {
    return {
        preventDefault() {},
        stopPropagation() {},
        clipboardData: {
            getData: (type: string) => (type === 'text/plain' ? text : ''),
            files: [],
            items: [],
        },
    } as unknown as ClipboardEvent;
}

async function pasteInto(muya: Muya, text: string) {
    const cell = firstCell(muya);
    stubSelection(muya, cell);
    await muya.editor.clipboard.pasteHandler(pasteEvent(text), text, '');
    await new Promise(resolve => setTimeout(resolve, 40));
}

function undoDepth(muya: Muya): number {
    // @ts-expect-error — test-only observation of the established history boundary.
    return muya.editor.history._stack.undo.length;
}

const BASE = '| a | b |\n| --- | --- |\n| c | d |\n';

describe('us12 AC-53 — rectangular TSV paste', () => {
    it('confirms overwrite, expands the grid, and applies the rectangle atomically', async () => {
        const confirmTableOverwrite = vi.fn(async () => true);
        const muya = bootMuya(BASE, confirmTableOverwrite);
        const before = muya.getMarkdown();

        await pasteInto(muya, 'x\ty\tz\n1\t2\t3');

        expect(confirmTableOverwrite).toHaveBeenCalledWith({
            startRow: 0,
            startColumn: 0,
            endRow: 1,
            endColumn: 2,
            nonEmptyCount: 4,
        });
        expect(firstTable(muya).columnCount).toBe(3);
        expect(muya.getMarkdown()).toContain('| x');
        expect(muya.getMarkdown()).toContain('y');
        expect(muya.getMarkdown()).toContain('z');
        expect(muya.getMarkdown()).toContain('| 1');
        expect(muya.getMarkdown()).toContain('2');
        expect(muya.getMarkdown()).toContain('3');

        muya.undo();
        await new Promise(resolve => setTimeout(resolve, 40));
        expect(muya.getMarkdown()).toBe(before);
    });

    it('cancels without changing Markdown or undo history', async () => {
        const confirmTableOverwrite = vi.fn(async () => false);
        const muya = bootMuya(BASE, confirmTableOverwrite);
        const before = muya.getMarkdown();
        const historyBefore = undoDepth(muya);

        await pasteInto(muya, 'x\ty\tz\n1\t2\t3');

        expect(confirmTableOverwrite).toHaveBeenCalledTimes(1);
        expect(muya.getMarkdown()).toBe(before);
        expect(undoDepth(muya)).toBe(historyBefore);
    });

    it('falls back to one literal cell for a non-rectangular TSV payload', async () => {
        const muya = bootMuya(BASE);

        await pasteInto(muya, 'left|pipe\tright\nragged');

        const cell = firstCell(muya);
        expect(cell.text).toBe('left|pipe\tright<br>ragged');
        expect(muya.getMarkdown()).toContain('left\\|pipe');
        expect(firstTable(muya).columnCount).toBe(2);
    });
});
