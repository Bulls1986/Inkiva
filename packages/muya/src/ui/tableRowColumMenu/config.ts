export interface IMenuItem {
    label: string;
    action: 'insert' | 'remove' | 'move' | 'align';
    location: 'previous' | 'next' | 'left' | 'right' | 'current';
    target: 'row' | 'column';
    value?: 'left' | 'center' | 'right';
}

export const toolList: Record<'right' | 'bottom', IMenuItem[]> = {
    right: [
        {
            label: 'Insert Row Above',
            action: 'insert',
            location: 'previous',
            target: 'row',
        },
        {
            label: 'Insert Row Below',
            action: 'insert',
            location: 'next',
            target: 'row',
        },
        {
            label: 'Move Row Up',
            action: 'move',
            location: 'previous',
            target: 'row',
        },
        {
            label: 'Move Row Down',
            action: 'move',
            location: 'next',
            target: 'row',
        },
        {
            label: 'Remove Row',
            action: 'remove',
            location: 'current',
            target: 'row',
        },
    ],
    bottom: [
        {
            label: 'Insert Column Left',
            action: 'insert',
            location: 'left',
            target: 'column',
        },
        {
            label: 'Insert Column Right',
            action: 'insert',
            location: 'right',
            target: 'column',
        },
        {
            label: 'Move Column Left',
            action: 'move',
            location: 'left',
            target: 'column',
        },
        {
            label: 'Move Column Right',
            action: 'move',
            location: 'right',
            target: 'column',
        },
        {
            label: 'Align Left',
            action: 'align',
            location: 'current',
            target: 'column',
            value: 'left',
        },
        {
            label: 'Align Center',
            action: 'align',
            location: 'current',
            target: 'column',
            value: 'center',
        },
        {
            label: 'Align Right',
            action: 'align',
            location: 'current',
            target: 'column',
            value: 'right',
        },
        {
            label: 'Remove Column',
            action: 'remove',
            location: 'current',
            target: 'column',
        },
    ],
};
