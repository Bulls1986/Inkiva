export interface IMenuItem {
    label: string;
    action: 'insert' | 'remove' | 'removeTable';
    location: 'previous' | 'next' | 'left' | 'right' | 'current';
    target: 'row' | 'column' | 'table';
}

export const toolList: Record<'right' | 'bottom' | 'cell', IMenuItem[]> = {
    cell: [
        { label: 'Insert Row Above', action: 'insert', location: 'previous', target: 'row' },
        { label: 'Insert Row Below', action: 'insert', location: 'next', target: 'row' },
        { label: 'Insert Column Left', action: 'insert', location: 'left', target: 'column' },
        { label: 'Insert Column Right', action: 'insert', location: 'right', target: 'column' },
        { label: 'Delete Row', action: 'remove', location: 'current', target: 'row' },
        { label: 'Delete Column', action: 'remove', location: 'current', target: 'column' },
        { label: 'Delete Table', action: 'removeTable', location: 'current', target: 'table' },
    ],
    right: [],
    bottom: [],
};
