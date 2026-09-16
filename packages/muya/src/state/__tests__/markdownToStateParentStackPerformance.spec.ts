import type { TBlockToken } from '../../utils/marked/types';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownToState } from '../markdownToState';

const { lexBlockMock } = vi.hoisted(() => ({
    lexBlockMock: vi.fn(),
}));

vi.mock('../../utils/marked', () => ({
    lexBlock: lexBlockMock,
}));

describe('markdownToState parent stack', () => {
    it('keeps deeply nested container conversion bounded', () => {
        interface INestedBlockquoteState {
            name: 'block-quote';
            children: NestedState[];
        }

        interface INestedParagraphState {
            name: 'paragraph';
            text: string;
        }

        type NestedState = INestedBlockquoteState | INestedParagraphState;

        const depth = 100_000;
        let nested = {
            type: 'paragraph',
            raw: 'leaf',
            text: 'leaf',
        } as TBlockToken;

        for (let index = 0; index < depth; index += 1) {
            nested = {
                type: 'blockquote',
                raw: '',
                tokens: [nested],
            } as TBlockToken;
        }
        lexBlockMock.mockReturnValue([nested]);

        const startedAt = Date.now();
        const states = new MarkdownToState({
            footnote: false,
            math: false,
            isGitlabCompatibilityEnabled: false,
            trimUnnecessaryCodeBlockEmptyLines: false,
            frontMatter: false,
        }).generate('ignored by the mocked lexer');

        expect(Date.now() - startedAt).toBeLessThan(1_000);

        let state = states[0] as unknown as NestedState;
        for (let index = 0; index < depth; index += 1) {
            expect(state.name).toBe('block-quote');
            if (state.name !== 'block-quote')
                throw new Error('expected a nested blockquote');
            state = state.children[0]!;
        }
        expect(state).toEqual({ name: 'paragraph', text: 'leaf' });
    });
});
