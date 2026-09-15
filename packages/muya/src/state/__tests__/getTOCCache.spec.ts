import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getTOC } from '../getTOC';

const tokenizerSpy = vi.hoisted(() => vi.fn());

vi.mock('../../inlineRenderer/lexer', async () => {
    const actual = await vi.importActual<typeof import('../../inlineRenderer/lexer')>(
        '../../inlineRenderer/lexer',
    );
    tokenizerSpy.mockImplementation(actual.tokenizer);
    return { ...actual, tokenizer: tokenizerSpy };
});

interface IFakeHeading {
    blockName: 'atx-heading';
    meta: { level: number };
    children: { head: { text: string } };
}

function createDocument(...headings: string[]): { muya: never; nodes: IFakeHeading[] } {
    const nodes = headings.map(text => ({
        blockName: 'atx-heading' as const,
        meta: { level: 2 },
        children: { head: { text } },
    }));
    return {
        nodes,
        muya: {
            options: { superSubScript: false, footnote: false },
            editor: { scrollPage: { children: { iterator: () => nodes } } },
        } as never,
    };
}

describe('getTOC heading render cache', () => {
    beforeEach(() => {
        tokenizerSpy.mockClear();
    });

    it('reuses unchanged headings while invalidating only the edited heading', () => {
        const { muya, nodes } = createDocument('## First **heading**', '## Second _heading_');

        expect(getTOC(muya)).toMatchObject([
            { content: 'First heading', githubSlug: 'first-heading' },
            { content: 'Second heading', githubSlug: 'second-heading' },
        ]);
        expect(tokenizerSpy).toHaveBeenCalledTimes(2);

        expect(getTOC(muya)).toHaveLength(2);
        expect(tokenizerSpy).toHaveBeenCalledTimes(2);

        nodes[0].children.head.text = '## First **edited**';
        expect(getTOC(muya)).toMatchObject([
            { content: 'First edited', githubSlug: 'first-edited' },
            { content: 'Second heading', githubSlug: 'second-heading' },
        ]);
        expect(tokenizerSpy).toHaveBeenCalledTimes(3);
    });

    it('reads headings without inline syntax directly on the cold path', () => {
        const { muya } = createDocument('## Plain heading');

        expect(getTOC(muya)).toMatchObject([
            { content: 'Plain heading', githubSlug: 'plain-heading' },
        ]);
        expect(tokenizerSpy).not.toHaveBeenCalled();
    });

    it('re-renders cached headings when rendering options change', () => {
        const { muya } = createDocument('## First~sub~');

        getTOC(muya);
        expect(tokenizerSpy).toHaveBeenCalledTimes(1)

        ;(muya as unknown as { options: { superSubScript: boolean } }).options.superSubScript = true;
        getTOC(muya);
        expect(tokenizerSpy).toHaveBeenCalledTimes(2);
    });
});
