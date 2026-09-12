import type { JSONOp, JSONOpComponent, JSONOpList } from 'ot-json1';
import type { TState } from './types';

const TOC_BLOCK_NAMES = new Set(['atx-heading', 'setext-heading']);

const isHeadingState = (value: unknown): boolean => {
    if (value == null || typeof value !== 'object' || Array.isArray(value))
        return false;

    const name = (value as { name?: unknown }).name;
    return typeof name === 'string' && TOC_BLOCK_NAMES.has(name);
};

const isHeadingComponent = (component: JSONOpComponent): boolean => (
    isHeadingState(component.i) || isHeadingState(component.r)
);

/**
 * Check whether an ot-json1 operation can change the top-level heading list.
 *
 * `getTOC()` only visits direct children of `scrollPage`, so edits below a
 * block quote/list must not trigger a full TOC refresh. Looking at the
 * operation path and the previous state keeps this check proportional to the
 * operation rather than parsing or walking the whole document on every edit.
 */
const visitDescent = (
    descent: JSONOpList,
    previousState: TState[],
): boolean => {
    let path: (number | string)[] = [];

    for (const entry of descent) {
        if (Array.isArray(entry)) {
            if (visitDescent(entry, previousState))
                return true;
            continue;
        }

        if (typeof entry === 'number' || typeof entry === 'string') {
            path.push(entry);
            continue;
        }

        if (entry == null || typeof entry !== 'object')
            continue;

        const component = entry as JSONOpComponent;
        const rootIndex = path[0];

        // Any operation below a top-level heading can alter its displayed
        // text. This also covers removal/replacement and pick/drop moves,
        // whose component payload may not carry the removed block.
        if (typeof rootIndex === 'number' && isHeadingState(previousState[rootIndex]))
            return true;

        // An insertion/replacement at the root may introduce a heading even
        // when the old root block was not one. Nested heading insertions have
        // a path length greater than one and are intentionally ignored.
        if (path.length === 1 && isHeadingComponent(component))
            return true;

        // A root descent can contain several independent path/component pairs
        // (for example `[1, { ... }, 2, { ... }]`).
        path = [];
    }

    return false;
};

export function isTopLevelTocChange(
    operation: JSONOp,
    previousState: TState[],
): boolean {
    if (operation == null || operation.length === 0)
        return false;

    return visitDescent(operation, previousState);
}
