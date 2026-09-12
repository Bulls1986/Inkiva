// @vitest-environment happy-dom

import type { TState } from '../types';
import * as json1 from 'ot-json1';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Muya } from '../../muya';
import { asDoc } from '../index';
import { isTopLevelTocChange } from '../tocChange';

const bootedHosts: HTMLElement[] = [];

beforeEach(() => {
    window.MUYA_VERSION = 'test';
});

afterEach(() => {
    while (bootedHosts.length)
        bootedHosts.pop()!.remove();
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

function paragraph(text: string): TState {
    return {
        name: 'paragraph',
        text,
    } as TState;
}

function heading(text: string, level = 1): TState {
    return {
        name: 'atx-heading',
        meta: { level },
        text,
    } as TState;
}

describe('isTopLevelTocChange', () => {
    it('ignores edits inside a non-heading top-level block', () => {
        const previous = [paragraph('before')];
        const operation = json1.replaceOp([0, 'text'], 'before', 'after')!;

        expect(isTopLevelTocChange(operation, previous)).toBe(false);
    });

    it('marks edits inside a top-level heading as TOC changes', () => {
        const previous = [heading('# before')];
        const operation = json1.replaceOp([0, 'text'], '# before', '# after')!;

        expect(isTopLevelTocChange(operation, previous)).toBe(true);
    });

    it('detects top-level heading insertion and removal', () => {
        const previous = [paragraph('body')];

        expect(
            isTopLevelTocChange(
                json1.insertOp([1], asDoc(heading('# New')))!,
                previous,
            ),
        ).toBe(true);
        expect(
            isTopLevelTocChange(
                json1.removeOp([0])!,
                [heading('# Removed')],
            ),
        ).toBe(true);
        expect(
            isTopLevelTocChange(
                json1.removeOp([0])!,
                previous,
            ),
        ).toBe(false);
    });

    it('detects a top-level block changing into or out of a heading', () => {
        expect(
            isTopLevelTocChange(
                json1.replaceOp([0], asDoc(paragraph('body')), asDoc(heading('# Heading')))!,
                [paragraph('body')],
            ),
        ).toBe(true);
        expect(
            isTopLevelTocChange(
                json1.replaceOp([0], asDoc(heading('# Heading')), asDoc(paragraph('body')))!,
                [heading('# Heading')],
            ),
        ).toBe(true);
    });

    it('ignores headings nested in a block quote because getTOC is top-level only', () => {
        const previous = [{ name: 'block-quote', children: [] } as TState];
        const operation = json1.insertOp(
            [0, 'children', 0],
            asDoc(heading('# Nested')),
        )!;

        expect(isTopLevelTocChange(operation, previous)).toBe(false);
    });

    it('marks a compound operation when any affected root block is a heading', () => {
        const previous = [heading('# First'), paragraph('body')];
        const operation = json1.type.compose(
            json1.replaceOp([0, 'text'], '# First', '# Updated')!,
            json1.replaceOp([1, 'text'], 'body', 'changed')!,
        )!;

        expect(isTopLevelTocChange(operation, previous)).toBe(true);
    });

    it('treats the identity operation as unchanged', () => {
        expect(isTopLevelTocChange(null, [heading('# Heading')])).toBe(false);
        expect(isTopLevelTocChange([], [heading('# Heading')])).toBe(false);
    });

    it('publishes the classification on json-change without changing the event shape', () => {
        const muya = bootMuya('body\n');
        const changes: Array<{ tocChanged?: boolean }> = [];
        muya.eventCenter.on('json-change', (change) => {
            changes.push(change as { tocChanged?: boolean });
        });

        muya.editor.updateContents(
            json1.replaceOp([0, 'text'], 'body', 'updated')!,
            null,
            'user',
        );

        expect(changes).toHaveLength(1);
        expect(changes[0].tocChanged).toBe(false);
    });
});
