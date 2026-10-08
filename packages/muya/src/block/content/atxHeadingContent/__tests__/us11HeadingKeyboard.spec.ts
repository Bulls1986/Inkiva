// @vitest-environment happy-dom

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

function firstContent(muya: Muya): Content {
    return muya.editor.scrollPage!.firstContentInDescendant()!;
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

describe('us11 / AC-49 — ATX heading keyboard structure', () => {
    it('enter at heading end creates a normal paragraph after the heading', async () => {
        const muya = boot('## alpha\n');
        const heading = firstContent(muya);
        keyAt(muya, heading, 'Enter', heading.text.length);
        await flush();

        const state = muya.getState() as Array<{ name: string; text?: string; meta?: { level?: number } }>;
        expect(state).toHaveLength(2);
        expect(state[0]).toMatchObject({ name: 'atx-heading', meta: { level: 2 }, text: '## alpha' });
        expect(state[1]).toMatchObject({ name: 'paragraph', text: '' });
        expect(muya.editor.activeContentBlock?.blockName).toBe('paragraph.content');
        expect(muya.editor.activeContentBlock?.getCursor()?.start.offset).toBe(0);
    });

    it('enter in heading middle keeps the first half as the same-level heading and moves the tail to a paragraph', async () => {
        const muya = boot('## alphabeta\n');
        const heading = firstContent(muya);
        keyAt(muya, heading, 'Enter', '## alpha'.length);
        await flush();

        const state = muya.getState() as Array<{ name: string; text?: string; meta?: { level?: number } }>;
        expect(state).toHaveLength(2);
        expect(state[0]).toMatchObject({ name: 'atx-heading', meta: { level: 2 }, text: '## alpha' });
        expect(state[1]).toMatchObject({ name: 'paragraph', text: 'beta' });
        expect(muya.editor.activeContentBlock?.text).toBe('beta');
        expect(muya.editor.activeContentBlock?.getCursor()?.start.offset).toBe(0);
    });

    it('backspace at heading start converts to a paragraph without deleting heading text', async () => {
        const muya = boot('### alpha\n');
        const heading = firstContent(muya);
        keyAt(muya, heading, 'Backspace', 0);
        await flush();

        const state = muya.getState() as Array<{ name: string; text?: string }>;
        expect(state).toEqual([{ name: 'paragraph', text: 'alpha' }]);
        expect(muya.editor.activeContentBlock?.blockName).toBe('paragraph.content');
        expect(muya.editor.activeContentBlock?.getCursor()?.start.offset).toBe(0);
    });
});
