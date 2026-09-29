// @vitest-environment happy-dom

import type Table from '../../../block/gfm/table';
import type { Muya } from '../../../muya';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya as MuyaClass } from '../../../muya';
import { resizeTableWithConfirmation } from '../resize';

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
    confirmTableResize: NonNullable<ConstructorParameters<typeof MuyaClass>[1]>['confirmTableResize'],
): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new MuyaClass(host, { markdown, confirmTableResize });
    muya.init();
    hosts.push(muya.domNode);
    return muya;
}

function firstTable(muya: Muya): Table {
    return muya.editor.scrollPage!.firstContentInDescendant()!.closestBlock('table') as Table;
}

function settle(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 40));
}

function undoDepth(muya: Muya): number {
    // @ts-expect-error — test-only observation of the established history stack.
    return muya.editor.history._stack.undo.length;
}

describe('p1 destructive table resize confirmation', () => {
    it('cancel is zero mutation and zero history', async () => {
        const confirmTableResize = vi.fn(async () => false);
        const muya = bootMuya(
            '| a | b | c |\n'
            + '| --- | --- | --- |\n'
            + '| d | e | f |\n'
            + '| g | h | i |\n',
            confirmTableResize,
        );
        const before = muya.getMarkdown();
        const historyBefore = undoDepth(muya);

        const cursor = await resizeTableWithConfirmation(
            muya,
            firstTable(muya),
            2,
            2,
            0,
            0,
        );

        expect(cursor).toBeNull();
        expect(confirmTableResize).toHaveBeenCalledWith({
            fromRows: 3,
            fromColumns: 3,
            toRows: 2,
            toColumns: 2,
            rowsRemoved: 1,
            columnsRemoved: 1,
            nonEmptyCount: 5,
        });
        expect(muya.getMarkdown()).toBe(before);
        expect(undoDepth(muya)).toBe(historyBefore);
    });

    it('confirm performs one atomic resize and one Undo restores dimensions, content, and alignment', async () => {
        const confirmTableResize = vi.fn(async () => true);
        const muya = bootMuya(
            '| a | b | c |\n'
            + '| --- | :---: | ---: |\n'
            + '| d | e | f |\n'
            + '| g | h | i |\n',
            confirmTableResize,
        );
        const before = muya.getMarkdown();
        const historyBefore = undoDepth(muya);

        const cursor = await resizeTableWithConfirmation(
            muya,
            firstTable(muya),
            2,
            2,
            1,
            1,
        );
        await settle();

        expect(cursor).not.toBeNull();
        expect(firstTable(muya).rowCount).toBe(2);
        expect(firstTable(muya).columnCount).toBe(2);
        expect(firstTable(muya).getState().children[0].children[1].meta.align).toBe('center');
        expect(undoDepth(muya)).toBe(historyBefore + 1);

        muya.undo();
        await settle();
        expect(muya.getMarkdown()).toBe(before);
    });

    it('non-destructive resize bypasses confirmation', async () => {
        const confirmTableResize = vi.fn(async () => false);
        const muya = bootMuya(
            '| a | b |\n| --- | --- |\n| c | d |\n',
            confirmTableResize,
        );

        const cursor = await resizeTableWithConfirmation(
            muya,
            firstTable(muya),
            3,
            3,
            0,
            0,
        );
        await settle();

        expect(cursor).not.toBeNull();
        expect(confirmTableResize).not.toHaveBeenCalled();
        expect(firstTable(muya).rowCount).toBe(3);
        expect(firstTable(muya).columnCount).toBe(3);
    });
});
