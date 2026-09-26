// @vitest-environment happy-dom

import type { Muya } from '../../../../muya';
import type Content from '../../../base/content';
import type TableCellContent from '../../../content/tableCell';
import type Table from '../index';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya as MuyaClass } from '../../../../muya';

vi.mock('../../../../utils/prism/index', () => ({
    default: {},
    walkTokens: () => null,
    loadedLanguages: new Set(),
    transformAliasToOrigin: (s: string) => s,
    loadLanguage: () => Promise.resolve([]),
    search: () => [],
}));

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

function bootMuya(markdown: string): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new MuyaClass(host, { markdown } as ConstructorParameters<typeof MuyaClass>[1]);
    muya.init();
    hosts.push(muya.domNode);
    return muya;
}

function firstCell(muya: Muya): TableCellContent {
    return muya.editor.scrollPage!.firstContentInDescendant()! as TableCellContent;
}

function tableOf(content: Content): Table {
    return content.closestBlock('table') as Table;
}

function settle() {
    return new Promise(resolve => setTimeout(resolve, 40));
}

describe('us12 AC-52 — table structure operations are standalone undo units', () => {
    it('does not absorb a preceding cell edit into an insert-row undo', async () => {
        const muya = bootMuya('| a | b |\n| --- | --- |\n| c | d |\n');
        const cell = firstCell(muya);
        const table = tableOf(cell);

        cell.text = 'edited';
        table.insertRow(1);
        await settle();

        expect(table.rowCount).toBe(3);
        muya.undo();
        await settle();

        expect(muya.getMarkdown()).toContain('| edited');
        expect(tableOf(firstCell(muya)).rowCount).toBe(2);
    });

    it('does not absorb a preceding cell edit when removing the final column deletes the table', async () => {
        const muya = bootMuya('| a |\n| --- |\n| c |\n\nafter\n');
        const cell = firstCell(muya);
        const table = tableOf(cell);

        cell.text = 'edited';
        table.removeColumn(0);
        await settle();

        expect(muya.getMarkdown()).not.toContain('| edited');
        muya.undo();
        await settle();

        expect(muya.getMarkdown()).toContain('| edited');
        expect(tableOf(firstCell(muya)).columnCount).toBe(1);
    });

    it('moves one row and one column as one undoable operation each', async () => {
        const muya = bootMuya(
            '| h1 | h2 | h3 |\n'
            + '| --- | --- | --- |\n'
            + '| a1 | a2 | a3 |\n'
            + '| b1 | b2 | b3 |\n',
        );
        let table = tableOf(firstCell(muya));
        const original = muya.getMarkdown();

        expect(typeof (table as Table & { moveRow?: unknown }).moveRow).toBe('function');
        expect(typeof (table as Table & { moveColumn?: unknown }).moveColumn).toBe('function');

        (table as Table & { moveRow: (from: number, to: number) => TableCellContent }).moveRow(1, 2);
        await settle();
        table = tableOf(firstCell(muya));
        expect(table.getState().children[2].children[0].text).toBe('a1');

        muya.undo();
        await settle();
        expect(muya.getMarkdown()).toBe(original);

        table = tableOf(firstCell(muya));
        (table as Table & { moveColumn: (from: number, to: number) => TableCellContent }).moveColumn(0, 2);
        await settle();
        table = tableOf(firstCell(muya));
        expect(table.getState().children[0].children.map(cell => cell.text)).toEqual(['h2', 'h3', 'h1']);

        muya.undo();
        await settle();
        expect(muya.getMarkdown()).toBe(original);
    });
});
