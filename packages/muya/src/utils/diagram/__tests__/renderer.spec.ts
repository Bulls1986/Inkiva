// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadRenderer = vi.fn();
const renderMermaid = vi.fn();

vi.mock('../index', () => ({
    default: loadRenderer,
}));

vi.mock('../mermaid', () => ({
    normalizeMermaidSource: (source: string) => source.replace(/\r\n?/g, '\n'),
    renderMermaid,
}));

const { renderDiagram } = await import('../renderer');

function options(
    target: HTMLElement,
    type: 'mermaid' | 'plantuml' | 'vega-lite' | 'flowchart' | 'sequence',
    code = '{}',
) {
    return {
        type,
        code,
        target,
        mermaidTheme: 'default',
        vegaTheme: 'latimes',
        sequenceTheme: 'hand' as const,
    };
}

beforeEach(() => {
    loadRenderer.mockReset();
    renderMermaid.mockReset();
});

describe('renderDiagram adapter', () => {
    it('passes Mermaid source with line endings preserved and returns SVG', async () => {
        renderMermaid.mockResolvedValue({ svg: '<svg></svg>' });
        const target = document.createElement('div');

        const result = await renderDiagram(options(
            target,
            'mermaid',
            'graph TD\r\n  A --> B',
        ));

        expect(renderMermaid).toHaveBeenCalledWith('graph TD\n  A --> B', 'default');
        expect(result.svg).toBe('<svg></svg>');
    });

    it('stages Vega-Lite output, commits it, and finalizes the old view', async () => {
        const oldView = { finalize: vi.fn() };
        const newView = { finalize: vi.fn() };
        const render = vi.fn((target: HTMLElement) => {
            target.innerHTML = '<svg data-chart="new"></svg>';
            const view = render.mock.calls.length === 1 ? oldView : newView;
            return Promise.resolve({ view });
        });
        loadRenderer.mockResolvedValue(render);
        const target = document.createElement('div');

        const first = await renderDiagram(options(target, 'vega-lite'));
        first.commit?.();
        // Simulate an already committed chart owned by the target. The next
        // render must release it before taking ownership of the new view.
        const second = await renderDiagram(options(target, 'vega-lite'));
        second.commit?.();

        expect(render.mock.calls[0][0]).not.toBe(target);
        expect(target.querySelector('[data-chart="new"]')).not.toBeNull();
        second.dispose();
        expect(oldView.finalize).toHaveBeenCalledTimes(1);
        expect(newView.finalize).toHaveBeenCalledTimes(1);
    });

    it('adds a viewBox to fixed-size flowchart output', async () => {
        const render = {
            parse: vi.fn(() => ({
                drawSVG: vi.fn((target: HTMLElement) => {
                    target.innerHTML = '<svg width="640" height="480"></svg>';
                }),
            })),
        };
        loadRenderer.mockResolvedValue(render);
        const target = document.createElement('div');

        const result = await renderDiagram(options(target, 'flowchart', 'st=>start: Start'));
        result.commit?.();

        expect(target.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 640 480');
    });

    it('stages asynchronous sequence output until it is ready to commit', async () => {
        const drawSVG = vi.fn((target: HTMLElement) => {
            setTimeout(() => {
                target.innerHTML = '<svg width="320" height="240"></svg>';
            }, 0);
        });
        loadRenderer.mockResolvedValue({
            parse: vi.fn(() => ({ drawSVG })),
        });
        const target = document.createElement('div');

        const result = await renderDiagram(options(target, 'sequence', 'Alice->Bob: Hi'));

        expect(target.childElementCount).toBe(0);
        result.commit?.();
        expect(target.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 320 240');
    });
});
