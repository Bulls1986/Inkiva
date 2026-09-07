// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';

const initialize = vi.fn();
const registerIconPacks = vi.fn();
const render = vi.fn();
const mermaid = {
    initialize,
    registerIconPacks,
    render,
};
const loadRenderer = vi.fn(async () => mermaid);

vi.mock('../index', () => ({
    default: loadRenderer,
}));

// Import after the loader mock is registered.
const { renderMermaid } = await import('../mermaid');

describe('renderMermaid', () => {
    it('passes source text directly, registers icon packs once, and serializes themes', async () => {
        render.mockResolvedValue({ svg: '<svg></svg>' });

        const firstSource = 'flowchart TD\n  A[<b>raw & text</b>] --> B';
        const secondSource = 'sequenceDiagram\n  Alice->>Bob: Hello';

        await Promise.all([
            renderMermaid(firstSource, 'forest'),
            renderMermaid(secondSource, 'dark'),
        ]);

        expect(registerIconPacks).toHaveBeenCalledTimes(1);
        expect(registerIconPacks.mock.calls[0][0].map((pack: { name: string }) => pack.name))
            .toEqual(['fa', 'fas', 'far', 'fab', 'logos']);

        expect(initialize.mock.calls.map(call => call[0].theme)).toEqual([
            'forest',
            'dark',
        ]);
        expect(render.mock.calls.map(call => call[1])).toEqual([
            firstSource,
            secondSource,
        ]);

        const ids = render.mock.calls.map(call => call[0]);
        expect(ids[0]).toMatch(/^muya-mermaid-\d+$/);
        expect(new Set(ids).size).toBe(2);
    });

    it('passes Mermaid frontmatter configuration through without rewriting it', async () => {
        render.mockClear();
        const source = [
            '---',
            'config:',
            '  theme: dark',
            '  flowchart:',
            '    curve: basis',
            '---',
            'flowchart LR',
            '  A --> B',
        ].join('\n');

        await renderMermaid(source, 'default');

        expect(render.mock.calls[0][1]).toBe(source);
    });

    it('cleans Mermaid temporary error-rendering nodes after a rejected render', async () => {
        let renderId = '';
        render.mockImplementation(async (id: string) => {
            renderId = id;
            const leakedErrorWrapper = document.createElement('div');
            leakedErrorWrapper.id = `d${id}`;
            document.body.append(leakedErrorWrapper);
            throw new Error('Syntax error in text');
        });

        await expect(
            renderMermaid('graph TD\n  A--->', 'default'),
        ).rejects.toThrow('Syntax error in text');

        expect(renderId).toMatch(/^muya-mermaid-\d+$/);
        expect(document.getElementById(`d${renderId}`)).toBeNull();
    });
});
