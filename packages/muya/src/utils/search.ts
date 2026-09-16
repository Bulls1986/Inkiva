import type { IMatch, ISearchOption } from '../search/types';

export interface ISearchMatch {
    match: string;
    subMatches: string[];
    index: number;
}

export type SearchMatcher = (text: string) => ISearchMatch[];

const SPECIAL_CHAR_REG = /[[\]\\^$.|?*+()/]/g;

function buildSearchRegExp(value: string, options: ISearchOption): RegExp | null {
    const { isCaseSensitive, isWholeWord, isRegexp } = options;

    let regStr = value;
    let flag = 'g';

    if (!isCaseSensitive)
        flag += 'i';

    if (!isRegexp) {
        regStr = value.replace(SPECIAL_CHAR_REG, (p) => {
            return p === '\\' ? '\\\\' : `\\${p}`;
        });
    }

    if (isWholeWord)
        regStr = `\\b${regStr}\\b`;

    try {
        return new RegExp(regStr, flag);
    }
    catch {
        // Not all user input can produce a valid RegExp, for example `\`.
        return null;
    }
}

function executeSearch(regexp: RegExp, text: string): ISearchMatch[] {
    const matches: ISearchMatch[] = [];
    regexp.lastIndex = 0;

    try {
        let match = regexp.exec(text);
        while (match !== null) {
            matches.push({
                match: match[0],
                subMatches: match.slice(1),
                index: match.index,
            });

            // RegExp.prototype.exec does not advance lastIndex for a
            // zero-length global match. Advance explicitly so a valid but
            // unusual pattern cannot monopolize the event loop.
            if (match[0].length === 0) {
                regexp.lastIndex += 1;
            }

            match = regexp.exec(text);
        }
    }
    finally {
        // The expression is shared by every content block in one search, but
        // callers should never observe state from the previous block.
        regexp.lastIndex = 0;
    }

    return matches;
}

/**
 * Compile the user search expression once and reuse it across content blocks.
 * Returning null keeps invalid-regexp handling equivalent to matchString's
 * historical empty-result behavior while moving the try/catch out of the
 * document traversal hot path.
 */
export function createSearchMatcher(
    value: string,
    options: ISearchOption = {},
): SearchMatcher | null {
    const regexp = buildSearchRegExp(value, options);
    return regexp ? (text: string) => executeSearch(regexp, text) : null;
}

export function matchString(text: string, value: string, options: ISearchOption) {
    return createSearchMatcher(value, options)?.(text) ?? [];
}

export function buildRegexValue(match: IMatch, value: string) {
    const groups = value.match(/(?<!\\)\$\d/g);

    if (Array.isArray(groups) && groups.length) {
        for (const group of groups) {
            const index = Number.parseInt(group.replace(/^\$/, ''));
            if (index === 0)
                value = value.replace(group, match.match);
            else if (index > 0 && index <= match.subMatches.length)
                value = value.replace(group, match.subMatches[index - 1]);
        }
    }

    return value;
}
