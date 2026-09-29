import type { VNode } from 'snabbdom';
import type CellBlock from '../../block/gfm/table/cell';
import type { Muya } from '../../index';
import type { TableColumnToolIcon } from './config';
import { BLOCK_DOM_PROPERTY } from '../../config';
import { isMouseEvent, throttle } from '../../utils';
import { h, patch } from '../../utils/snabbdom';
import BaseFloat from '../baseFloat';
import icons from './config';
import { resizeTableWithConfirmation } from './resize';

import './index.css';

const OFFSET = 27;

const defaultOptions = {
    placement: 'top' as const,
    offsetOptions: {
        mainAxis: 0,
        crossAxis: 0,
        alignmentAxis: 0,
    },
    showArrow: false,
};

export class TableColumnToolbar extends BaseFloat {
    private _oldVNode: VNode | null = null;
    private _block: CellBlock | null = null;
    private readonly _icons: readonly TableColumnToolIcon[] = icons;
    private _toolsContainer: HTMLDivElement = document.createElement('div');

    static pluginName = 'tableColumnTools';
    public override capturesContentKeydown = true;

    constructor(muya: Muya, options = {}) {
        const name = 'mu-table-column-tools';
        const opts = Object.assign({}, defaultOptions, options);
        super(muya, name, opts);
        this.options = opts;
        this.container!.appendChild(this._toolsContainer);
        this.floatBox!.classList.add('mu-table-column-tools-container');
        this.listen();
    }

    override listen() {
        const { eventCenter } = this.muya;
        super.listen();

        eventCenter.subscribe('muya-table-properties', ({ block, focus }) => {
            if (!block?.domNode)
                return;

            this._block = block as CellBlock;
            this.show(block.domNode);
            this.render();
            if (focus) {
                requestAnimationFrame(() => {
                    this.floatBox?.querySelector<HTMLElement>('li.item')?.focus({
                        preventScroll: true,
                    });
                });
            }
        });

        const handler = throttle((event: Event) => {
            if (!isMouseEvent(event))
                return;

            const { x, y } = event;
            const eles = [...document.elementsFromPoint(x, y)];
            const bellowEles = [...document.elementsFromPoint(x, y + OFFSET)];
            const hasTableCell = (eles: Element[]) => {
                return eles.some(
                    ele =>
                        ele[BLOCK_DOM_PROPERTY]
                        && ele[BLOCK_DOM_PROPERTY].blockName === 'table.cell',
                );
            };

            if (!hasTableCell(eles) && hasTableCell(bellowEles)) {
                // No need to show table column tools when format tool bar is shown. or the table column tools will show on the top of format toolbar.
                const { ui } = this.muya;
                for (const { name, status } of ui.shownFloat) {
                    if (name === 'mu-format-picker' && status)
                        return this.hide();
                }
                const tableCellEle = bellowEles.find(
                    ele =>
                        ele[BLOCK_DOM_PROPERTY]
                        && ele[BLOCK_DOM_PROPERTY].blockName === 'table.cell',
                );
                const cellBlock = tableCellEle![BLOCK_DOM_PROPERTY];
                this._block = cellBlock as CellBlock;
                this.show(tableCellEle!);
                this.render();
            }
            else {
                this.hide();
            }
        }, 300);

        eventCenter.attachDOMEvent(document.body, 'mousemove', handler);
    }

    render() {
        const { _icons: icons, _oldVNode: oldVNode, _toolsContainer: toolsContainer, _block: block } = this;
        const { i18n } = this.muya;
        const children = icons.map((i) => {
            const content = 'icon' in i
                ? h(
                        'div.icon-wrapper',
                        h(
                            'i.icon',
                            h(
                                'i.icon-inner',
                                {
                                    style: {
                                        'background': `url(${i.icon}) no-repeat`,
                                        'background-size': '100%',
                                    },
                                },
                                '',
                            ),
                        ),
                    )
                : h(
                        'span.text-label',
                        i.type === 'size'
                            ? (block ? `${block.table.rowCount} × ${block.table.columnCount}` : '')
                            : i18n.t(i.label),
                    );

            let itemSelector = `li.item.${i.type}`;
            if (block?.align === i.type)
                itemSelector += '.active';

            return h(
                itemSelector,
                {
                    attrs: {
                        'title': `${i18n.t(i.tooltip)}`,
                        'aria-label': `${i18n.t(i.tooltip)}`,
                        'role': 'button',
                        'tabindex': '0',
                    },
                    on: {
                        click: (event) => {
                            void this.selectItem(event, i);
                        },
                        keydown: (event: KeyboardEvent) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                void this.selectItem(event, i);
                            }
                        },
                    },
                },
                [content],
            );
        });

        const vnode = h('ul', {
            attrs: {
                'role': 'toolbar',
                'aria-label': i18n.t('Table Properties'),
            },
        }, children);

        if (oldVNode)
            patch(oldVNode, vnode);
        else
            patch(toolsContainer, vnode);

        this._oldVNode = vnode;
    }

    async selectItem(event: Event, item: TableColumnToolIcon) {
        event.preventDefault();
        event.stopPropagation();

        const { _block: block } = this;
        if (!block || !block.parent)
            return;

        const { table, row } = block;
        const columnCount = row.offset(block);

        if (item.type === 'size') {
            const currentRows = table.rowCount;
            const currentColumns = table.columnCount;
            const reference = (event.currentTarget as HTMLElement | null) ?? this.floatBox!;

            this.muya.initUiPlugin('tablePicker');
            this.muya.eventCenter.emit(
                'muya-table-picker',
                { row: currentRows - 1, column: currentColumns - 1 },
                reference,
                async (rowIndex: number, columnIndex: number) => {
                    const cursor = await resizeTableWithConfirmation(
                        this.muya,
                        table,
                        rowIndex + 1,
                        columnIndex + 1,
                        block.rowOffset,
                        columnCount,
                    );
                    if (!cursor)
                        return;

                    cursor.setCursor(0, 0, true);
                    this.hide();
                },
            );
            return;
        }

        table.setColumnAlignment(columnCount, item.type);
        this.render();
    }
}
