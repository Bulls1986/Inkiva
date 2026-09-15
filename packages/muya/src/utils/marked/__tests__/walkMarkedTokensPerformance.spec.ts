import type { Token } from 'marked';
import { describe, expect, it } from 'vitest';
import { walkMarkedTokens } from '../lexBlock';

describe('marked token traversal', () => {
    it('preserves depth-first order across block and inline children', () => {
        const tokens = [
            {
                type: 'list',
                items: [
                    {
                        type: 'list_item',
                        tokens: [
                            {
                                type: 'paragraph',
                                tokens: [{ type: 'text', raw: 'nested', text: 'nested' }],
                                raw: 'nested',
                                text: 'nested',
                            },
                        ],
                    },
                ],
            },
            {
                type: 'paragraph',
                tokens: [{ type: 'text', raw: 'tail', text: 'tail' }],
                raw: 'tail',
                text: 'tail',
            },
        ] as unknown as Token[];
        const seen: string[] = [];

        walkMarkedTokens(tokens, (token) => {
            seen.push(token.type);
        });

        expect(seen).toEqual([
            'list',
            'list_item',
            'paragraph',
            'text',
            'paragraph',
            'text',
        ]);
    });

    it('visits table cell children in header-then-row order', () => {
        const tokens = [{
            type: 'table',
            header: [
                { tokens: [{ type: 'text', raw: 'header', text: 'header' }] },
            ],
            rows: [
                [{ tokens: [{ type: 'text', raw: 'row-1', text: 'row-1' }] }],
                [{ tokens: [{ type: 'text', raw: 'row-2', text: 'row-2' }] }],
            ],
        }] as unknown as Token[];
        const seen: string[] = [];

        walkMarkedTokens(tokens, (token) => {
            seen.push(token.type + (token.type === 'text' ? `:${token.text}` : ''));
        });

        expect(seen).toEqual([
            'table',
            'text:header',
            'text:row-1',
            'text:row-2',
        ]);
    });

    it('keeps a large flat token stream within a linear traversal budget', () => {
        const count = 200_000;
        const tokens = Array.from(
            { length: count },
            (_, index) => ({ type: 'paragraph', raw: `Block ${index}`, text: `Block ${index}` }),
        ) as unknown as Token[];
        const startedAt = Date.now();
        let visited = 0;

        walkMarkedTokens(tokens, () => {
            visited += 1;
        });

        expect(visited).toBe(count);
        expect(Date.now() - startedAt).toBeLessThan(1_000);
    });
});
