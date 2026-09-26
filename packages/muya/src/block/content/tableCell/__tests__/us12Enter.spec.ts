// @vitest-environment happy-dom

import type { Muya } from '../../../../muya';
import type Content from '../../../base/content';
import type Table from '../../../gfm/table';
import type TableCellContent from '../index';
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

function firstCell(muya: Muya): Content {
    return muya.editor.scrollPage!.firstContentInDescendant()!;
}

describe('us12 AC-51 — Enter stays inside a GFM table cell', () => {
    it('inserts a visible GFM-safe <br> instead of navigating out of the cell', async () => {
        const muya = bootMuya('| alpha | beta |\n| --- | --- |\n| gamma | delta |\n');
        const cell = firstCell(muya) as TableCellContent;
        cell.setCursor(cell.text.length, cell.text.length, true);

        cell.enterHandler(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 40));

        expect(cell.text).toBe('alpha<br>');
        expect(muya.getMarkdown()).toContain('| alpha<br>');
        expect((cell.closestBlock('table') as Table).getState().children).toHaveLength(2);
    });
});
