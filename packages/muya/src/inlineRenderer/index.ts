import type Format from '../block/base/format';
import type { Muya } from '../muya';
import type { IRenderCursor } from '../selection/types';
import type { IParagraphState, TContainerState, TState } from '../state/types';
import type { IHighlight, Labels } from './types';
import logger from '../utils/logger';
import { tokenizer } from './lexer';
import Renderer from './renderer';
import { beginRules } from './rules';

const debug = logger('inlineRenderer:');

// The inline lexer is deliberately conservative and checks every character
// against every rule. That is correct for Markdown, but it turns a large
// paragraph containing only ordinary text into an avoidable O(n²) path because
// the lexer advances one character at a time while growing its pending string.
// Keep this hint conservative: a false negative only uses the normal lexer,
// while a false positive could change rendered Markdown.
const INLINE_SYNTAX_HINT = /[\\*_`![<>&~$^:#\n]/;
const BARE_AUTOLINK_HINT = /@|(?:^|\s)(?:www\.|https?:\/\/)/i;

const canRenderAsPlainText = (
    text: string,
    cursor: IRenderCursor | undefined,
    highlights: IHighlight[],
): boolean => (
    !cursor?.block
    && highlights.length === 0
    && !INLINE_SYNTAX_HINT.test(text)
    && !BARE_AUTOLINK_HINT.test(text)
);

class InlineRenderer {
    public labels: Labels = new Map();
    public renderer: Renderer;

    private _referenceDefinitionsDirty = true;

    invalidateReferenceDefinitions() {
        this._referenceDefinitionsDirty = true;
    }

    constructor(public muya: Muya) {
        this.renderer = new Renderer(muya, this);
    }

    private _tokenizer(block: Format, highlights: IHighlight[]) {
        const { options } = this.muya;
        const { text } = block;
        const { labels } = this;

        // TODO: different content block should have different rules.
        // eg: atxheading.content has no soft|hard line break
        // setextheading.content has no heading rules.
        const hasBeginRules
            = /thematicbreak\.content|paragraph\.content|atxheading\.content/.test(
                block.blockName,
            );

        return tokenizer(text, { hasBeginRules, labels, options, highlights });
    }

    /**
     * Flush every cached image and force inline images to reload.
     *
     * The renderer memoises loaded images in `loadImageMap` (keyed by src,
     * skipped on the next render once `isSuccess` is true) and resolved URLs
     * in `urlMap`. When an image file changes on disk the cached entry would
     * otherwise keep the stale bitmap, so clearing both maps and re-rendering
     * every content block re-runs `loadImageAsync`, which loads the source
     * afresh.
     */
    invalidateImageCache() {
        this.renderer.loadImageMap.clear();
        this.renderer.urlMap.clear();

        const { scrollPage } = this.muya.editor;
        if (!scrollPage)
            return;

        scrollPage.breadthFirstTraverse((node) => {
            if (node.isContent())
                node.update();
        });
    }

    patch(block: Format, cursor?: IRenderCursor, highlights: IHighlight[] = []) {
        const { domNode } = block;
        if (canRenderAsPlainText(block.text, cursor, highlights)) {
            // No inline rule can match this text, so avoid the lexer and the
            // renderer entirely. `textContent` also keeps the content safely
            // escaped without paying the HTML parser cost for a huge string.
            domNode!.textContent = block.text;
            return;
        }

        this._collectReferenceDefinitions();
        if (block.isParent())
            debug.error('Patch can only handle content block');

        const tokens = this._tokenizer(block, highlights);
        const html = this.renderer.output(
            tokens,
            block,
            cursor && cursor.block === block ? cursor : {},
        );
        domNode!.innerHTML = html;
    }

    private _collectReferenceDefinitions() {
        if (!this._referenceDefinitionsDirty)
            return;

        const labels = new Map();
        const collect = (block: Pick<IParagraphState, 'text'>) => {
            const { label, info } = this.getLabelInfo(block);
            if (label && info)
                labels.set(label, info);
        };
        const scrollPage = this.muya.editor.scrollPage;

        // Once a live tree exists, read its current content directly. This
        // avoids cloning the full JSON AST and also observes a definition whose
        // edit is still waiting for JSONState's animation-frame flush.
        if (scrollPage?.firstChild) {
            scrollPage.breadthFirstTraverse((node) => {
                if (node.isContent() && node.blockName === 'paragraph.content')
                    collect(node);
            });
        }
        else {
            // During the initial detached build/updateState the live tree is
            // empty. The authoritative JSON state is complete at this point,
            // so use it once to seed the cache.
            // The reference-definition scan is read-only. During the initial
            // progressive mount, use the authoritative source directly so
            // this cold-path fallback does not clone the complete document
            // before the first block window is painted.
            const state = this.muya.editor.jsonState.getStateForRender();
            const travel = (sts: TState[]) => {
                if (Array.isArray(sts) && sts.length) {
                    for (const st of sts) {
                        if (st.name === 'paragraph')
                            collect(st);
                        else if ((st as TContainerState).children)
                            travel((st as TContainerState).children);
                    }
                }
            };
            travel(state);
        }

        this.labels = labels;
        this._referenceDefinitionsDirty = false;
    }

    getLabelInfo(blockOrState: Pick<IParagraphState, 'text'>) {
        const { text } = blockOrState;
        const tokens = beginRules.reference_definition.exec(text);
        let label = null;
        let info = null;
        if (tokens) {
            label = (tokens[2] + tokens[3]).toLowerCase();
            info = {
                href: tokens[6],
                title: tokens[10] || '',
            };
        }

        return { label, info };
    }
}

export default InlineRenderer;
