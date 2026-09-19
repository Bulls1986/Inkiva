import type Content from '../block/base/content';
import type Parent from '../block/base/parent';
import type { Muya } from '../muya';
import { tokenizer, tokensToPlainText } from '../inlineRenderer/lexer';
import { getUniqueId } from '../utils';
import { generateGithubSlug } from '../utils/slug';

export interface ITocItem {
    content: string;
    lvl: number;
    slug: string;
    githubSlug: string;
    blockIndex: number;
}

interface IHeadingBlock extends Parent {
    meta: { level: number };
}

interface IHeadingRenderCache {
    source: string;
    superSubScript: boolean;
    footnote: boolean;
    content: string;
    githubSlug: string;
}

const slugCache = new WeakMap<Parent, string>();
const headingRenderCache = new WeakMap<Parent, IHeadingRenderCache>();

// When none of these characters can start an inline construct, the tokenizer
// would produce one plain-text token whose visible text is exactly `source`.
// Keep this conservative: a false negative only costs a tokenizer pass, while
// a false positive could change the displayed heading or its anchor slug.
const HEADING_INLINE_SYNTAX = /[\\*_`![<>&~$^:\n#]/;

export function stableSlug(block: Parent): string {
    let slug = slugCache.get(block);
    if (slug == null) {
        slug = getUniqueId();
        slugCache.set(block, slug);
    }
    return slug;
}

export function getTOC(muya: Muya): ITocItem[] {
    const { scrollPage } = muya.editor;
    if (!scrollPage)
        return [];

    const items: ITocItem[] = [];
    const { superSubScript, footnote } = muya.options;

    let blockIndex = 0;
    for (const node of scrollPage.children.iterator()) {
        const { blockName } = node;
        if (blockName !== 'atx-heading' && blockName !== 'setext-heading') {
            blockIndex += 1;
            continue;
        }

        const block = node as IHeadingBlock;
        const head = block.children.head as Content | null;
        const text = head?.text ?? '';

        const source = blockName === 'setext-heading'
            ? text.trim()
            : text.replace(/^\s*#{1,6}\s+/, '').trim();

        // Show and slug the heading by its rendered text — inline markdown
        // (`**bold**`, `[label](url)`, images) stripped to what a reader sees —
        // instead of the raw source (#4811). Slugging the same plain text keeps
        // `githubSlug` in step with the anchor id the HTML export injects from
        // `heading.textContent` (state/markdownToHtml.ts).
        //
        // Heading blocks survive incremental text edits, while the surrounding
        // document can contain thousands of them. Reuse the rendered result for
        // an unchanged block so a live TOC refresh only tokenizes headings whose
        // source or rendering options actually changed.
        let rendered = headingRenderCache.get(block);
        if (
            rendered?.source !== source
            || rendered.superSubScript !== superSubScript
            || rendered.footnote !== footnote
        ) {
            const content = HEADING_INLINE_SYNTAX.test(source)
                ? tokensToPlainText(
                        tokenizer(source, {
                            hasBeginRules: false,
                            options: { superSubScript, footnote },
                        }),
                    ).trim()
                : source;
            rendered = {
                source,
                superSubScript,
                footnote,
                content,
                githubSlug: generateGithubSlug(content),
            };
            headingRenderCache.set(block, rendered);
        }

        items.push({
            content: rendered.content,
            lvl: block.meta.level,
            slug: stableSlug(block),
            githubSlug: rendered.githubSlug,
            blockIndex,
        });
        blockIndex += 1;
    }

    return items;
}
