import type Content from '../block/base/content';
import type TreeNode from '../block/base/treeNode';
import type { IHighlight } from '../inlineRenderer/types';
import type { Muya } from '../muya';
import type { IMatch } from './types';
import { DEFAULT_SEARCH_OPTIONS } from '../config';
import { buildRegexValue, matchString } from '../utils/search';

const SEARCH_SLICE_BUDGET_MS = 4;

const getSearchTime = () =>
    typeof performance !== 'undefined' ? performance.now() : Date.now();

export class Search {
    private _value: string = '';
    public matches: IMatch[] = [];
    public index: number = -1;
    private _searchGeneration = 0;

    get value() {
        return this._value;
    }

    private get _scrollPage() {
        return this._muya.editor.scrollPage;
    }

    constructor(private _muya: Muya) {}

    // Drop match state when the document is replaced (e.g. a tab switch), so
    // stale matches don't reference the previous document's blocks (#1932).
    reset() {
        this._value = '';
        this.matches = [];
        this.index = -1;
    }

    private _updateMatchHighlights(matches: readonly IMatch[], isClear = false) {
        const { index } = this;
        const len = matches.length;
        const matchesMap = new Map<Content, IHighlight[]>();

        for (let i = 0; i < len; i++) {
            const { block, start, end } = matches[i];
            const active = i === index;
            const highlight: IHighlight = { start, end, active };
            const highlights = matchesMap.get(block);

            if (matchesMap.has(block) && Array.isArray(highlights)) {
                highlights.push(highlight);
                matchesMap.set(block, highlights);
            }
            else {
                matchesMap.set(block, [highlight]);
            }
        }

        for (const [block, highlights] of matchesMap.entries()) {
            const isActive = highlights.some(h => h.active);

            block.update(undefined, isClear ? [] : highlights);

            if (block.parent?.active && !isActive)
                block.blurHandler();

            if (isActive && !isClear)
                block.focusHandler();
        }
    }

    private _updateMatches(isClear = false) {
        this._updateMatchHighlights(this.matches, isClear);
    }

    private _innerReplace(matches: IMatch[], value: string) {
        if (!matches.length)
            return;

        let tempText = '';
        let lastBlock = matches[0].block;
        let lastEnd = 0;

        for (const match of matches) {
            const { start, end, block } = match;
            if (lastBlock !== block) {
                if (lastBlock)
                    lastBlock.text = tempText + lastBlock.text.substring(lastEnd);

                tempText = '';
                lastEnd = 0;
                lastBlock = block;
            }

            tempText += block.text.substring(lastEnd, start);
            tempText += value;
            lastEnd = end;
        }

        lastBlock.text = tempText + lastBlock.text.substring(lastEnd);
    }

    replace(replaceValue: string, opt = { isSingle: true, isRegexp: false }) {
        const { isSingle, isRegexp, ...rest } = opt;
        const options = Object.assign({}, DEFAULT_SEARCH_OPTIONS, rest);
        const { matches, index } = this;
        const value = this._value;

        if (matches.length) {
            if (isRegexp)
                replaceValue = buildRegexValue(matches[index], replaceValue);

            if (isSingle) {
                // replace one
                this._innerReplace([matches[index]], replaceValue);
            }
            else {
                // replace all
                this._innerReplace(matches, replaceValue);
            }
            const highlightIndex = index < matches.length - 1 ? index : index - 1;

            this.search(value, {
                ...options,
                highlightIndex: isSingle ? highlightIndex : -1,
            });
        }

        return this;
    }

    /**
     * Find preview or next value, and highlight it.
     * @param {string} action : previous or next.
     */
    find(action: 'previous' | 'next'): this {
        const { matches } = this;
        let { index } = this;
        const len = matches.length;

        if (!len)
            return this;

        index = action === 'next' ? index + 1 : index - 1;

        if (index < 0)
            index = len - 1;

        if (index >= len)
            index = 0;

        this.index = index;

        this._updateMatches(true);
        this._updateMatches();

        return this;
    }

    /**
     * Search value in current document.
     * @param {string} value
     * @param {object} opts
     */
    search(value: string, opts = {}) {
        this._searchGeneration += 1;
        const matches: IMatch[] = [];
        const options = Object.assign({}, DEFAULT_SEARCH_OPTIONS, opts);
        const { highlightIndex, selectHighlight } = options;
        let index = -1;

        // The currently active match, captured before it is cleared below, so a
        // `selectHighlight` request can drop the cursor back onto it when the
        // new search has no match of its own (e.g. closing the search bar).
        const prevActiveMatch = this.matches[this.index];

        // Empty last search.
        this._updateMatches(true);

        // Highlight current search.
        if (value) {
            this._scrollPage?.depthFirstTraverse((block: TreeNode) => {
                if (block.isContent()) {
                    const { text } = block;
                    if (text && typeof text === 'string') {
                        const strMatches = matchString(text, value, options);
                        matches.push(
                            ...strMatches.map(({ index, match, subMatches }) => {
                                return {
                                    block,
                                    start: index,
                                    end: index + match.length,
                                    match,
                                    subMatches,
                                };
                            }),
                        );
                    }
                }
            });
        }

        if (highlightIndex !== -1) {
            // If set the highlight index, then highlight the highlighIndex
            index = highlightIndex;
        }
        else if (matches.length) {
            // highlight the first word that matches.
            index = 0;
        }

        Object.assign(this, { _value: value, matches, index });

        this._updateMatches();

        // Restore the editor cursor onto the active match. Mirrors muyajs's
        // `render(selectHighlight)` -> `setCursor()` path: closing the search
        // bar empties the search with `selectHighlight`, which must place the
        // cursor where the highlight was so the user can keep typing there.
        if (selectHighlight) {
            const activeMatch = matches[index] ?? prevActiveMatch;
            if (activeMatch) {
                const { block, start, end } = activeMatch;
                block.setCursor(start, end, true);
            }
        }

        return this;
    }

    searchAsync(
        value: string,
        opts = {},
        onUpdate?: (search: Search) => void,
    ): Promise<this> {
        if (!value) {
            const result = this.search(value, opts);
            onUpdate?.(result);
            return Promise.resolve(result);
        }

        const generation = ++this._searchGeneration;
        const options = Object.assign({}, DEFAULT_SEARCH_OPTIONS, opts);
        const { highlightIndex, selectHighlight } = options;
        const previousActiveMatch = this.matches[this.index];

        this._updateMatches(true);
        this._value = value;
        this.matches = [];
        this.index = -1;

        const root = this._scrollPage;
        if (!root) {
            onUpdate?.(this);
            return Promise.resolve(this);
        }

        const stack: TreeNode[] = [root];
        let firstBatchPublished = false;
        let settled = false;

        return new Promise<this>((resolve) => {
            const finish = () => {
                if (settled)
                    return;
                settled = true;
                resolve(this);
            };

            const schedule = () => {
                setTimeout(processSlice, 0);
            };

            const processSlice = () => {
                if (generation !== this._searchGeneration) {
                    finish();
                    return;
                }

                const startedAt = getSearchTime();
                const sliceMatches: IMatch[] = [];
                let visited = 0;

                while (
                    stack.length > 0
                    && (visited === 0 || getSearchTime() - startedAt < SEARCH_SLICE_BUDGET_MS)
                ) {
                    const node = stack.pop();
                    if (!node)
                        continue;

                    visited += 1;
                    if (node.isParent()) {
                        const children: TreeNode[] = [];
                        node.children.forEach(child => children.push(child));
                        for (let i = children.length - 1; i >= 0; i -= 1) {
                            const child = children[i];
                            if (child)
                                stack.push(child);
                        }
                    }

                    if (!node.isContent())
                        continue;

                    const { text } = node;
                    if (!text || typeof text !== 'string')
                        continue;

                    const strMatches = matchString(text, value, options);
                    sliceMatches.push(
                        ...strMatches.map(({ index, match, subMatches }) => ({
                            block: node,
                            start: index,
                            end: index + match.length,
                            match,
                            subMatches,
                        })),
                    );
                }

                if (sliceMatches.length > 0) {
                    this.matches.push(...sliceMatches);
                    if (this.index < 0)
                        this.index = 0;
                    this._updateMatchHighlights(sliceMatches);
                    if (!firstBatchPublished) {
                        firstBatchPublished = true;
                        onUpdate?.(this);
                    }
                }
                else if (!firstBatchPublished) {
                    firstBatchPublished = true;
                    onUpdate?.(this);
                }

                if (stack.length > 0) {
                    schedule();
                    return;
                }

                const previousIndex = this.index;
                if (highlightIndex !== -1)
                    this.index = highlightIndex;

                if (highlightIndex !== -1 && previousIndex !== this.index) {
                    const changedMatches = [this.matches[previousIndex], this.matches[this.index]]
                        .filter((match): match is IMatch => Boolean(match));
                    this._updateMatchHighlights(changedMatches);
                }

                if (selectHighlight) {
                    const activeMatch = this.matches[this.index] ?? previousActiveMatch;
                    if (activeMatch) {
                        const { block, start, end } = activeMatch;
                        block.setCursor(start, end, true);
                    }
                }

                onUpdate?.(this);
                finish();
            };

            schedule();
        });
    }
