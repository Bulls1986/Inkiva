import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toolList } from '../../tableRowColumMenu/config';
import columnTools from '../config';

describe('p1 table interaction simplification — visual entry-point contract', () => {
    it('keeps structural commands in the cell context menu instead of row/column edge menus', () => {
        expect(toolList.cell.map(item => item.label)).toEqual([
            'Insert Row Above',
            'Insert Row Below',
            'Insert Column Left',
            'Insert Column Right',
            'Delete Row',
            'Delete Column',
            'Delete Table',
        ]);

        expect(toolList.right).toEqual([]);
        expect(toolList.bottom).toEqual([]);
    });

    it('the compact table property toolbar contains size + four-state alignment only', () => {
        expect(columnTools.map(item => item.type)).toEqual([
            'size',
            'none',
            'left',
            'center',
            'right',
        ]);
    });

    it('keeps the compact property surface free of structural fallbacks while exposing a keyboard-only reveal path', () => {
        const toolbarSource = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
        const menuSource = readFileSync(new URL('../../tableRowColumMenu/index.ts', import.meta.url), 'utf8');
        const tableCellSource = readFileSync(new URL('../../../block/content/tableCell/index.ts', import.meta.url), 'utf8');

        expect(toolbarSource).toContain('eventCenter.subscribe(\'muya-table-properties\'');
        expect(tableCellSource).toContain('eventCenter.emit(\'muya-table-properties\'');
        expect(menuSource).not.toContain('eventCenter.emit(\'muya-table-properties\'');
        expect(toolbarSource).not.toContain('Insert Column');
        expect(toolbarSource).not.toContain('Delete Column');
    });

    it('a short click on a drag handle does not open a structural command popup', () => {
        const source = readFileSync(new URL('../../tableDragBar/index.ts', import.meta.url), 'utf8');
        expect(source).not.toContain('eventCenter.emit(\'muya-table-bar\'');
    });
});
