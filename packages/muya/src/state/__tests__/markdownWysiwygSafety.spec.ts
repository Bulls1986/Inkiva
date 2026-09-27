import { describe, expect, it } from 'vitest';
import { isMarkdownWysiwygTransitionSafe } from '../markdownWysiwygSafety';

describe('markdown WYSIWYG transition safety', () => {
    it('accepts canonical Markdown that Muya can model', () => {
        const markdown = '# Title\n\n- one\n- two\n\n\`\`\`ts\nconst value = 1\n\`\`\`\n';
        expect(isMarkdownWysiwygTransitionSafe(markdown, {
            isGitlabCompatibilityEnabled: false,
        })).toBe(true);
    });

    it('accepts terminal newline variants', () => {
        expect(isMarkdownWysiwygTransitionSafe('# Title')).toBe(true);
        expect(isMarkdownWysiwygTransitionSafe('# Title\n\n\n')).toBe(true);
    });

    it('accepts representable tables even when serializer spacing may differ', () => {
        const markdown = [
            '| Name | Score | Notes |',
            '| :--- | :--: | ---: |',
            '| Ada | 10 | exact source |',
            '',
        ].join('\n');
        expect(isMarkdownWysiwygTransitionSafe(markdown)).toBe(true);
    });

    it('accepts representable task and bullet lists', () => {
        const markdown = '# Doc\n\n- [ ] task one\n- [x] task two\n- regular item\n';
        expect(isMarkdownWysiwygTransitionSafe(markdown)).toBe(true);
    });

    it('rejects an unfinished diagram fence without losing parser metadata', () => {
        const markdown = '# Draft\n\n```mermaid\ngraph TD\n  A --> B\n';
        expect(isMarkdownWysiwygTransitionSafe(markdown)).toBe(false);
    });

    it('rejects an unfinished fenced block flagged by Muya parser metadata', () => {
        const markdown = '# Draft\n\n\`\`\`ts\nconst value = 1\n';
        expect(isMarkdownWysiwygTransitionSafe(markdown, {
            isGitlabCompatibilityEnabled: false,
        })).toBe(false);
    });
});
