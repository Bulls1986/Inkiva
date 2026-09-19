import type { Doc } from 'ot-json1';
import * as json1 from 'ot-json1';

const SAMPLE_COUNT = 20;
const TARGET_CHARS = 50_000;

interface IStateBlock {
    name: string;
    text: string;
}

function asDoc(state: IStateBlock[]): Doc {
    // Benchmark the same trusted Muya TState[] -> ot-json1 Doc boundary used by production.
    // eslint-disable-next-line no-restricted-syntax
    return state as unknown as Doc;
}

function buildState(): IStateBlock[] {
    const state: IStateBlock[] = [{ name: 'atx-heading', text: '# heading-0' }];
    let chars = state[0]!.text.length;
    let index = 0;
    while (chars < TARGET_CHARS) {
        const text = `paragraph-${index} deterministic structural history benchmark text`;
        state.push({ name: 'paragraph', text });
        chars += text.length;
        index += 1;
    }
    return state;
}

function percentile(values: number[], ratio: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)]!;
}

function summarize(values: number[]) {
    return {
        medianMs: percentile(values, 0.5),
        p95Ms: percentile(values, 0.95),
        maxMs: Math.max(...values),
    };
}

const previous = buildState();
const op = json1.replaceOp([0, 'text'], '# heading-0', '# heading-1')!;

// Warm both paths before measuring.
json1.type.invertWithDoc(op, asDoc(structuredClone(previous)));
json1.type.invertWithDoc(op, asDoc(previous));

const snapshotPath: number[] = [];
const authoritativePath: number[] = [];
for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    let startedAt = performance.now();
    const beforeInverse = json1.type.invertWithDoc(
        op,
        asDoc(structuredClone(previous)),
    );
    snapshotPath.push(performance.now() - startedAt);

    startedAt = performance.now();
    const afterInverse = json1.type.invertWithDoc(op, asDoc(previous));
    authoritativePath.push(performance.now() - startedAt);

    if (JSON.stringify(beforeInverse) !== JSON.stringify(afterInverse))
        throw new Error('inverse mismatch between baseline and optimized paths');
}

console.warn(
    `PR_C_C1_STRUCTURAL_HISTORY_BENCH=${JSON.stringify({
        chars: TARGET_CHARS,
        samples: SAMPLE_COUNT,
        before: summarize(snapshotPath),
        after: summarize(authoritativePath),
    })}`,
);
