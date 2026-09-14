// @vitest-environment happy-dom

import type Content from '../../block/base/content';
import type Parent from '../../block/base/parent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../muya';

const bootedMuyas: Muya[] = [];

beforeEach(() => {
    window.MUYA_VERSION = 'test';
});

afterEach(() => {
    while (bootedMuyas.length)
        bootedMuyas.pop()!.destroy();

    document.getSelection()?.removeAllRanges();
    delete (window as Partial<Window>).MUYA_VERSION;
});

function bootMuya(markdown: string): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { markdown } as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    bootedMuyas.push(muya);
    return muya;
}

function contentAt(muya: Muya, index: number): Content {
    const block = muya.editor.scrollPage!.find(index) as unknown as Parent;
    return block.firstContentInDescendant()!;
}

describe('native Selection lifecycle', () => {
    it('does not call extend when the browser rejects addRange', () => {
        const muya = bootMuya('hello world\n');
        const content = contentAt(muya, 0);
        const nativeSelection = document.getSelection()!;
        const addRange = vi.spyOn(nativeSelection, 'addRange').mockImplementation(() => {});

        expect(() => {
            muya.editor.selection.setSelection(
                { offset: 0, block: content, path: content.path },
                { offset: 5, block: content, path: content.path },
            );
        }).not.toThrow();
        expect(nativeSelection.rangeCount).toBe(0);

        addRange.mockRestore();
    });

    it('clears a removed block range and repairs stale endpoints to live content', () => {
        const muya = bootMuya('---\ntitle: hi\n---\n\nbody\n');
        const frontmatter = muya.editor.scrollPage!.find(0) as unknown as Parent;
        const frontmatterContent = frontmatter.lastContentInDescendant()!;
        const bodyContent = contentAt(muya, 1);
        const staleAnchor = { offset: 2, block: frontmatterContent, path: frontmatterContent.path };
        const staleFocus = { offset: 2, block: bodyContent, path: bodyContent.path };

        muya.editor.selection.setSelection(staleAnchor, staleFocus);
        expect(document.getSelection()?.rangeCount).toBe(1);

        frontmatter.remove('api');
        expect(document.getSelection()?.rangeCount).toBe(0);

        expect(() => muya.editor.selection.setSelection(staleAnchor, staleFocus)).not.toThrow();
        const repaired = muya.editor.selection.getSelection();
        expect(repaired?.anchor.block).toBe(repaired?.focus.block);
        expect(repaired?.anchor.block.domNode?.isConnected).toBe(true);
    });
});
