// @vitest-environment happy-dom

import type { Muya } from '../../../../muya';
import type TableCellContent from '../index';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLASS_NAMES } from '../../../../config';
import { Muya as MuyaClass } from '../../../../muya';

vi.mock('../../../../utils/prism/index', () => ({
    default: {},
    walkTokens: () => null,
    loadedLanguages: new Set(),
    transformAliasToOrigin: (s: string) => s,
    loadLanguage: () => Promise.resolve([]),
    search: () => [],
}));

const bootedMuyas: Muya[] = [];
let hadVersion = false;
let originalVersion: string | undefined;

beforeEach(() => {
    hadVersion = 'MUYA_VERSION' in window;
    originalVersion = window.MUYA_VERSION;
    window.MUYA_VERSION = 'test';
});

afterEach(() => {
    window.getSelection()?.removeAllRanges();
    while (bootedMuyas.length)
        bootedMuyas.pop()!.destroy();

    if (hadVersion)
        window.MUYA_VERSION = originalVersion as string;
    else
        delete (window as Partial<Window>).MUYA_VERSION;
});

function bootMuya(markdown: string): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new MuyaClass(host, { markdown } as ConstructorParameters<typeof MuyaClass>[1]);
    muya.init();
    bootedMuyas.push(muya);
    return muya;
}

function firstCell(muya: Muya): TableCellContent {
    return muya.editor.scrollPage!.firstContentInDescendant()! as TableCellContent;
}

function expectNativeCaretAtLogicalOffset(cell: TableCellContent, offset: number) {
    const selection = window.getSelection();

    expect(selection).not.toBeNull();
    expect(selection!.rangeCount).toBe(1);
    expect(selection!.isCollapsed).toBe(true);
    expect(selection!.anchorNode).not.toBeNull();

    const anchorElement = selection!.anchorNode instanceof Element
        ? selection!.anchorNode
        : selection!.anchorNode!.parentElement;

    expect(anchorElement?.closest(
        `.${CLASS_NAMES.MU_HIDE}, .${CLASS_NAMES.MU_OUTPUT_REMOVE}`,
    )).toBeNull();

    const cursor = cell.getCursor();
    expect(cursor?.isCollapsed).toBe(true);
    expect(cursor?.start.offset).toBe(offset);
    expect(cursor?.end.offset).toBe(offset);
}

function insertTextAtNativeCaret(cell: TableCellContent, text: string) {
    const selection = window.getSelection()!;
    expect(selection.rangeCount).toBe(1);

    const range = selection.getRangeAt(0);
    range.deleteContents();

    const inserted = document.createTextNode(text);
    range.insertNode(inserted);
    range.setStart(inserted, inserted.length);
    range.collapse(true);

    selection.removeAllRanges();
    selection.addRange(range);

    cell.inputHandler(new InputEvent('input', {
        data: text,
        inputType: 'insertText',
        bubbles: true,
    }));
}

describe('p0 table hard-break caret correctness', () => {
    it('keeps Shift+Enter caret outside hidden source syntax and allows uninterrupted typing', () => {
        const muya = bootMuya('| alpha | beta |\n| --- | --- |\n');
        const cell = firstCell(muya);

        cell.setCursor(cell.text.length, cell.text.length, true);
        cell.enterHandler(new KeyboardEvent('keydown', {
            key: 'Enter',
            shiftKey: true,
            bubbles: true,
        }));

        expect(cell.text).toBe('alpha<br>');
        expect(cell.domNode?.querySelectorAll('br')).toHaveLength(1);
        expectNativeCaretAtLogicalOffset(cell, 'alpha<br>'.length);

        for (const char of 'beta')
            insertTextAtNativeCaret(cell, char);

        expect(cell.text).toBe('alpha<br>beta');
        muya.editor.jsonState.flush();
        expect(muya.getMarkdown()).toContain('| alpha<br>beta |');
        expectNativeCaretAtLogicalOffset(cell, 'alpha<br>beta'.length);
    });

    it('keeps the caret valid when typed <br> changes from plain text into an html_tag token', () => {
        const muya = bootMuya('| alpha | beta |\n| --- | --- |\n');
        const cell = firstCell(muya);

        cell.setCursor(cell.text.length, cell.text.length, true);

        for (const char of '<br>')
            insertTextAtNativeCaret(cell, char);

        expect(cell.text).toBe('alpha<br>');
        expect(cell.domNode?.querySelectorAll('br')).toHaveLength(1);
        expect(cell.domNode?.querySelectorAll(
            `.${CLASS_NAMES.MU_HIDE}.${CLASS_NAMES.MU_HTML_TAG}.${CLASS_NAMES.MU_OUTPUT_REMOVE}`,
        )).toHaveLength(1);
        expectNativeCaretAtLogicalOffset(cell, 'alpha<br>'.length);

        for (const char of 'beta')
            insertTextAtNativeCaret(cell, char);

        expect(cell.text).toBe('alpha<br>beta');
        muya.editor.jsonState.flush();
        expect(muya.getMarkdown()).toContain('| alpha<br>beta |');
        expectNativeCaretAtLogicalOffset(cell, 'alpha<br>beta'.length);
    });
});
