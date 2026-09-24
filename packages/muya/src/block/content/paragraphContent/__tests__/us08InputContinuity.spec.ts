// @vitest-environment happy-dom

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

    vi.useRealTimers();
    document.getSelection()?.removeAllRanges();
    if (hadVersion)
        window.MUYA_VERSION = originalVersion as string;
    else
        delete (window as Partial<Window>).MUYA_VERSION;
});

function bootMuya(): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, {
        markdown: '',
        autoPairMarkdownSyntax: false,
    } as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    bootedHosts.push(muya.domNode);
    return muya;
}

function firstContent(muya: Muya): Content {
    return muya.editor.scrollPage!.firstContentInDescendant() as Content;
}

function flush(): Promise<void> {
    return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

describe('us08 input continuity', () => {
    it('ac-39 keeps an exact triple-backtick trigger inert during IME composition', async () => {
        const muya = bootMuya();
        const content = firstContent(muya);

        content.text = '```';
        content.update();
        content.setCursor(3, 3, true);
        content.composeHandler(new Event('compositionstart'));
        content.inputHandler(new InputEvent('input', {
            data: '`',
            inputType: 'insertCompositionText',
            bubbles: true,
        }));

        await flush();

        const state = muya.getState();
        expect(state).toHaveLength(1);
        expect(state[0].name).toBe('paragraph');
        expect((state[0] as { text: string }).text).toBe('```');
    });

    it('ac-38 converts an exact triple-backtick trigger before Enter', async () => {
        vi.useFakeTimers();
        const muya = bootMuya();
        const content = firstContent(muya);

        content.text = '```';
        content.update();
        content.setCursor(3, 3, true);
        content.inputHandler(new InputEvent('input', {
            data: '`',
            inputType: 'insertText',
            bubbles: true,
        }));

        expect(muya.getState()[0].name).toBe('paragraph');
        await vi.advanceTimersByTimeAsync(300);

        const state = muya.getState();
        expect(state).toHaveLength(1);
        expect(state[0].name).toBe('code-block');
        expect((state[0] as { text: string }).text).toBe('');
        expect(muya.editor.activeContentBlock?.blockName).toBe('codeblock.content');
    });

    it('ac-38 preserves language-qualified fence typing during the disambiguation window', async () => {
        vi.useFakeTimers();
        const muya = bootMuya();
        const content = firstContent(muya);

        content.text = '```';
        content.update();
        content.setCursor(3, 3, true);
        content.inputHandler(new InputEvent('input', {
            data: '`',
            inputType: 'insertText',
            bubbles: true,
        }));

        content.text = '```p';
        content.update();
        content.setCursor(4, 4, true);
        content.inputHandler(new InputEvent('input', {
            data: 'p',
            inputType: 'insertText',
            bubbles: true,
        }));

        await vi.advanceTimersByTimeAsync(300);

        const state = muya.getState();
        expect(state).toHaveLength(1);
        expect(state[0].name).toBe('paragraph');
        expect((state[0] as { text: string }).text).toBe('```p');
    });
});
