import { describe, expect, it } from 'vitest';
import Parent from '../parent';

interface FakeNode {
    isParent: () => boolean;
    children?: { forEach: (callback: (child: FakeNode, index: number) => void) => void };
}

function createFlatTree(count: number): Parent {
    const children = Array.from({ length: count }, () => ({
        isParent: () => false,
    })) as FakeNode[];
    const root: FakeNode = {
        isParent: () => true,
        children: {
            forEach: callback => children.forEach(callback),
        },
    };
    return root as unknown as Parent;
}

describe('parent traversal performance', () => {
    it('keeps flat depth-first traversal bounded for large sibling lists', () => {
        const root = createFlatTree(100_000);
        let visited = 0;
        const startedAt = Date.now();

        Parent.prototype.depthFirstTraverse.call(root, () => {
            visited += 1;
        });

        expect(visited).toBe(100_001);
        expect(Date.now() - startedAt).toBeLessThan(1_000);
    });

    it('keeps flat breadth-first traversal bounded for large sibling lists', () => {
        const root = createFlatTree(100_000);
        let visited = 0;
        const startedAt = Date.now();

        Parent.prototype.breadthFirstTraverse.call(root, () => {
            visited += 1;
        });

        expect(visited).toBe(100_001);
        expect(Date.now() - startedAt).toBeLessThan(1_000);
    });
});
