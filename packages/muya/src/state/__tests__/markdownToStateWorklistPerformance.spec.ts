import type { TBlockToken } from '../../utils/marked/types';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownToState } from '../markdownToState';

const { lexBlockMock } = vi.hoisted(() => ({
    lexBlockMock: vi.fn(),
}));

vi.mock('../../utils/marked', () => ({
    lexBlock: lexBlockMock,
}));

describe('markdownToState token consumption', () => {
    it('keeps conversion bounded for a large flat token stream', () => {
        const count = 200_000;
        lexBlockMock.mockReturnValue(Array.from(
            { length: count },
            (_, index) => ({
                type: 'paragraph',
                raw: `Block ${index}`,
                text: `Block ${index}`,
            }),
        ) as TBlockToken[]);

        const startedAt = Date.now();
        const states = new MarkdownToState({
            footnote: false,
            math: false,
            isGitlabCompatibilityEnabled: false,
            trimUnnecessaryCodeBlockEmptyLines: false,
            frontMatter: false,
        }).generate('ignored by the mocked lexer');

        expect(states).toHaveLength(count);
        expect(states[0]).toEqual({ name: 'paragraph', text: 'Block 0' });
        expect(states[count - 1]).toEqual({ name: 'paragraph', text: `Block ${count - 1}` });
        expect(Date.now() - startedAt).toBeLessThan(1_000);
    });
});
