import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toolList } from '../config';

describe('desktop interaction contract — table cell context menu', () => {
    it('exposes the required row, column, and whole-table structural actions', () => {
        expect(toolList.cell.map(item => item.label)).toEqual([
            'Insert Row Above',
            'Insert Row Below',
            'Insert Column Left',
            'Insert Column Right',
            'Delete Row',
            'Delete Column',
            'Delete Table',
        ]);
    });

    it('scopes keyboard capture to the cell context menu instead of legacy row/column menus', () => {
        const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');

        expect(source).toContain('this._tableInfo?.barType !== \'cell\'');
        expect(source).not.toContain('attachDOMEvent(this.muya.domNode, \'keydown\', keyboardHandler)');
        expect(source).toContain('attachDOMEvent(this.floatBox!, \'keydown\', keyboardHandler)');
        expect(source).toContain('this.floatBox!.querySelectorAll<HTMLElement>(\'li.item\')');
        expect(source).not.toContain('this._tableBarContainer.querySelectorAll<HTMLElement>(\'li.item\')');
    });
});
