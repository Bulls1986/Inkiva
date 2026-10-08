// @vitest-environment happy-dom

import type { TState } from '../../../../state/types';
import type Content from '../../../base/content';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../../../muya';

const bootedHosts: HTMLElement[] = [];
let originalVersion: string | undefined;
let hadVersion = false;

beforeEach(() => {
    hadVersion = 'MUYA_VERSION' in window;
    originalVersion = window.MUYA_VERSION;
    window.MUYA_VERSION = 'test';
});

afterEach(() => {
    while (bootedHosts.length)
        bootedHosts.pop()!.remove();

    document.getSelection()?.removeAllRanges();
    if (hadVersion)
        window.MUYA_VERSION = originalVersion as string;
    else
        delete (window as Partial<Window>).MUYA_VERSION;
});

function bootMuya(markdown: string): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { markdown } as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    bootedHosts.push(muya.domNode);
    return muya;
}

function bootState(state: TState[]): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, {} as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    muya.setContent(state);
    bootedHosts.push(muya.domNode);
    return muya;
}

function contentByText(muya: Muya, text: string): Content {
    let target: Content | null = null;
    const visit = (block: {
        text?: string;
        constructor: { blockName?: string };
        children?: { forEach: (cb: (b: unknown) => void) => void };
    }) => {
        if (target == null && block.constructor.blockName?.endsWith('.content') && block.text === text)
            target = block as unknown as Content;
        block.children?.forEach(child => visit(child as typeof block));
    };

    visit(muya.editor.scrollPage as unknown as Parameters<typeof visit>[0]);
    if (!target)
        throw new Error(`content block with text "${text}" not found`);
    return target;
}

function keyAt(muya: Muya, content: Content, key: 'Enter' | 'Backspace', offset: number): void {
    muya.editor.activeContentBlock = content;
    content.setCursor(offset, offset, true);
    const event = {
        key,
        shiftKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent;

    if (key === 'Enter')
        content.enterHandler(event);
    else
        content.backspaceHandler(event);
}

function flush(): Promise<void> {
    return new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

interface IListState {
    name: string;
    meta?: { checked?: boolean };
    text?: string;
    children?: IListState[];
}

describe('us11 / AC-48 — list keyboard structure', () => {
    it('enter on an empty nested item outdents that item exactly one list level', async () => {
        const muya = bootState([
            {
                name: 'bullet-list',
                meta: { loose: false, marker: '-' },
                children: [
                    {
                        name: 'list-item',
                        children: [
                            { name: 'paragraph', text: 'parent' },
                            {
                                name: 'bullet-list',
                                meta: { loose: false, marker: '-' },
                                children: [
                                    {
                                        name: 'list-item',
                                        children: [{ name: 'paragraph', text: '' }],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        ] as unknown as TState[]);
        const empty = contentByText(muya, '');

        keyAt(muya, empty, 'Enter', 0);
        await flush();

        const state = muya.getState() as unknown as IListState[];
        expect(state).toHaveLength(1);
        expect(state[0].name).toBe('bullet-list');
        expect(state[0].children).toHaveLength(2);
        expect(state[0].children?.[0].children?.[0]).toMatchObject({
            name: 'paragraph',
            text: 'parent',
        });
        expect(state[0].children?.[1]).toMatchObject({
            name: 'list-item',
            children: [{ name: 'paragraph', text: '' }],
        });
    });

    it('backspace at the start of a nested item outdents the item instead of flattening it into its parent', async () => {
        const muya = bootMuya('- parent\n  - child\n');
        const child = contentByText(muya, 'child');

        keyAt(muya, child, 'Backspace', 0);
        await flush();

        const state = muya.getState() as unknown as IListState[];
        expect(state).toHaveLength(1);
        expect(state[0].name).toBe('bullet-list');
        expect(state[0].children).toHaveLength(2);
        expect(state[0].children?.map(item => item.children?.[0].text)).toEqual([
            'parent',
            'child',
        ]);
        expect(contentByText(muya, 'child').getCursor()?.start.offset).toBe(0);
    });

    it('splits a checked task item into a checked original + unchecked sibling and survives Undo/Redo', async () => {
        const muya = bootMuya('- [x] donenext\n');
        const task = contentByText(muya, 'donenext');

        keyAt(muya, task, 'Enter', 4);
        await flush();

        const state = muya.getState() as unknown as IListState[];
        expect(state[0].name).toBe('task-list');
        expect(state[0].children).toHaveLength(2);
        expect(state[0].children?.map(item => item.meta?.checked)).toEqual([true, false]);
        expect(state[0].children?.map(item => item.children?.[0].text)).toEqual(['done', 'next']);
        expect(muya.getMarkdown()).toBe('- [x] done\n- [ ] next\n');

        muya.undo();
        await flush();
        expect(muya.getMarkdown()).toBe('- [x] donenext\n');

        muya.redo();
        await flush();
        expect(muya.getMarkdown()).toBe('- [x] done\n- [ ] next\n');
    });

    it('keeps ordered numbering continuous when Enter splits an item in the middle', async () => {
        const muya = bootMuya('3. alphabeta\n4. gamma\n');
        const first = contentByText(muya, 'alphabeta');

        keyAt(muya, first, 'Enter', 5);
        await flush();

        expect(muya.getMarkdown()).toBe('3. alpha\n4. beta\n5. gamma\n');
    });
});
