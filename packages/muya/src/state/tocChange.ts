import type { JSONOp, JSONOpComponent, JSONOpList } from 'ot-json1';
import type { TState } from './types';

const TOC_BLOCK_NAMES = new Set(['atx-heading', 'setext-heading']);

export type DocumentMutationKind = 'text-only' | 'structural' | 'diagram';

function isHeadingState(value: unknown): boolean {
    if (value == null || typeof value !== 'object' || Array.isArray(value))
        return false;

    const name = (value as { name?: unknown }).name;
    return typeof name === 'string' && TOC_BLOCK_NAMES.has(name);
}

function isHeadingComponent(component: JSONOpComponent): boolean {
    return isHeadingState(component.i) || isHeadingState(component.r);
}

function isDiagramState(value: unknown): boolean {
    if (value == null || typeof value !== 'object' || Array.isArray(value))
        return false;

    return (value as { name?: unknown }).name === 'diagram';
}

function containsDiagramState(value: unknown): boolean {
    if (isDiagramState(value))
        return true;
    if (Array.isArray(value))
        return value.some(containsDiagramState);
    if (value == null || typeof value !== 'object')
        return false;

    return Object.values(value).some(containsDiagramState);
}

function isTextComponent(
    component: JSONOpComponent,
    path: (number | string)[],
): boolean {
    if (component.es !== undefined)
        return true;
    if (path[path.length - 1] !== 'text')
        return false;

    const values = [component.i, component.r].filter(value => value !== undefined);
    return values.length > 0 && values.every(value => typeof value === 'string');
}

/**
 * Check whether an ot-json1 operation can change the top-level heading list.
 *
 * `getTOC()` only visits direct children of `scrollPage`, so edits below a
 * block quote/list must not trigger a full TOC refresh. Looking at the
 * operation path and the previous state keeps this check proportional to the
 * operation rather than parsing or walking the whole document on every edit.
 */
function visitDescent(descent: JSONOpList, previousState: TState[]): boolean {
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
}

export function isTopLevelTocChange(
    operation: JSONOp,
    previousState: TState[],
): boolean {
    if (operation == null || operation.length === 0)
        return false;

    return visitDescent(operation, previousState);
}

/**
 * Classify an operation using only its paths, components, and the immutable
 * previous-state reference. Text edits stay on the cheap editor path; block
 * structure changes remain conservative; diagram edits are separated so the
 * desktop can schedule diagram work without coupling it to ordinary typing.
 */
export function classifyDocumentMutation(
    operation: JSONOp,
    previousState: TState[],
    tocChanged = isTopLevelTocChange(operation, previousState),
): DocumentMutationKind {
    if (tocChanged)
        return 'structural';
    if (operation == null || operation.length === 0)
        return 'structural';

    let sawOperation = false;
    let sawStructural = false;
    let sawDiagram = false;

    const visit = (descent: JSONOpList, inheritedPath: (number | string)[] = []) => {
        let path = [...inheritedPath];

        for (const entry of descent) {
            if (Array.isArray(entry)) {
                visit(entry);
                continue;
            }
            if (typeof entry === 'number' || typeof entry === 'string') {
                path.push(entry);
                continue;
            }

            sawOperation = true;
            const component = entry as JSONOpComponent;
            const rootIndex = path[0];
            const previousRoot
                = typeof rootIndex === 'number' ? previousState[rootIndex] : undefined;

            if (
                isDiagramState(previousRoot)
                || containsDiagramState(component.i)
                || containsDiagramState(component.r)
            ) {
                sawDiagram = true;
            }
            else if (!isTextComponent(component, path)) {
                sawStructural = true;
            }
            path = [];
        }
    };

    visit(operation);

    if (sawDiagram)
        return 'diagram';
    if (sawStructural || !sawOperation)
        return 'structural';
    return 'text-only';
}
