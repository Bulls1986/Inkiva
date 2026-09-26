// @vitest-environment happy-dom

import type Content from '../../block/base/content';
import * as json1 from 'ot-json1';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../muya';
import { SelectionCaretType, SelectionDirection } from '../../selection/types';
import { asDoc } from '../../state';

const hosts: HTMLElement[] = [];

beforeEach(() => {
    window.MUYA_VERSION = 'test';
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.getSelection()?.removeAllRanges();
    delete (window as Partial<Window>).MUYA_VERSION;
    while (hosts.length)
        hosts.pop()!.remove();
});

function bootMuya(markdown: string, options: Record<string, unknown> = {}): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, {
        markdown,
        autoPairMarkdownSyntax: false,
        ...options,
    } as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    hosts.push(muya.domNode);
    muya.clearHistory();
    return muya;
}

function firstContent(muya: Muya): Content {
    const content = muya.editor.scrollPage!.firstContentInDescendant()!;
    muya.editor.activeContentBlock = content;
    return content;
}

function contentByText(muya: Muya, text: string): Content {
    let target: Content | null = null;
    muya.editor.scrollPage!.breadthFirstTraverse((node) => {
        if (node.isContent() && node.text === text)
            target = node;
    });
    if (!target)
        throw new Error(`content block with text "${text}" not found`);
    return target;
}

function historyDepth(muya: Muya): number {
    return muya.getHistory().stack.undo.length;
}

function pasteEvent(text: string): ClipboardEvent {
    return {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clipboardData: {
            getData: (type: string) => (type === 'text/plain' ? text : ''),
            files: [],
            items: [],
        },
    } as unknown as ClipboardEvent;
}

function recordTyping(muya: Muya, content: Content, nextText: string): void {
    muya.editor.activeContentBlock = content;
    content.setCursor(content.text.length, content.text.length, true);
    muya.editor.history.markInputBoundary('insertText', nextText.at(-1) ?? null);
    content.text = nextText;
    muya.editor.jsonState.flush();
}

function tabAt(muya: Muya, content: Content): void {
    muya.editor.activeContentBlock = content;
    content.setCursor(0, 0, true);
    content.keydownHandler(new KeyboardEvent('keydown', { key: 'Tab' }));
    muya.editor.jsonState.flush();
}

function stubFullRange(muya: Muya, content: Content): void {
    const end = content.text.length;
    muya.editor.activeContentBlock = content;
    muya.editor.selection.setSelection(
        { offset: 0, block: content, path: content.path },
        { offset: end, block: content, path: content.path },
    );
    vi.spyOn(content, 'getCursor').mockReturnValue({
        start: { offset: 0 },
        end: { offset: end },
        anchor: { offset: 0, block: content, path: content.path },
        focus: { offset: end, block: content, path: content.path },
        isCollapsed: false,
        isSelectionInSameBlock: true,
        direction: SelectionDirection.FORWARD,
        type: SelectionCaretType.RANGE,
    });
}

describe('us13 user-operation boundaries', () => {
    it('keeps Enter as one standalone operation between typing groups', () => {
        const muya = bootMuya('a\n');
        const content = firstContent(muya);
        recordTyping(muya, content, 'ab');

        content.setCursor(2, 2, true);
        content.keydownHandler(new KeyboardEvent('keydown', { key: 'Enter' }));
        muya.editor.jsonState.flush();

        expect(historyDepth(muya)).toBe(2);
        expect(muya.getState()).toHaveLength(2);
    });

    it('keeps Shift+Enter as one standalone line-break operation', () => {
        const muya = bootMuya('a\n');
        const content = firstContent(muya);
        recordTyping(muya, content, 'ab');

        content.setCursor(2, 2, true);
        content.keydownHandler(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }));
        muya.editor.jsonState.flush();

        expect(historyDepth(muya)).toBe(2);
        expect(content.text).toBe('ab\n');
    });

    it('isolates the real custom Clipboard paste path from preceding typing', async () => {
        const muya = bootMuya('a\n');
        const content = firstContent(muya);
        recordTyping(muya, content, 'ab');
        content.setCursor(2, 2, true);

        await muya.editor.clipboard.pasteHandler(pasteEvent('PASTE'), 'PASTE', '');
        muya.editor.jsonState.flush();

        expect(muya.getMarkdown().trim()).toBe('abPASTE');
        expect(historyDepth(muya)).toBe(2);
        muya.undo();
        expect(muya.getMarkdown().trim()).toBe('ab');
    });

    it('keeps async pasted-image resolution inside one user Undo boundary', async () => {
        const imageAction = vi.fn(async () => '/assets/final.png');
        const muya = bootMuya('a\n', { imageAction });
        const content = firstContent(muya);
        recordTyping(muya, content, 'ab');
        content.setCursor(2, 2, true);

        await muya.editor.clipboard.pasteImage('/tmp/original.png');
        muya.editor.jsonState.flush();

        expect(imageAction).toHaveBeenCalledTimes(1);
        expect(muya.getMarkdown()).toContain('/assets/final.png');
        expect(historyDepth(muya)).toBe(2);
        muya.undo();
        expect(muya.getMarkdown().trim()).toBe('ab');
    });

    it('merges async image resolution back through newer user edits', async () => {
        let resolveImage: ((value: string) => void) | null = null;
        const imageAction = vi.fn(() => new Promise<string>((resolve) => {
            resolveImage = resolve;
        }));
        const muya = bootMuya('a\n', { imageAction });
        const content = firstContent(muya);
        recordTyping(muya, content, 'ab');
        content.setCursor(2, 2, true);

        const pendingPaste = muya.editor.clipboard.pasteImage('/tmp/original.png');
        expect(content.text).toContain('loading-');
        expect(historyDepth(muya)).toBe(2);

        recordTyping(muya, content, `${content.text}X`);
        expect(historyDepth(muya)).toBe(3);

        resolveImage!('/assets/final.png');
        await pendingPaste;
        muya.editor.jsonState.flush();

        expect(muya.getMarkdown()).toContain('/assets/final.png');
        expect(muya.getMarkdown()).toContain('X');
        expect(historyDepth(muya)).toBe(3);

        muya.undo();
        expect(muya.getMarkdown()).toContain('/assets/final.png');
        expect(muya.getMarkdown()).not.toContain('X');
        muya.undo();
        expect(muya.getMarkdown().trim()).toBe('ab');
    });

    it('preserves async image operation identity across undo and redo', async () => {
        let resolveImage: ((value: string) => void) | null = null;
        const imageAction = vi.fn(() => new Promise<string>((resolve) => {
            resolveImage = resolve;
        }));
        const muya = bootMuya('a\n', { imageAction });
        const content = firstContent(muya);
        recordTyping(muya, content, 'ab');
        content.setCursor(2, 2, true);

        const pendingPaste = muya.editor.clipboard.pasteImage('/tmp/original.png');
        expect(muya.getMarkdown()).toContain('loading-');
        expect(historyDepth(muya)).toBe(2);

        muya.undo();
        expect(muya.getMarkdown().trim()).toBe('ab');
        muya.redo();
        expect(muya.getMarkdown()).toContain('loading-');

        resolveImage!('/assets/final.png');
        await pendingPaste;
        muya.editor.jsonState.flush();

        expect(muya.getMarkdown()).toContain('/assets/final.png');
        expect(historyDepth(muya)).toBe(2);
        muya.undo();
        expect(muya.getMarkdown().trim()).toBe('ab');
    });

    it('isolates a formatting command from adjacent typing', () => {
        const muya = bootMuya('hello\n');
        const content = firstContent(muya);
        recordTyping(muya, content, 'hello!');
        stubFullRange(muya, content);

        muya.format('strong');
        muya.editor.jsonState.flush();

        expect(historyDepth(muya)).toBe(2);
        expect(content.text).toBe('**hello!**');
    });

    it('isolates image insertion from adjacent typing', () => {
        const muya = bootMuya('hello\n');
        const content = firstContent(muya);
        recordTyping(muya, content, 'hello!');
        content.setCursor(content.text.length, content.text.length, true);

        muya.insertImage({ src: 'https://example.com/cat.png', alt: 'cat' });
        muya.editor.jsonState.flush();

        expect(historyDepth(muya)).toBe(2);
        expect(muya.getMarkdown()).toContain('![cat](https://example.com/cat.png)');
    });

    it('isolates list indentation from the text edit that precedes it', () => {
        const muya = bootMuya('- a\n- b\n');
        const item = contentByText(muya, 'b');
        recordTyping(muya, item, 'bx');

        tabAt(muya, item);

        expect(historyDepth(muya)).toBe(2);
        expect(muya.getMarkdown()).toBe('- a\n  - bx\n');
    });

    it('records automatic fence conversion separately from typing the trigger', async () => {
        vi.useFakeTimers();
        const muya = bootMuya('\n');
        const content = firstContent(muya);
        const fence = String.fromCharCode(96).repeat(3);
        recordTyping(muya, content, fence);
        content.update();
        content.setCursor(fence.length, fence.length, true);

        content.inputHandler(new InputEvent('input', {
            data: String.fromCharCode(96),
            inputType: 'insertText',
            bubbles: true,
        }));
        await vi.advanceTimersByTimeAsync(300);
        muya.editor.jsonState.flush();

        expect(muya.getState()[0].name).toBe('code-block');
        expect(historyDepth(muya)).toBe(2);
    });

    it('records one IME commit separately from the preceding typing group', () => {
        const muya = bootMuya('a\n');
        const content = firstContent(muya);
        recordTyping(muya, content, 'ab');

        content.setCursor(2, 2, true);
        content.domNode!.dispatchEvent(new Event('compositionstart', { bubbles: true }));
        content.domNode!.innerHTML = '<span class="mu-syntax-text">ab你</span>';
        content.setCursor(3, 3);
        content.domNode!.dispatchEvent(new Event('compositionend', { bubbles: true }));
        muya.editor.jsonState.flush();

        expect(content.text).toBe('ab你');
        expect(historyDepth(muya)).toBe(2);
    });

    it('ends the typing group when the user moves the caret with an arrow key', () => {
        const muya = bootMuya('ab\n');
        const content = firstContent(muya);
        recordTyping(muya, content, 'abc');

        content.keydownHandler(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
        content.setCursor(2, 2, true);
        recordTyping(muya, content, 'abXc');

        expect(historyDepth(muya)).toBe(2);
    });

    it('undoes and redoes typing -> format -> typing one user operation at a time', () => {
        const muya = bootMuya('a\n');
        const content = firstContent(muya);
        recordTyping(muya, content, 'ab');
        stubFullRange(muya, content);
        muya.format('strong');
        muya.editor.jsonState.flush();
        vi.restoreAllMocks();

        recordTyping(muya, content, '**ab**c');
        expect(muya.getMarkdown().trim()).toBe('**ab**c');
        expect(historyDepth(muya)).toBe(3);

        muya.undo();
        expect(muya.getMarkdown().trim()).toBe('**ab**');
        muya.undo();
        expect(muya.getMarkdown().trim()).toBe('ab');
        muya.undo();
        expect(muya.getMarkdown().trim()).toBe('a');

        muya.redo();
        expect(muya.getMarkdown().trim()).toBe('ab');
        muya.redo();
        expect(muya.getMarkdown().trim()).toBe('**ab**');
        muya.redo();
        expect(muya.getMarkdown().trim()).toBe('**ab**c');
    });

    it('does not record api/derived json changes as user Undo items', () => {
        const muya = bootMuya('a\n\nother\n');
        const content = firstContent(muya);
        recordTyping(muya, content, 'ab');
        expect(historyDepth(muya)).toBe(1);

        const before = muya.editor.jsonState.getState()[1];
        const after = { ...before, text: 'derived' };
        const op = json1.replaceOp([1], asDoc(before), asDoc(after))!;
        muya.editor.jsonState.dispatch(op, 'api');

        expect(historyDepth(muya)).toBe(1);
    });

    it('ends the typing group when a click moves the caret', () => {
        const muya = bootMuya('ab\n');
        const content = firstContent(muya);
        recordTyping(muya, content, 'abc');

        content.domNode!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        content.setCursor(1, 1, true);
        muya.editor.history.markInputBoundary('insertText', 'X');
        content.text = 'aXbc';
        muya.editor.jsonState.flush();

        expect(historyDepth(muya)).toBe(2);
    });

    it('does not add an Undo item for a forced view-only rerender', () => {
        const muya = bootMuya('a\n');
        const content = firstContent(muya);
        recordTyping(muya, content, 'ab');
        expect(historyDepth(muya)).toBe(1);

        muya.setOptions({ footnote: !muya.options.footnote }, true);

        expect(historyDepth(muya)).toBe(1);
    });
});
