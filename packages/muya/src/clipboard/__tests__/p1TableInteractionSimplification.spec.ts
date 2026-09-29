// @vitest-environment happy-dom

import type Content from '../../block/base/content';
import type TableCellContent from '../../block/content/tableCell';
import type Table from '../../block/gfm/table';
import type { Muya } from '../../muya';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya as MuyaClass } from '../../muya';
import { SelectionCaretType, SelectionDirection } from '../../selection/types';
import { CopyType } from '../types';

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
    document.getSelection()?.removeAllRanges();
    if (hadVersion)
        window.MUYA_VERSION = originalVersion as string;
    else
        delete (window as Partial<Window>).MUYA_VERSION;
});

function bootMuya(
    markdown: string,
    overrides: Record<string, unknown> = {},
): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new MuyaClass(host, {
        markdown,
        confirmTableOverwrite: async () => true,
        ...overrides,
    } as ConstructorParameters<typeof MuyaClass>[1]);
    muya.init();
    hosts.push(muya.domNode);
    return muya;
}

function firstTable(muya: Muya): Table {
    return muya.editor.scrollPage!.firstContentInDescendant()!.closestBlock('table') as Table;
}

function cellContent(table: Table, row: number, column: number): TableCellContent {
    return table.cellAt(row, column)!.firstContentInDescendant() as TableCellContent;
}

function cellDom(table: Table, row: number, column: number): HTMLElement {
    return cellContent(table, row, column).domNode!;
}

function fireMouse(node: HTMLElement, type: string): void {
    const event = new MouseEvent(type, { bubbles: true, button: 0 });
    if (!('x' in event))
        Object.defineProperty(event, 'x', { value: 0, configurable: true });
    node.dispatchEvent(event);
}

function dragSelect(table: Table, r1: number, c1: number, r2: number, c2: number): void {
    fireMouse(cellDom(table, r1, c1), 'mousedown');
    fireMouse(cellDom(table, r2, c2), 'mousemove');
    fireMouse(cellDom(table, r2, c2), 'mouseup');
}

function dispatchDelete(key: 'Delete' | 'Backspace' = 'Delete'): void {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

function pasteEvent(text: string): ClipboardEvent {
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

function stubCaret(muya: Muya, block: Content, offset = 0): void {
    const path = block.path;
    muya.editor.selection.getSelection = () => ({
        anchor: { offset, block, path },
        focus: { offset, block, path },
        isCollapsed: true,
        isSelectionInSameBlock: true,
        direction: SelectionDirection.FORWARD,
        type: SelectionCaretType.CARET,
    });
}

function settle(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 40));
}

function undoDepth(muya: Muya): number {
    // @ts-expect-error — test-only observation of the established history stack.
    return muya.editor.history._stack.undo.length;
}

describe('p1 table interaction simplification contract', () => {
    it('repeated Delete over a whole-table rectangle clears content but never deletes table structure', async () => {
        const muya = bootMuya('| a | b |\n| --- | --- |\n| c | d |\n');
        const table = firstTable(muya);
        const rows = table.rowCount;
        const columns = table.columnCount;

        dragSelect(table, 0, 0, rows - 1, columns - 1);
        dispatchDelete();
        await settle();
        dispatchDelete();
        await settle();
        const depthAfterClear = undoDepth(muya);
        dispatchDelete();
        await settle();

        expect(undoDepth(muya)).toBe(depthAfterClear);
        const current = firstTable(muya);
        expect(current.rowCount).toBe(rows);
        expect(current.columnCount).toBe(columns);
        expect(muya.getMarkdown()).toContain('|');
    });

    it('whole-row Delete and whole-column Backspace clear content without structural mutation', async () => {
        const rowMuya = bootMuya('| a | b | c |\n| --- | --- | --- |\n| d | e | f |\n');
        const rowTable = firstTable(rowMuya);
        const rowCount = rowTable.rowCount;
        const columnCount = rowTable.columnCount;
        dragSelect(rowTable, 1, 0, 1, columnCount - 1);
        dispatchDelete();
        await settle();

        const rowState = firstTable(rowMuya);
        expect(rowState.rowCount).toBe(rowCount);
        expect(rowState.columnCount).toBe(columnCount);
        expect(rowState.getState().children[1].children.map(cell => cell.text)).toEqual(['', '', '']);

        const columnMuya = bootMuya('| a | b | c |\n| --- | --- | --- |\n| d | e | f |\n');
        const columnTable = firstTable(columnMuya);
        const columnRows = columnTable.rowCount;
        const columnColumns = columnTable.columnCount;
        dragSelect(columnTable, 0, 1, columnRows - 1, 1);
        dispatchDelete('Backspace');
        await settle();

        const columnState = firstTable(columnMuya);
        expect(columnState.rowCount).toBe(columnRows);
        expect(columnState.columnCount).toBe(columnColumns);
        expect(columnState.getState().children.map(row => row.children[1].text)).toEqual(['', '']);
    });

    it('cut over a whole-table rectangle is copy + clear only, and one Undo restores all content', async () => {
        const muya = bootMuya('| a | b |\n| --- | --- |\n| c | d |\n');
        const before = muya.getMarkdown();
        const table = firstTable(muya);
        const rows = table.rowCount;
        const columns = table.columnCount;

        dragSelect(table, 0, 0, rows - 1, columns - 1);
        muya.editor.clipboard.cutHandler();
        await settle();

        const afterCut = firstTable(muya);
        expect(afterCut.rowCount).toBe(rows);
        expect(afterCut.columnCount).toBe(columns);
        expect(muya.getMarkdown()).toContain('|');

        muya.undo();
        await settle();
        expect(muya.getMarkdown()).toBe(before);
    });

    it('scalar paste over a multi-cell rectangle fills every selected cell instead of silently doing nothing', async () => {
        const muya = bootMuya('| a | b | c |\n| --- | --- | --- |\n| d | e | f |\n');
        const table = firstTable(muya);
        dragSelect(table, 0, 0, 1, 1);
        // Real rectangular selection suppresses the ordinary native/text caret.
        // P1 paste must derive its target from the table selection itself.
        muya.editor.selection.getSelection = () => null;

        await muya.editor.clipboard.pasteHandler(pasteEvent('x'), 'x', '');
        await settle();

        const state = firstTable(muya).getState();
        expect(state.children[0].children.slice(0, 2).map(cell => cell.text)).toEqual(['x', 'x']);
        expect(state.children[1].children.slice(0, 2).map(cell => cell.text)).toEqual(['x', 'x']);
        expect(state.children[0].children[2].text).toBe('c');
        expect(state.children[1].children[2].text).toBe('f');
    });

    it('cancelled scalar overwrite over non-empty selected cells is zero mutation and zero history', async () => {
        const confirmTableOverwrite = vi.fn(async () => false);
        const muya = bootMuya('| a | b |\n| --- | --- |\n| c | d |\n', {
            confirmTableOverwrite,
        });
        const before = muya.getMarkdown();
        const historyBefore = undoDepth(muya);
        const table = firstTable(muya);
        dragSelect(table, 0, 0, 1, 1);
        muya.editor.selection.getSelection = () => null;

        await muya.editor.clipboard.pasteHandler(pasteEvent('x'), 'x', '');
        await settle();

        expect(confirmTableOverwrite).toHaveBeenCalledWith({
            startRow: 0,
            startColumn: 0,
            endRow: 1,
            endColumn: 1,
            nonEmptyCount: 4,
        });
        expect(muya.getMarkdown()).toBe(before);
        expect(undoDepth(muya)).toBe(historyBefore);
    });

    it('matching TSV matrix paste uses the rectangular selection anchor deterministically', async () => {
        const muya = bootMuya('| a | b | c |\n| --- | --- | --- |\n| d | e | f |\n');
        const table = firstTable(muya);
        // Deliberately leave the native/text caret elsewhere. The frozen
        // rectangle anchor, not the caret, owns matrix paste placement.
        stubCaret(muya, cellContent(table, 0, 0));
        dragSelect(table, 0, 1, 1, 2);

        await muya.editor.clipboard.pasteHandler(pasteEvent('w\tx\ny\tz'), 'w\tx\ny\tz', '');
        await settle();

        const state = firstTable(muya).getState();
        expect(state.children[0].children.map(cell => cell.text)).toEqual(['a', 'w', 'x']);
        expect(state.children[1].children.map(cell => cell.text)).toEqual(['d', 'y', 'z']);
    });

    it('smaller TSV matrix changes only its footprint inside a larger selected rectangle', async () => {
        const muya = bootMuya('| a | b | c |\n| --- | --- | --- |\n| d | e | f |\n');
        const table = firstTable(muya);
        stubCaret(muya, cellContent(table, 1, 2));
        dragSelect(table, 0, 0, 1, 2);

        await muya.editor.clipboard.pasteHandler(pasteEvent('x\ty'), 'x\ty', '');
        await settle();

        const state = firstTable(muya).getState();
        expect(state.children[0].children.map(cell => cell.text)).toEqual(['x', 'y', 'c']);
        expect(state.children[1].children.map(cell => cell.text)).toEqual(['d', 'e', 'f']);
    });

    it('larger TSV matrix expands from the rectangular selection anchor without truncation and Undo restores', async () => {
        const muya = bootMuya('| a | b |\n| --- | --- |\n| c | d |\n');
        const before = muya.getMarkdown();
        const table = firstTable(muya);
        // Native caret intentionally differs from the rectangular anchor.
        stubCaret(muya, cellContent(table, 0, 1));
        dragSelect(table, 1, 0, 1, 1);

        await muya.editor.clipboard.pasteHandler(
            pasteEvent('w\tx\tq\ny\tz\tr'),
            'w\tx\tq\ny\tz\tr',
            '',
        );
        await settle();

        const expanded = firstTable(muya);
        expect(expanded.rowCount).toBe(3);
        expect(expanded.columnCount).toBe(3);
        expect(expanded.getState().children[1].children.map(cell => cell.text)).toEqual(['w', 'x', 'q']);
        expect(expanded.getState().children[2].children.map(cell => cell.text)).toEqual(['y', 'z', 'r']);

        muya.undo();
        await settle();
        expect(muya.getMarkdown()).toBe(before);
    });

    it('malformed TSV over a rectangle reports fallback and fills the selected target literally', async () => {
        const notifyTablePasteFallback = vi.fn();
        const muya = bootMuya('| a | b |\n| --- | --- |\n| c | d |\n', {
            notifyTablePasteFallback,
        });
        const table = firstTable(muya);
        stubCaret(muya, cellContent(table, 0, 0));
        dragSelect(table, 0, 0, 1, 1);

        await muya.editor.clipboard.pasteHandler(
            pasteEvent('left\tright\nragged'),
            'left\tright\nragged',
            '',
        );
        await settle();

        expect(notifyTablePasteFallback).toHaveBeenCalledWith('non-rectangular-tsv');
        expect(firstTable(muya).getState().children.flatMap(row => row.children).map(cell => cell.text))
            .toEqual(Array.from({ length: 4 }).fill('left\tright<br>ragged'));
    });

    it('cancelled destructive matrix overwrite over a rectangle is zero mutation and zero history', async () => {
        const confirmTableOverwrite = vi.fn(async () => false);
        const muya = bootMuya('| a | b |\n| --- | --- |\n| c | d |\n', {
            confirmTableOverwrite,
        });
        const before = muya.getMarkdown();
        const historyBefore = undoDepth(muya);
        const table = firstTable(muya);
        stubCaret(muya, cellContent(table, 0, 0));
        dragSelect(table, 0, 0, 1, 1);

        await muya.editor.clipboard.pasteHandler(pasteEvent('w\tx\ny\tz'), 'w\tx\ny\tz', '');
        await settle();

        expect(confirmTableOverwrite).toHaveBeenCalledWith({
            startRow: 0,
            startColumn: 0,
            endRow: 1,
            endColumn: 1,
            nonEmptyCount: 4,
        });
        expect(muya.getMarkdown()).toBe(before);
        expect(undoDepth(muya)).toBe(historyBefore);
    });

    it('normal rectangular Copy publishes TSV plain text + HTML while Copy as Markdown keeps GFM', () => {
        const muya = bootMuya('| a | b |\n| --- | --- |\n| c | d |\n');
        const table = firstTable(muya);
        dragSelect(table, 0, 0, 1, 1);

        const normal = new Map<string, string>();
        muya.editor.clipboard.copyHandler({
            clipboardData: {
                setData: (type: string, value: string) => normal.set(type, value),
            },
        } as unknown as ClipboardEvent);

        expect(normal.get('text/plain')).toBe('a\tb\nc\td');
        expect(normal.get('text/html')).toContain('<table');

        const markdown = new Map<string, string>();
        muya.editor.clipboard.copyType = CopyType.COPY_AS_MARKDOWN;
        try {
            muya.editor.clipboard.copyHandler({
                clipboardData: {
                    setData: (type: string, value: string) => markdown.set(type, value),
                },
            } as unknown as ClipboardEvent);
        }
        finally {
            muya.editor.clipboard.copyType = CopyType.NORMAL;
        }

        expect(markdown.get('text/plain')).toMatch(/\|\s*a\s*\|\s*b\s*\|/);
        expect(markdown.get('text/plain')).toContain('| --- | --- |');
        expect(markdown.get('text/html')).toBe('');
    });

    it('arrowDown at the final table row does not create document structure when no destination exists', async () => {
        const muya = bootMuya('| a | b |\n| --- | --- |\n| c | d |\n');
        const table = firstTable(muya);
        const last = cellContent(table, table.rowCount - 1, table.columnCount - 1);
        last.setCursor(last.text.length, last.text.length, true);
        const before = muya.getState().length;

        last.arrowHandler(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        await settle();

        expect(muya.getState().length).toBe(before);
        expect(muya.getState()[0].name).toBe('table');
    });

    it('alt+Down moves the current row as the keyboard-accessible reorder fallback', async () => {
        const muya = bootMuya(
            '| h1 | h2 |\n'
            + '| --- | --- |\n'
            + '| a1 | a2 |\n'
            + '| b1 | b2 |\n',
        );
        const table = firstTable(muya);
        const row = cellContent(table, 1, 0);
        row.setCursor(0, 0, true);

        row.arrowHandler(new KeyboardEvent('keydown', {
            key: 'ArrowDown',
            altKey: true,
            bubbles: true,
        }));
        await settle();

        const rows = firstTable(muya).getState().children;
        expect(rows[1].children.map(cell => cell.text)).toEqual(['b1', 'b2']);
        expect(rows[2].children.map(cell => cell.text)).toEqual(['a1', 'a2']);
    });

    it('the table model exposes one atomic existing-table resize operation', () => {
        const muya = bootMuya('| a | b |\n| --- | --- |\n| c | d |\n');
        const table = firstTable(muya);

        expect(typeof (table as Table & { resize?: unknown }).resize).toBe('function');
    });
});
