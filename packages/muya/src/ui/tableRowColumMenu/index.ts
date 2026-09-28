import type { VNode } from 'snabbdom';
import type TableBodyCell from '../../block/gfm/table/cell';
import type TableInner from '../../block/gfm/table/table';

import type { Muya } from '../../index';
import type { IMenuItem } from './config';
import { EVENT_KEYS } from '../../config';
import { isKeyboardEvent } from '../../utils';
import { h, patch } from '../../utils/snabbdom';
import BaseFloat from '../baseFloat';
import { toolList } from './config';
import './index.css';

const defaultOptions = {
    placement: 'bottom' as const,
    offsetOptions: {
        mainAxis: 0,
        crossAxis: 0,
        alignmentAxis: 0,
    },
    showArrow: false,
};

interface ITableInfo {
    barType: 'bottom' | 'right' | 'cell';
}

export class TableRowColumMenu extends BaseFloat {
    static pluginName = 'tableBarTools';
    public override capturesContentKeydown = true;
    private _oldVNode: VNode | null = null;
    private _tableInfo: ITableInfo | null = null;
    private _block: TableBodyCell | null = null;
    private _activeIndex = 0;
    private _tableBarContainer: HTMLDivElement = document.createElement('div');

    constructor(muya: Muya, options = {}) {
        const name = 'mu-table-bar-tools';
        const opts = Object.assign({}, defaultOptions, options);
        super(muya, name, opts);

        this.floatBox!.classList.add('mu-table-bar-tools');
        this.container!.appendChild(this._tableBarContainer);
        this.listen();
    }

    override listen() {
        super.listen();
        const { eventCenter } = this.muya;
        eventCenter.subscribe(
            'muya-table-bar',
            ({ reference, tableInfo, block }) => {
                if (reference) {
                    this._tableInfo = tableInfo;
                    this._block = block;
                    this._activeIndex = 0;
                    this.show(reference);
                    this.render();
                    if (tableInfo.barType === 'cell') {
                        requestAnimationFrame(() => this._focusActiveItem());
                    }
                }
                else {
                    this.hide();
                }
            },
        );

        const keyboardHandler = (event: Event) => {
            if (
                !this.status
                || this._tableInfo?.barType !== 'cell'
                || !isKeyboardEvent(event)
            ) {
                return;
            }

            if (event.key === EVENT_KEYS.ArrowDown || event.key === EVENT_KEYS.Tab) {
                event.preventDefault();
                event.stopPropagation();
                this._step(event.shiftKey && event.key === EVENT_KEYS.Tab ? -1 : 1);
            }
            else if (event.key === EVENT_KEYS.ArrowUp) {
                event.preventDefault();
                event.stopPropagation();
                this._step(-1);
            }
            else if (event.key === EVENT_KEYS.Enter || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                const item = toolList[this._tableInfo!.barType][this._activeIndex];
                if (item)
                    this.selectItem(event, item);
            }
            else if (event.key === EVENT_KEYS.Escape && this._tableInfo?.barType === 'cell') {
                event.preventDefault();
                event.stopPropagation();
                this.hide();
                this._restoreCellFocus();
            }
        };

        eventCenter.attachDOMEvent(this.floatBox!, 'keydown', keyboardHandler);
    }

    render() {
        const { _tableInfo: tableInfo, _oldVNode: oldVNode, _tableBarContainer: tableBarContainer } = this;
        const { i18n } = this.muya;
        const renderArray: IMenuItem[] = toolList[tableInfo!.barType];
        const children = renderArray.map((item, index) => {
            const { label } = item;
            const active = index === this._activeIndex;

            return h(
                'li.item',
                {
                    class: { active },
                    attrs: {
                        id: `mu-table-menu-item-${index}`,
                        role: 'menuitem',
                        tabindex: active ? '0' : '-1',
                    },
                    dataset: {
                        label: item.action,
                    },
                    on: {
                        focus: () => {
                            this._activeIndex = index;
                        },
                        click: (event) => {
                            this.selectItem(event, item);
                        },
                    },
                },
                i18n.t(label),
            );
        });

        const vnode = h('ul', {
            attrs: {
                'role': 'menu',
                'aria-label': i18n.t('Table Block'),
            },
        }, children);

        if (oldVNode)
            patch(oldVNode, vnode);
        else
            patch(tableBarContainer, vnode);

        this._oldVNode = vnode;
    }

    private _focusActiveItem() {
        const items = this.floatBox!.querySelectorAll<HTMLElement>('li.item');
        items[this._activeIndex]?.focus({ preventScroll: true });
    }

    private _step(delta: -1 | 1) {
        const items = toolList[this._tableInfo!.barType];
        this._activeIndex = (this._activeIndex + delta + items.length) % items.length;
        this.render();
        requestAnimationFrame(() => this._focusActiveItem());
    }

    private _restoreCellFocus() {
        const content = this._block?.firstContentInDescendant();
        content?.domNode?.focus({ preventScroll: true });
    }

    selectItem(event: Event, item: IMenuItem) {
        event.preventDefault();
        event.stopPropagation();

        const { table, row } = this._block!;
        const rowCount = (table.firstChild as TableInner).offset(row);
        const columnCount = row.offset(this._block!);
        const { location, action, target } = item;

        if (action === 'insert') {
            let cursorBlock = null;

            if (target === 'row') {
                const offset = location === 'previous' ? rowCount : rowCount + 1;
                cursorBlock = table.insertRow(offset);
            }
            else {
                const offset = location === 'left' ? columnCount : columnCount + 1;
                cursorBlock = table.insertColumn(offset);
            }

            if (cursorBlock)
                cursorBlock.setCursor(0, 0);
        }
        else if (action === 'remove') {
            // After a row/column delete, the caret used to live inside a
            // now-detached cell. The table mutators return a surviving
            // neighbour so focus stays on a valid editing target.
            const cursorBlock = target === 'row'
                ? table.removeRow(rowCount)
                : table.removeColumn(columnCount);

            if (cursorBlock)
                cursorBlock.setCursor(0, 0);
        }
        else if (action === 'removeTable') {
            const cursorBlock = table.removeTable();
            if (cursorBlock)
                cursorBlock.setCursor(0, 0, true);
        }
        else if (action === 'move') {
            let cursorBlock = null;
            if (target === 'row') {
                const to = location === 'previous' ? rowCount - 1 : rowCount + 1;
                if (to >= 0 && to < table.rowCount)
                    cursorBlock = table.moveRow(rowCount, to, columnCount);
            }
            else {
                const to = location === 'left' ? columnCount - 1 : columnCount + 1;
                if (to >= 0 && to < table.columnCount)
                    cursorBlock = table.moveColumn(columnCount, to, rowCount);
            }

            if (cursorBlock)
                cursorBlock.setCursor(0, 0, true);
        }
        else if (action === 'align' && target === 'column' && item.value) {
            table.alignColumn(columnCount, item.value);
        }

        this.hide();
    }
}
