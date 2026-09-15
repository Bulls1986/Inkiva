import type Content from '../../block/base/content';
import type Parent from '../../block/base/parent';
import { describe, expect, it } from 'vitest';
import { buildAffiliation } from '../affiliation';

describe('selection affiliation performance', () => {
    it('keeps deeply nested ancestor collection bounded', () => {
        const depth = 200_000;
        let parent: Parent | null = null;

        for (let index = 0; index < depth; index += 1) {
            parent = {
                blockName: 'block-quote',
                isOutMostBlock: index === 0,
                parent,
            } as unknown as Parent;
        }

        const leaf = { parent } as unknown as Content;
        const startedAt = Date.now();
        const affiliation = buildAffiliation(leaf);

        expect(Date.now() - startedAt).toBeLessThan(1_000);
        expect(affiliation).toHaveLength(depth);
        expect(affiliation[0]?.type).toBe('blockquote');
        expect(affiliation[depth - 1]?.type).toBe('blockquote');
    });
});
