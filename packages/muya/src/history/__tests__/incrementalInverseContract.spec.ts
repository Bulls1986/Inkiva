// @vitest-environment happy-dom

import * as json1 from 'ot-json1';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Muya } from '../../muya';
import { asDoc } from '../../state';

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
    // @ts-expect-error — Stage C1 intentionally locks the internal history boundary.
    return muya.editor.history._stack.undo.length;
}

describe('pr-c stage c1 — incremental history inverse contract', () => {
    it('records a structural change from a precomputed inverse without materializing prevDoc', () => {
        const muya = bootMuya('body\n');
        const previous = muya.editor.jsonState.getStateForRender();
        const replacement = { name: 'atx-heading', meta: { level: 1 }, text: '# body' };
        const op = json1.replaceOp([0], asDoc(previous[0]!), asDoc(replacement as never))!;
        const inverseOp = json1.type.invertWithDoc(op, asDoc(previous))!;

        const change = {
            op,
            inverseOp,
            source: 'user',
            mutationKind: 'structural' as const,
            get prevDoc(): never {
                throw new Error('Stage C1 history must not materialize the full previous document');
            },
            get doc() {
                return previous;
            },
        };

        expect(() => muya.eventCenter.emit('json-change', change)).not.toThrow();
        expect(undoDepth(muya)).toBe(1);
    });

    it('publishes the structural inverse from JSONState and preserves undo/redo', () => {
        const muya = bootMuya('# before\n');
        let emittedInverse: unknown;

        muya.eventCenter.on('json-change', (change) => {
            emittedInverse = (change as { inverseOp?: unknown }).inverseOp;
        });

        const op = json1.replaceOp([0, 'text'], '# before', '# after')!;
        muya.editor.updateContents(op, null, 'user');

        expect(emittedInverse).toBeDefined();
        expect(muya.getMarkdown().trim()).toBe('# after');

        muya.editor.history.undo();
        expect(muya.getMarkdown().trim()).toBe('# before');

        muya.editor.history.redo();
        expect(muya.getMarkdown().trim()).toBe('# after');
    });
});
