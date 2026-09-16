import { describe, expect, it } from 'vitest';
import { MarkdownToState } from '../markdownToState';
import { TokenWorklist } from '../tokenWorklist';

const MARKDOWN_OPTIONS = {
    footnote: false,
    math: false,
    isGitlabCompatibilityEnabled: false,
    trimUnnecessaryCodeBlockEmptyLines: false,
    frontMatter: false,
};

function createHeadingDocument(headingCount: number) {
    return Array.from(
        { length: headingCount },
        (_, index) => `## Heading ${index}\n\nParagraph ${index}.\n`,
    ).join('\n');
}

describe('token worklist', () => {
    it('keeps prepended token order ahead of the remaining stream', () => {
        const worklist = new TokenWorklist(['tail-1', 'tail-2']);

        expect(worklist.peek()).toBe('tail-1');
        expect(worklist.take()).toBe('tail-1');

        worklist.prepend(['child-1', 'child-2']);
        worklist.prepend(['nested-child']);

        expect([
            worklist.take(),
            worklist.take(),
            worklist.take(),
            worklist.take(),
        ]).toEqual(['nested-child', 'child-1', 'child-2', 'tail-2']);
        expect(worklist.take()).toBeUndefined();
    });

    it('consumes a large flat stream within a linear budget', () => {
        const count = 100_000;
        const worklist = new TokenWorklist(Array.from({ length: count }, (_, index) => index));
        const startedAt = Date.now();
        let consumed = 0;
        let sum = 0;

        for (;;) {
            const token = worklist.take();
            if (token === undefined)
                break;
            consumed += 1;
            sum += token;
        }

        expect(consumed).toBe(count);
        expect(sum).toBe((count * (count - 1)) / 2);
        expect(Date.now() - startedAt).toBeLessThan(1_000);
    });
});

describe('large markdown parsing', () => {
    it('keeps block order stable for a large section document', () => {
        const markdown = createHeadingDocument(2_000);
        const states = new MarkdownToState(MARKDOWN_OPTIONS).generate(markdown);

        expect(states).toHaveLength(4_000);
        expect(states[0]).toMatchObject({ name: 'atx-heading', text: '## Heading 0' });
        expect(states[states.length - 1]).toMatchObject({ name: 'paragraph', text: 'Paragraph 1999.' });
    });
});
