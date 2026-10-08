// @vitest-environment happy-dom

import type { TState } from '../../../../state/types';
import type Content from '../../../base/content';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../../../muya';

const hosts: HTMLElement[] = [];
let originalVersion: string | undefined;
let hadVersion = false;

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

function boot(markdown: string): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { markdown } as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    hosts.push(muya.domNode);
    return muya;
}

function bootState(state: TState[]): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, {} as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    muya.setContent(state);
    hosts.push(muya.domNode);
    return muya;
}

function contents(muya: Muya): Content[] {
    const result: Content[] = [];
    const visit = (block: {
        constructor: { blockName?: string };
        children?: { forEach: (cb: (b: unknown) => void) => void };
    }) => {
        if (block.constructor.blockName?.endsWith('.content'))
            result.push(block as unknown as Content);
        block.children?.forEach(child => visit(child as typeof block));
    };
    visit(muya.editor.scrollPage as unknown as Parameters<typeof visit>[0]);
    return result;
}

function enterAt(muya: Muya, content: Content, offset: number): void {
    muya.editor.activeContentBlock = content;
    content.setCursor(offset, offset, true);
    content.enterHandler({
        key: 'Enter',
        shiftKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent);
}

function flush(): Promise<void> {
    return new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

describe('us11 / AC-49 — block-quote Enter semantics', () => {
    it('splits a non-empty quoted line into two same-level quoted paragraphs', async () => {
        const muya = boot('> alphabeta\n');
        const quoted = contents(muya).find(content => content.text === 'alphabeta')!;
        enterAt(muya, quoted, 5);
        await flush();

        const state = muya.getState() as unknown as Array<{
            name: string;
            children?: Array<{ name: string; text?: string }>;
        }>;
        expect(state).toHaveLength(1);
        expect(state[0].name).toBe('block-quote');
        expect(state[0].children).toEqual([
            { name: 'paragraph', text: 'alpha' },
            { name: 'paragraph', text: 'beta' },
        ]);
        expect(muya.editor.activeContentBlock?.text).toBe('beta');
        expect(muya.editor.activeContentBlock?.getCursor()?.start.offset).toBe(0);
    });

    it('enter on an empty root quote exits to a normal paragraph', async () => {
        const muya = bootState([
            {
                name: 'block-quote',
                children: [{ name: 'paragraph', text: '' }],
            },
        ] as unknown as TState[]);
        enterAt(muya, contents(muya)[0], 0);
        await flush();

        expect(muya.getState()).toEqual([{ name: 'paragraph', text: '' }]);
        expect(muya.editor.activeContentBlock?.blockName).toBe('paragraph.content');
        expect(muya.editor.activeContentBlock?.getCursor()?.start.offset).toBe(0);
    });

    it('enter on an empty nested quote exits exactly one quote level', async () => {
        const muya = bootState([
            {
                name: 'block-quote',
                children: [
                    { name: 'paragraph', text: 'before' },
                    {
                        name: 'block-quote',
                        children: [{ name: 'paragraph', text: '' }],
                    },
                    { name: 'paragraph', text: 'after' },
                ],
            },
        ] as unknown as TState[]);
        const empty = contents(muya).find(content => content.text === '')!;
        enterAt(muya, empty, 0);
        await flush();

        const state = muya.getState() as unknown as Array<{
            name: string;
            children?: Array<{ name: string; text?: string }>;
        }>;
        expect(state).toHaveLength(1);
        expect(state[0].name).toBe('block-quote');
        expect(state[0].children).toEqual([
            { name: 'paragraph', text: 'before' },
            { name: 'paragraph', text: '' },
            { name: 'paragraph', text: 'after' },
        ]);
        expect(muya.editor.activeContentBlock?.getCursor()?.start.offset).toBe(0);
    });
});
