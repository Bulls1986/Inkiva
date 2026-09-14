// @vitest-environment jsdom

// Regression for #4812: a single mermaid diagram with a syntax error must not
// abort the whole document export. The styled-HTML / PDF export path renders
// every `code.language-mermaid` via the direct Mermaid render API. Each diagram
// is rendered independently so one bad diagram cannot throw all the way up to
// the desktop wrapper ("Failed to export document") and prevent a file write.
//
// `mermaid` can't run under jsdom, so we mock the diagram-renderer loader to
// return a fake mermaid whose `render` throws like the real parser does on invalid
// input. That isolates the behaviour under test — per-diagram error containment.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mermaidRender = vi.fn();

vi.mock('../../utils/diagram', () => ({
    default: vi.fn(async (name: string) => {
        if (name === 'mermaid') {
            return {
                initialize: vi.fn(),
                registerIconPacks: vi.fn(),
                render: mermaidRender,
            };
        }
        throw new Error(`unexpected renderer ${name}`);
    }),
}));

// Import AFTER the mock is registered.
const { MarkdownToHtml } = await import('../markdownToHtml');

beforeEach(() => {
    mermaidRender.mockReset();
});

const INVALID_MERMAID = [
    '# Title',
    '',
    'Intro paragraph.',
    '',
    '```mermaid',
    'graph LR',
    'H[a|b|c]',
    '```',
    '',
    'Trailing paragraph.',
    '',
].join('\n');

describe('#4812: mermaid syntax error must not abort export', () => {
    it('passes fenced Mermaid source to render without an HTML sanitization round-trip', async () => {
        mermaidRender.mockResolvedValue({ svg: '<svg></svg>' });
        const source = 'flowchart TD\nA["<b>Raw & text</b>"] --> B';
        const markdown = `\`\`\`mermaid\n${source}\n\`\`\`\n`;

        const html = await new MarkdownToHtml(markdown).renderHtml();

        expect(mermaidRender).toHaveBeenCalledTimes(1);
        expect(mermaidRender.mock.calls[0][1]).toContain(source);
        expect(html).toContain('<svg></svg>');
    });

    it('renderHtml resolves even when a mermaid diagram fails to parse', async () => {
        // Real mermaid rejects on a parse error; emulate that.
        mermaidRender.mockRejectedValue(new Error('Parse error on line 2: ... got \'PIPE\''));

        const md2html = new MarkdownToHtml(INVALID_MERMAID);
        const html = await md2html.renderHtml();

        // The surrounding document still exports.
        expect(html).toContain('Title');
        expect(html).toContain('Intro paragraph.');
        expect(html).toContain('Trailing paragraph.');
        // The broken diagram degrades to the same placeholder the other
        // diagram renderers use, instead of throwing.
        expect(html).toContain('&lt; Invalid Diagram &gt;');
    });

    it('one broken diagram does not stop a later valid diagram from rendering', async () => {
        // First diagram throws, second succeeds. A batch run would abort both.
        mermaidRender
            .mockRejectedValueOnce(new Error('Parse error'))
            .mockResolvedValueOnce({ svg: '<svg></svg>' });

        const TWO = [
            '```mermaid',
            'graph LR',
            'H[a|b|c]',
            '```',
            '',
            '```mermaid',
            'graph TD; A-->B',
            '```',
            '',
        ].join('\n');

        const html = await new MarkdownToHtml(TWO).renderHtml();

        expect(mermaidRender).toHaveBeenCalledTimes(2);
        expect(html).toContain('&lt; Invalid Diagram &gt;');
    });
});
