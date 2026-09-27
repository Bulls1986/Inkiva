import { describe, expect, it } from 'vitest';
import { isMarkdownWysiwygRoundTripSafe } from '../markdownWysiwygSafety';

describe('markdown WYSIWYG round-trip safety', () => {
    it('accepts canonical Markdown that Muya can represent without rewriting', () => {
        const markdown = '# Title\n\n- one\n- two\n\n\`\`\`ts\nconst value = 1\n\`\`\`\n';
        expect(isMarkdownWysiwygRoundTripSafe(markdown, {
            isGitlabCompatibilityEnabled: false,
        })).toBe(true);
    });

    it('ignores only terminal newline count', () => {
        expect(isMarkdownWysiwygRoundTripSafe('# Title')).toBe(true);
        expect(isMarkdownWysiwygRoundTripSafe('# Title\n\n\n')).toBe(true);
    });

    it('rejects an unfinished fenced block that serialization would complete', () => {
        const markdown = '# Draft\n\n\`\`\`ts\nconst value = 1\n';
        expect(isMarkdownWysiwygRoundTripSafe(markdown, {
            isGitlabCompatibilityEnabled: false,
        })).toBe(false);
    });
});
