// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import TableCellContent from '../index';

describe('desktop interaction contract — table cell context menu lazy init', () => {
    it('initializes the deferred table menu plugin before emitting the first context-menu event', () => {
        const initUiPlugin = vi.fn();
        const emit = vi.fn();
        const referenceNode = document.createElement('span');
        document.body.appendChild(referenceNode);

        const fakeCell = { id: 'cell' };
        const fakeThis = {
            domNode: referenceNode,
            muya: {
                initUiPlugin,
                eventCenter: { emit },
            },
            closestBlock: vi.fn((name: string) => name === 'table.cell' ? fakeCell : null),
            _cell: fakeCell,
        };

        const event = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            button: 2,
        });
        Object.defineProperty(event, 'x', { value: 0 });

        TableCellContent.prototype.contextMenuHandler.call(
            fakeThis as unknown as TableCellContent,
            event,
        );

        expect(initUiPlugin).toHaveBeenCalledWith('tableBarTools');
        expect(emit).toHaveBeenCalledWith('muya-table-bar', expect.objectContaining({
            tableInfo: { barType: 'cell' },
            block: fakeCell,
        }));
        expect(initUiPlugin.mock.invocationCallOrder[0])
            .toBeLessThan(emit.mock.invocationCallOrder[0]);

        referenceNode.remove();
    });
});
