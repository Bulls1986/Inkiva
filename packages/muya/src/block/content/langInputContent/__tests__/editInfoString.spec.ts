// @vitest-environment happy-dom
import type { ICodeBlockState, IDiagramState } from '../../../../state/types';
import { afterEach, describe, expect, it } from 'vitest';
import { Muya } from '../../../../muya';

const bootedHosts: HTMLElement[] = [];

afterEach(() => {
    while (bootedHosts.length)
        bootedHosts.pop()!.remove();
    document.getSelection()?.removeAllRanges();
});

function boot(markdown: string): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { markdown } as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    bootedHosts.push(muya.domNode);
    return muya;
}

interface ILangInput {
    domNode: HTMLElement;
    inputHandler: () => void;
}

function firstLangInput(muya: Muya): ILangInput {
    const codeBlock = muya.editor.scrollPage!.firstChild as unknown as {
        firstContentInDescendant: () => ILangInput;
    };
    return codeBlock.firstContentInDescendant();
}

function replaceLanguage(input: ILangInput, language: string) {
    input.domNode.textContent = language;
    const range = document.createRange();
    range.selectNodeContents(input.domNode);
    range.collapse(false);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    input.inputHandler();
}

describe('language input edits the whole info string (#4770 follow-up)', () => {
    it('keeps a typed multi-word info string instead of truncating it', () => {
        const muya = boot('```js\nx\n```\n');
        const li = firstLangInput(muya);
        // Emulate typing the full info string into the language input, with the
        // caret inside it (inputHandler reads the live selection).
        li.domNode.textContent = 'js title="app.js"';
        const range = document.createRange();
        range.selectNodeContents(li.domNode);
        range.collapse(false);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);

        li.inputHandler();
        muya.editor.jsonState.flush();
        expect(muya.getMarkdown().split('\n')[0]).toBe('```js title="app.js"');
    });

    it('converts an existing code fence into a diagram when its language changes', () => {
        const muya = boot('```js\ngraph TD\n  A --> B\n```\n');
        const input = firstLangInput(muya);

        replaceLanguage(input, 'mermaid');
        muya.editor.jsonState.flush();

        const state = muya.getState()[0] as IDiagramState;
        expect(state.name).toBe('diagram');
        expect(state.meta.type).toBe('mermaid');
        expect(state.text).toBe('graph TD\n  A --> B');
        expect(muya.domNode.querySelector('figure.mu-diagram-block')).not.toBeNull();
    });

    it('keeps an untyped fence as a normal code block without a preview', () => {
        const muya = boot('```\ngraph TD\n  A --> B\n```\n');
        const state = muya.getState()[0] as ICodeBlockState;

        expect(state.name).toBe('code-block');
        expect(muya.domNode.querySelector('figure.mu-diagram-block')).toBeNull();
    });

    it('exposes the diagram language input so a mislabelled diagram can be corrected', () => {
        const muya = boot('```mermaid\n@startuml\nAlice -> Bob: Hello\n@enduml\n```\n');
        const input = firstLangInput(muya);

        expect(input.domNode.textContent).toBe('mermaid');
        replaceLanguage(input, 'plantuml');
        muya.editor.jsonState.flush();

        const state = muya.getState()[0] as IDiagramState;
        expect(state.name).toBe('diagram');
        expect(state.meta.type).toBe('plantuml');
        expect(state.text).toBe('@startuml\nAlice -> Bob: Hello\n@enduml');
        expect((muya.editor.scrollPage!.firstChild as unknown as {
            firstContentInDescendant: () => ILangInput;
        }).firstContentInDescendant().domNode.textContent).toBe('plantuml');
    });
});
