// @vitest-environment happy-dom

import type Content from '../../../base/content';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isOsx } from '../../../../config';
import { Muya } from '../../../../muya';

// `TableCellContent.enterHandler` dispatches to one of three branches based on
// the keyboard modifiers it reads off the event:
//   - Shift+Enter  → `shiftEnter`   : inserts a literal `<br>` at the caret.
//   - Cmd/Ctrl+Enter → `commandEnter`: inserts a new row after the current one.
//   - plain Enter  → `normalEnter`  : US12 keeps editing in-cell and inserts
//                     the same GFM-safe `<br>`.
// `isOsx` is resolved at import time from the userAgent. Under happy-dom the
// userAgent is "...X11; Darwin arm64..." which does NOT match /Mac/, so
// `isOsx === false` here and the command branch is reached via `ctrlKey`, not
// `metaKey`. We assert the ACTUAL behavior in this environment.
//
// Driven through a real boot (mirroring backspaceSafety.spec.ts) so cell
// resolution, row insertion, and caret placement run exactly as a real
// keystroke would.

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

function bootMuya(markdown: string): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { markdown } as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    bootedHosts.push(muya.domNode);
    return muya;
}

// Collect the table cell content blocks in document order.
function tableCells(muya: Muya): Content[] {
    const out: Content[] = [];
    const visit = (block: {
        constructor: { blockName?: string };
        children?: { forEach: (cb: (b: unknown) => void) => void };
    }) => {
        if (block.constructor.blockName === 'table.cell.content')
            out.push(block as unknown as Content);
        block.children?.forEach(b => visit(b as typeof block));
    };
    visit(muya.editor.scrollPage as unknown as Parameters<typeof visit>[0]);
    return out;
}

function makeEnterEvent(
    modifiers: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean } = {},
): KeyboardEvent {
    return {
        key: 'Enter',
        shiftKey: modifiers.shiftKey ?? false,
        metaKey: modifiers.metaKey ?? false,
        ctrlKey: modifiers.ctrlKey ?? false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent;
}

function enterAt(
    muya: Muya,
    cell: Content,
    offset: number,
    modifiers?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean },
): void {
    muya.editor.activeContentBlock = cell;
    cell.setCursor(offset, offset, true);
    cell.enterHandler(makeEnterEvent(modifiers));
}

function flush(): Promise<void> {
    return new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

describe('tableCellContent.enterHandler', () => {
    it('sanity-checks the happy-dom isOsx assumption', () => {
        // The command branch in this env is reached via ctrlKey, not metaKey.
        expect(isOsx).toBe(false);
    });

    it('shift+Enter inserts a literal <br> at the caret and advances it by 4', async () => {
        const muya = bootMuya('| ab | cd |\n| --- | --- |\n| ef | gh |\n');
        const cells = tableCells(muya);
        expect(cells.length).toBe(4);

        const cell = cells[0]; // header cell `ab`
        // Caret in the middle of `ab` (offset 1).
        enterAt(muya, cell, 1, { shiftKey: true });

        await flush();
        expect(cell.text).toContain('<br>');
        expect(cell.text).toBe('a<br>b');

        const cursor = cell.getCursor();
        expect(cursor).not.toBeNull();
        // Caret advances by `<br>`.length (4) from the original offset 1.
        expect(cursor!.start.offset).toBe(1 + '<br>'.length);
        expect(cursor!.start.offset).toBe(5);
    });

    it('plain Enter in a header cell inserts <br> without leaving the cell', async () => {
        const muya = bootMuya('| ab | cd |\n| --- | --- |\n| ef | gh |\n');
        const cells = tableCells(muya);

        enterAt(muya, cells[0], 1);

        await flush();
        const state = muya.getState();
        expect(state.length).toBe(1);
        expect(state[0].name).toBe('table');
        expect(cells[0].text).toBe('a<br>b');
        expect(cells[2].text).toBe('ef');
        const cursor = cells[0].getCursor();
        expect(cursor).not.toBeNull();
        expect(cursor!.start.offset).toBe(5);
    });

    it('plain Enter in a last-row cell keeps the table as the only document block', async () => {
        const muya = bootMuya('| ab | cd |\n| --- | --- |\n| ef | gh |\n');
        const cells = tableCells(muya);
        enterAt(muya, cells[2], 1);

        await flush();
        const state = muya.getState();
        expect(state.length).toBe(1);
        expect(state[0].name).toBe('table');
        expect(cells[2].text).toBe('e<br>f');
        const cursor = cells[2].getCursor();
        expect(cursor).not.toBeNull();
        expect(cursor!.start.offset).toBe(5);
    });

    it('ctrl+Enter (command branch when !isOsx) inserts a new row, rowCount + 1', async () => {
        const muya = bootMuya('| ab | cd |\n| --- | --- |\n| ef | gh |\n');
        const cells = tableCells(muya);
        const table = (cells[0] as unknown as { table: { rowCount: number } }).table;
        const beforeRowCount = table.rowCount;
        expect(beforeRowCount).toBe(2);

        enterAt(muya, cells[0], 0, { ctrlKey: true });

        await flush();
        expect(table.rowCount).toBe(beforeRowCount + 1);
        expect(table.rowCount).toBe(3);

        const state = muya.getState();
        expect(state.length).toBe(1);
        expect(state[0].name).toBe('table');
        // The table state now carries 3 rows.
        expect((state[0] as { children: unknown[] }).children.length).toBe(3);
    });

    it('metaKey+Enter does NOT take the command branch under happy-dom and inserts <br>', async () => {
        const muya = bootMuya('| ab | cd |\n| --- | --- |\n| ef | gh |\n');
        const cells = tableCells(muya);
        const table = (cells[0] as unknown as { table: { rowCount: number } }).table;
        const beforeRowCount = table.rowCount;

        // metaKey alone, ctrlKey false: because isOsx === false, this falls
        // through to normalEnter rather than commandEnter, so no row is added
        // and the edit stays inside the cell.
        enterAt(muya, cells[0], 1, { metaKey: true });

        await flush();
        expect(table.rowCount).toBe(beforeRowCount);

        expect(cells[0].text).toBe('a<br>b');
        const cursor = cells[0].getCursor();
        expect(cursor).not.toBeNull();
        expect(cursor!.start.offset).toBe(5);
    });
});
