// @vitest-environment happy-dom

import type { TState } from '../types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../muya';
import { MarkdownToState } from '../markdownToState';
import StateToMarkdown from '../stateToMarkdown';

const bootedHosts: HTMLElement[] = [];

beforeEach(() => {
    window.MUYA_VERSION = 'test';
});

afterEach(() => {
    while (bootedHosts.length)
        bootedHosts.pop()!.remove();
    document.getSelection()?.removeAllRanges();
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

function undoDepth(muya: Muya): number {
    // @ts-expect-error — Stage C0 intentionally locks the internal history boundary.
    return muya.editor.history._stack.undo.length;
}

describe('pr-c stage c0 — state architecture contract', () => {
    it('keeps public snapshots isolated while the renderer source stays authoritative', () => {
        const muya = bootMuya('alpha\n\nbeta\n');
        const jsonState = muya.editor.jsonState;

        const publicSnapshot = jsonState.getState();
        const renderSource = jsonState.getStateForRender();

        expect(publicSnapshot).toEqual(renderSource);
        expect(publicSnapshot).not.toBe(renderSource);

        (publicSnapshot[0] as { text: string }).text = 'mutated-copy';
        expect(muya.getMarkdown()).toContain('alpha');
        expect(muya.getMarkdown()).not.toContain('mutated-copy');

        expect(jsonState.getStateForRender()).toBe(renderSource);
    });

    it('composes same-frame deferred edits into one change and one undo boundary', async () => {
        const muya = bootMuya('body\n');
        const jsonState = muya.editor.jsonState;
        const changes: Array<{ source?: string; mutationKind?: string; prevDoc?: TState[]; doc?: TState[] }> = [];

        muya.eventCenter.on('json-change', (change) => {
            changes.push(change as typeof changes[number]);
        });

        jsonState.replaceOperation([0, 'text'], 'body', 'body-one');
        jsonState.replaceOperation([0, 'text'], 'body-one', 'body-two');

        expect(muya.getMarkdown().trim()).toBe('body');
        expect(changes).toHaveLength(0);

        jsonState.flush();

        expect(muya.getMarkdown().trim()).toBe('body-two');
        expect(changes).toHaveLength(1);
        expect(changes[0].source).toBe('user');
        expect(changes[0].mutationKind).toBe('text-only');
        expect(changes[0].prevDoc?.[0]).toMatchObject({ name: 'paragraph', text: 'body' });
        expect(changes[0].doc?.[0]).toMatchObject({ name: 'paragraph', text: 'body-two' });

        await vi.waitFor(() => expect(undoDepth(muya)).toBe(1));
    });

    it('drops an outgoing document batch before setContent replaces the source of truth', () => {
        const muya = bootMuya('outgoing\n');
        const jsonState = muya.editor.jsonState;
        let changes = 0;

        muya.eventCenter.on('json-change', () => {
            changes += 1;
        });

        jsonState.replaceOperation([0, 'text'], 'outgoing', 'stale-edit');
        jsonState.setContent('incoming\n');
        jsonState.flush();

        expect(muya.getMarkdown().trim()).toBe('incoming');
        expect(changes).toBe(0);
    });

    it('drops deferred work after dispose instead of publishing a late mutation', () => {
        const muya = bootMuya('before-dispose\n');
        const jsonState = muya.editor.jsonState;
        let changes = 0;

        muya.eventCenter.on('json-change', () => {
            changes += 1;
        });

        jsonState.replaceOperation([0, 'text'], 'before-dispose', 'late-edit');
        jsonState.dispose();
        jsonState.flush();

        expect(changes).toBe(0);
        expect(muya.getMarkdown().trim()).toBe('before-dispose');
    });
});

describe('pr-c stage c0 — markdown/state compatibility contract', () => {
    it('round-trips representative nested markdown without losing document structure', () => {
        const markdown = [
            '# Title',
            '',
            '> quote',
            '>',
            '> - nested item',
            '',
            '- [x] task',
            '- [ ] open',
            '',
            '~~~ts',
            'const answer = 42;',
            '~~~',
            '',
            '| key | value |',
            '| --- | ----- |',
            '| a   | b     |',
            '',
        ].join('\n');

        const options = {
            footnote: false,
            math: true,
            isGitlabCompatibilityEnabled: false,
            trimUnnecessaryCodeBlockEmptyLines: false,
            frontMatter: true,
        };

        const state = new MarkdownToState(options).generate(markdown);
        const serialized = new StateToMarkdown({ listIndentation: 1 }).generate(state);
        const reparsed = new MarkdownToState(options).generate(serialized);

        expect(reparsed).toEqual(state);
        expect(serialized).toContain('# Title');
        expect(serialized).toContain('nested item');
        expect(serialized).toContain('const answer = 42;');
        expect(serialized).toContain('| a');
    });
});
