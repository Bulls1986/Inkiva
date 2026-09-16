// @vitest-environment happy-dom

import type Parent from '../../base/parent';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../../muya';
import {
    PROGRESSIVE_RENDER_INITIAL_BLOCKS,
    PROGRESSIVE_RENDER_THRESHOLD,
    ScrollPage,
} from '../index';

const mountedEditors: Muya[] = [];

afterEach(() => {
    while (mountedEditors.length) {
        const muya = mountedEditors.pop()!;
        muya.destroy();
        muya.domNode.remove();
    }
});

function paragraphs(count: number): string {
    return `${Array.from({ length: count }, (_, index) => `paragraph ${index}`).join('\n\n')}\n`;
}

describe('scrollPage progressive rendering', () => {
    it('defers the progressive tail to idle time and cancels stale work', async () => {
        vi.useFakeTimers();
        const idleCallbacks = new Map<number, () => void>();
        let nextIdleCallbackId = 0;
        const requestIdleCallback = vi.fn((callback: () => void) => {
            const id = ++nextIdleCallbackId;
            idleCallbacks.set(id, callback);
            return id;
        });
        const cancelIdleCallback = vi.fn((id: number) => {
            idleCallbacks.delete(id);
        });
        vi.stubGlobal('requestIdleCallback', requestIdleCallback);
        vi.stubGlobal('cancelIdleCallback', cancelIdleCallback);

        const host = document.createElement('div');
        document.body.appendChild(host);
        const muya = new Muya(host, { markdown: paragraphs(PROGRESSIVE_RENDER_THRESHOLD + 20) });
        mountedEditors.push(muya);

        try {
            muya.init();
            await vi.runAllTimersAsync();

            expect(requestIdleCallback).toHaveBeenCalledTimes(1);
            const staleTail = idleCallbacks.values().next().value as (() => void) | undefined;
            expect(staleTail).toBeDefined();

            muya.setContent('replacement\n');

            expect(cancelIdleCallback).toHaveBeenCalledTimes(1);
            staleTail?.();
            await muya.whenRenderComplete();

            expect(muya.editor.scrollPage!.children.length).toBe(1);
            expect(muya.getMarkdown()).toContain('replacement');
        }
        finally {
            vi.unstubAllGlobals();
            vi.useRealTimers();
        }
    });

    it('does not clone the progressive tail before the initial render window', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const totalBlocks = PROGRESSIVE_RENDER_THRESHOLD + 20;
        const originalStructuredClone = structuredClone;
        const clonedSizes: number[] = [];

        vi.stubGlobal('structuredClone', <T>(value: T): T => {
            clonedSizes.push(Array.isArray(value) ? value.length : 1);
            return originalStructuredClone(value);
        });

        try {
            const muya = new Muya(host, { markdown: paragraphs(totalBlocks) });
            mountedEditors.push(muya);
            muya.init();

            // A full AST clone makes the first paint pay for the progressive
            // tail. The initial mount should only clone the visible window;
            // the background tail clone happens only after this point.
            expect(clonedSizes).not.toContain(totalBlocks);
            expect(clonedSizes).toEqual([PROGRESSIVE_RENDER_INITIAL_BLOCKS]);

            await muya.whenRenderComplete();

            // Keep each deferred clone bounded so one large structuredClone
            // cannot block the first scroll sample.
            expect(clonedSizes).not.toContain(totalBlocks - PROGRESSIVE_RENDER_INITIAL_BLOCKS);
            expect(clonedSizes.filter(size => size === 1).length).toBeGreaterThan(0);
        }
        finally {
            vi.unstubAllGlobals();
        }
    });

    it('keeps rendered block state isolated from the authoritative JSON state', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const muya = new Muya(host, { markdown: '# heading\n' });
        mountedEditors.push(muya);

        muya.init();

        const liveHeading = muya.editor.scrollPage!.firstChild as unknown as {
            meta: { level: number };
        };
        const sourceState = muya.getState()[0] as unknown as { meta: { level: number } };
        const sourceLevel = sourceState.meta.level;
        liveHeading.meta.level = sourceLevel + 1;

        expect((muya.getState()[0] as unknown as { meta: { level: number } }).meta.level)
            .toBe(sourceLevel);
    });

    it('keeps a cached state isolated after a zero-copy content switch', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const muya = new Muya(host, { markdown: 'cached content\n' });
        mountedEditors.push(muya);

        muya.init();
        const cachedState = muya.getState();
        muya.setContent(cachedState);

        const firstContent = muya.editor.scrollPage!.firstContentInDescendant() as unknown as {
            text: string;
        };
        firstContent.text = 'edited after switch';
        muya.flush();

        expect((cachedState[0] as unknown as { text: string }).text).toBe('cached content');
        expect(muya.getMarkdown()).toContain('edited after switch');
    });

    it('reuses parsed Markdown state without sharing later edits', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const muya = new Muya(host, { markdown: 'cached markdown\n' });
        mountedEditors.push(muya);

        muya.init();
        const cachedState = muya.editor.jsonState.getStateForRender();
        muya.setContent('cached markdown\n');

        expect(muya.editor.jsonState.getStateForRender()).toBe(cachedState);

        muya.focus();
        muya.insertParagraph('after', 'changed markdown');
        muya.flush();
        muya.setContent('cached markdown\n');

        expect(muya.getMarkdown()).toContain('cached markdown');
        expect(muya.getMarkdown()).not.toContain('changed markdown');
        expect((cachedState[0] as unknown as { text: string }).text).toBe('cached markdown');
    });

    it('restores a warm rendered tree by cache key', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const contentA = paragraphs(PROGRESSIVE_RENDER_THRESHOLD + 20);
        const contentB = paragraphs(PROGRESSIVE_RENDER_THRESHOLD + 20)
            .replace('paragraph 0', 'other document 0');
        const muya = new Muya(host, { markdown: contentA });
        mountedEditors.push(muya);

        muya.init();
        muya.setContent(contentA, false, true, 0, 'tab-a');
        await muya.whenRenderComplete();
        const scrollPage = muya.editor.scrollPage!;
        const firstA = scrollPage.firstChild as Parent;
        const disposeA = vi.spyOn(firstA, 'dispose');

        muya.setContent(contentB, false, true, 0, 'tab-b');
        await muya.whenRenderComplete();
        expect(scrollPage.firstContentInDescendant()?.text).toContain('other document 0');

        muya.setContent(contentA, false, true, 0, 'tab-a');
        await muya.whenRenderComplete();

        expect(scrollPage.firstChild).toBe(firstA);
        expect(disposeA).not.toHaveBeenCalled();
        expect(scrollPage.firstContentInDescendant()?.text).toBe('paragraph 0');
    });

    it('rebuilds instead of restoring a stale warm tree', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const contentA = paragraphs(PROGRESSIVE_RENDER_THRESHOLD + 20);
        const contentB = contentA.replace('paragraph 0', 'changed document 0');
        const muya = new Muya(host, { markdown: contentA });
        mountedEditors.push(muya);

        muya.init();
        muya.setContent(contentA, false, true, 0, 'tab-a');
        await muya.whenRenderComplete();
        const firstA = muya.editor.scrollPage!.firstChild;

        muya.setContent(contentB, false, true, 0, 'tab-b');
        await muya.whenRenderComplete();
        muya.setContent('replacement\n', false, true, 0, 'tab-a');
        await muya.whenRenderComplete();

        expect(muya.editor.scrollPage!.firstChild).not.toBe(firstA);
        expect(muya.editor.scrollPage!.firstContentInDescendant()?.text).toBe('replacement');
    });

    it('detaches the previous rendered tree before disposing it', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const muya = new Muya(host, { markdown: 'before\n' });
        mountedEditors.push(muya);

        muya.init();
        const oldBlock = muya.editor.scrollPage!.firstChild as Parent;
        const dispose = vi.spyOn(oldBlock, 'dispose');

        muya.setContent('after\n');

        expect(oldBlock.parent).toBeNull();
        expect(host.contains(oldBlock.domNode ?? null)).toBe(false);
        expect(dispose).not.toHaveBeenCalled();
    });

    it('mounts only the initial block window before completing in the background', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const muya = new Muya(host, { markdown: paragraphs(PROGRESSIVE_RENDER_THRESHOLD + 20) });
        mountedEditors.push(muya);

        muya.init();

        const scrollPage = muya.editor.scrollPage!;
        expect(scrollPage.children.length).toBe(PROGRESSIVE_RENDER_INITIAL_BLOCKS);
        expect(scrollPage.isProgressiveRenderPending()).toBe(true);
        expect(scrollPage.domNode!.querySelectorAll('.mu-paragraph')).toHaveLength(
            PROGRESSIVE_RENDER_INITIAL_BLOCKS,
        );

        await muya.whenRenderComplete();

        expect(scrollPage.isProgressiveRenderPending()).toBe(false);
        expect(scrollPage.children.length).toBe(PROGRESSIVE_RENDER_THRESHOLD + 20);
        expect(scrollPage.domNode!.querySelectorAll('.mu-paragraph')).toHaveLength(
            PROGRESSIVE_RENDER_THRESHOLD + 20,
        );
    });

    it('cancels stale progressive work when content is replaced', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const muya = new Muya(host, { markdown: paragraphs(PROGRESSIVE_RENDER_THRESHOLD + 20) });
        mountedEditors.push(muya);

        muya.init();
        muya.setContent('replacement\n');
        await muya.whenRenderComplete();

        const scrollPage = muya.editor.scrollPage!;
        expect(scrollPage.isProgressiveRenderPending()).toBe(false);
        expect(scrollPage.children.length).toBe(1);
        expect(scrollPage.firstContentInDescendant()!.text).toBe('replacement');
        expect(scrollPage.domNode!.querySelectorAll('.mu-paragraph')).toHaveLength(1);
    });

    it('keeps immediate cursor restoration on a complete tree', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const targetIndex = PROGRESSIVE_RENDER_THRESHOLD + 10;
        const muya = new Muya(host, { markdown: paragraphs(targetIndex + 1) });
        mountedEditors.push(muya);

        muya.init();
        const restored = muya.setCursorByOffset({
            anchor: { line: targetIndex * 2, ch: 5 },
            focus: { line: targetIndex * 2, ch: 5 },
        });

        expect(restored).toBe(true);
        expect(muya.editor.scrollPage!.isProgressiveRenderPending()).toBe(false);
        expect(muya.editor.selection.getSelection()!.anchor.block.text).toBe(
            `paragraph ${targetIndex}`,
        );
    });

    it('keeps a user-inserted top-level block before the progressive tail', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const muya = new Muya(host, { markdown: paragraphs(PROGRESSIVE_RENDER_THRESHOLD + 20) });
        mountedEditors.push(muya);

        muya.init();

        const inserted = ScrollPage.loadBlock('paragraph').create(muya, {
            name: 'paragraph',
            text: 'inserted while rendering',
        });
        muya.editor.scrollPage!.append(inserted, 'user');

        await muya.whenRenderComplete();
        muya.flush();

        const texts = Array.from(muya.editor.scrollPage!.children.iterator())
            .map(block => (block as Parent).firstContentInDescendant()?.text);
        expect(texts[PROGRESSIVE_RENDER_INITIAL_BLOCKS]).toBe('inserted while rendering');
        expect(texts[PROGRESSIVE_RENDER_INITIAL_BLOCKS + 1]).toBe('paragraph 32');
        expect(Array.from(muya.editor.scrollPage!.domNode!.children)
            .map(node => node.textContent)
            .filter(text => text === 'inserted while rendering' || text === 'paragraph 32'))
            .toEqual(['inserted while rendering', 'paragraph 32']);
    });
});
