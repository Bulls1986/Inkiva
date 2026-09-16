// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../../muya';

const mountedEditors: Muya[] = [];

afterEach(() => {
    while (mountedEditors.length) {
        const muya = mountedEditors.pop()!;
        muya.destroy();
        muya.domNode.remove();
    }
});

function paragraphs(count: number): string {
    return `${Array.from({ length: count }, (_, index) => `switch benchmark ${index}`).join('\n\n')}\n`;
}

describe('setContent switch benchmark', () => {
    it('avoids a full state clone during a large cached-state switch', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const muya = new Muya(host, { markdown: paragraphs(2400) });
        mountedEditors.push(muya);
        muya.init();

        const cachedState = muya.getState();
        // The loop intentionally measures synchronous replacement cost; the
        // render queue is not part of this microbenchmark.
        const samples: number[] = [];
        const originalStructuredClone = structuredClone;
        const clonedSizes: number[] = [];
        vi.stubGlobal('structuredClone', <T>(value: T): T => {
            clonedSizes.push(Array.isArray(value) ? value.length : 1);
            return originalStructuredClone(value);
        });

        try {
            for (let index = 0; index < 20; index += 1) {
                const startedAt = performance.now();
                muya.setContent(cachedState);
                samples.push(performance.now() - startedAt);
            }
        }
        finally {
            vi.unstubAllGlobals();
        }

        expect(samples.every(Number.isFinite)).toBe(true);
        expect(clonedSizes).not.toContain(cachedState.length);
    });

    it('records synchronous switch cost for a large Markdown payload', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const markdown = paragraphs(2400);
        const muya = new Muya(host, { markdown: '# initial\n' });
        mountedEditors.push(muya);
        muya.init();

        const samples: number[] = [];
        for (let index = 0; index < 20; index += 1) {
            const startedAt = performance.now();
            muya.setContent(markdown);
            samples.push(performance.now() - startedAt);
        }

        expect(samples.every(Number.isFinite)).toBe(true);
    });
});
