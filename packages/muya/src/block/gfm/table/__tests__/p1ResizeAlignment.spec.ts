// @vitest-environment happy-dom

import type { Muya } from '../../../../muya';
import type Table from '../index';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Muya as MuyaClass } from '../../../../muya';

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

function bootMuya(markdown: string): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new MuyaClass(host, { markdown } as ConstructorParameters<typeof MuyaClass>[1]);
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

describe('p1 table resize + exact alignment contract', () => {
    it('expands dimensions atomically, preserves existing data/alignment, and one Undo restores the prior table', async () => {
        const muya = bootMuya('| a | b |\n| --- | ---: |\n| c | d |\n');
        const table = firstTable(muya);
        const before = muya.getMarkdown();

        table.resize(4, 3, 1, 1);
        await settle();

        const expanded = firstTable(muya);
        expect(expanded.rowCount).toBe(4);
        expect(expanded.columnCount).toBe(3);
        expect(expanded.getState().children[0].children.map(cell => cell.text)).toEqual(['a', 'b', '']);
        expect(expanded.getState().children[1].children.map(cell => cell.text)).toEqual(['c', 'd', '']);
        for (const row of expanded.getState().children) {
            expect(row.children[1].meta.align).toBe('right');
            expect(row.children[2].meta.align).toBe('none');
        }

        muya.undo();
        await settle();
        expect(muya.getMarkdown()).toBe(before);
    });

    it('shrinks an empty outside area without changing retained content and one Undo restores dimensions', async () => {
        const muya = bootMuya(
            '| a | b |  |\n'
            + '| --- | --- | --- |\n'
            + '| c | d |  |\n'
            + '|  |  |  |\n',
        );
        const table = firstTable(muya);
        const before = muya.getMarkdown();
        expect(table.getResizeImpact(2, 2)).toEqual({
            rowsRemoved: 1,
            columnsRemoved: 1,
            nonEmptyCount: 0,
        });

        table.resize(2, 2);
        await settle();

        expect(firstTable(muya).rowCount).toBe(2);
        expect(firstTable(muya).columnCount).toBe(2);
        expect(firstTable(muya).getState().children[0].children.map(cell => cell.text)).toEqual(['a', 'b']);
        expect(firstTable(muya).getState().children[1].children.map(cell => cell.text)).toEqual(['c', 'd']);

        muya.undo();
        await settle();
        expect(muya.getMarkdown()).toBe(before);
    });

    it('reports destructive shrink impact before mutation', () => {
        const muya = bootMuya(
            '| a | b | c |\n'
            + '| --- | --- | --- |\n'
            + '| d | e | f |\n'
            + '| g | h | i |\n',
        );
        const table = firstTable(muya);
        const before = muya.getMarkdown();

        expect(table.getResizeImpact(2, 2)).toEqual({
            rowsRemoved: 1,
            columnsRemoved: 1,
            nonEmptyCount: 5,
        });
        expect(muya.getMarkdown()).toBe(before);
    });

    it('sets Default/Left/Center/Right as exact document states without toggle ambiguity', async () => {
        const muya = bootMuya('| a | b |\n| --- | --- |\n| c | d |\n');
        let table = firstTable(muya);

        table.setColumnAlignment(0, 'left');
        await settle();
        expect(firstTable(muya).getState().children[0].children[0].meta.align).toBe('left');
        expect(muya.getMarkdown()).toContain(':---');

        table = firstTable(muya);
        table.setColumnAlignment(0, 'center');
        await settle();
        expect(firstTable(muya).getState().children[0].children[0].meta.align).toBe('center');
        expect(muya.getMarkdown()).toContain(':---:');

        table = firstTable(muya);
        table.setColumnAlignment(0, 'right');
        await settle();
        expect(firstTable(muya).getState().children[0].children[0].meta.align).toBe('right');

        table = firstTable(muya);
        table.setColumnAlignment(0, 'none');
        await settle();
        expect(firstTable(muya).getState().children[0].children[0].meta.align).toBe('none');
        expect(muya.getMarkdown()).not.toContain(':---');
        expect(muya.getMarkdown()).toContain('---');

        const defaultMarkdown = muya.getMarkdown();
        firstTable(muya).setColumnAlignment(0, 'none');
        await settle();
        expect(muya.getMarkdown()).toBe(defaultMarkdown);
    });
});
