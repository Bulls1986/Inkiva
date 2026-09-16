import type { Token, Tokens } from 'marked';
import type { IFrontmatterToken, ILexOption, TLexedToken } from './types';
import { Marked } from 'marked';
import compatibleTaskList from './compatibleTaskList';
import footnoteExtension from './extensions/footnote';
import mathExtension from './extensions/math';
import fm from './frontMatter';
import { DEFAULT_OPTIONS } from './options';
import walkTokens from './walkTokens';

function prependReversed(stack: Token[], tokens: readonly Token[] | undefined) {
    if (!tokens)
        return;

    for (let index = tokens.length - 1; index >= 0; index -= 1)
        stack.push(tokens[index]);
}

// marked's public walkTokens implementation accumulates every callback result
// with Array.concat while recursively descending. lexBlock never consumes
// those results, so use an explicit DFS stack instead. This keeps the
// in-place muya token annotations linear for large flat documents while
// preserving marked's child traversal order for lists, tables, and generic
// nested token arrays.
export function walkMarkedTokens(
    tokens: readonly Token[],
    callback: (token: Token) => void,
) {
    const pending: Token[] = [];
    prependReversed(pending, tokens);

    for (;;) {
        const token = pending.pop();
        if (token === undefined)
            break;

        callback(token);

        if (token.type === 'table') {
            const table = token as Tokens.Table;
            for (let rowIndex = table.rows.length - 1; rowIndex >= 0; rowIndex -= 1) {
                const row = table.rows[rowIndex];
                for (let cellIndex = row.length - 1; cellIndex >= 0; cellIndex -= 1)
                    prependReversed(pending, row[cellIndex].tokens);
            }
            for (let cellIndex = table.header.length - 1; cellIndex >= 0; cellIndex -= 1)
                prependReversed(pending, table.header[cellIndex].tokens);
        }
        else if (token.type === 'list') {
            const list = token as Tokens.List;
            prependReversed(pending, list.items);
        }
        else {
            if ('tokens' in token)
                prependReversed(pending, token.tokens);
        }
    }
}

export function lexBlock(
    src: string,
    options: ILexOption = DEFAULT_OPTIONS,
): TLexedToken[] {
    options = Object.assign({}, DEFAULT_OPTIONS, options);
    const { math, frontMatter, footnote } = options;
    let tokens: (Token | IFrontmatterToken)[] = [];

    // Use a per-call Marked instance so extensions don't bleed across calls.
    // marked.use() on the global singleton would make math / footnote sticky:
    // any consumer that once passed `math: true` would get math parsing forever.
    const m = new Marked();

    if (math) {
        m.use(
            mathExtension({
                throwOnError: false,
                useKatexRender: false,
            }),
        );
    }

    if (footnote) {
        m.use(footnoteExtension());
    }

    if (frontMatter) {
        const { token, src: newSrc } = fm(src);
        if (token) {
            tokens.push(token);
            src = newSrc;
        }
    }

    // Pass `m.defaults` to the Lexer so the extensions registered via m.use()
    // are picked up; the no-arg constructor would fall back to global defaults.
    tokens.push(...new m.Lexer(m.defaults).blockTokens(src));
    tokens = compatibleTaskList(tokens as Token[]);
    walkMarkedTokens(tokens as Token[], walkTokens(options));

    // After walkTokens / compatibleTaskList run, marked's Heading/List/ListItem
    // tokens have been augmented with muya-specific fields (headingStyle,
    // marker, listType, listItemType, bulletMarkerOrDelimiter). The wider
    // TLexedToken union captures that runtime shape.
    return tokens as TLexedToken[];
}
