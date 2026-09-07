import type { Muya } from '../../../muya';
import type { IRenderCursor } from '../../../selection/types';
import type { ICodeBlockState, IDiagramState } from '../../../state/types';
import type Parent from '../../base/parent';
import type CodeBlock from '../../commonMark/codeBlock';
import type DiagramContainer from '../../extra/diagram/diagramContainer';
import { CLASS_NAMES } from '../../../config';
import { firstWordOfInfo } from '../../../utils';
import { getDiagramType } from '../../../utils/diagram/languages';
import Content from '../../base/content';
import { replaceBlockWithCode, replaceBlockWithDiagram } from '../../blockTransforms';
import { escapeLangInputInnerHtml } from './escape';

class LangInputContent extends Content {
    public override parent: CodeBlock | DiagramContainer | null = null;

    static override blockName = 'language-input';

    static create(muya: Muya, state: ICodeBlockState | IDiagramState) {
        const content = new LangInputContent(muya, state);

        return content;
    }

    constructor(muya: Muya, state: ICodeBlockState | IDiagramState) {
        const lang = state.name === 'diagram' ? state.meta.type : state.meta.lang;
        super(muya, lang);
        this.classList = [...this.classList, CLASS_NAMES.MU_LANGUAGE_INPUT];
        this.attributes.hint = muya.i18n.t('Input Language Identifier...');
        this.createDomNode();
    }

    override getAnchor() {
        return this.parent;
    }

    override update(_cursor?: IRenderCursor, highlights = []) {
        this.domNode!.innerHTML = escapeLangInputInnerHtml(this.text, highlights);
    }

    /**
     * Update this block lang and parent's lang, and show/hide language selector.
     * @param lang
     */
    private _updateLanguage(lang: string): Content {
        const cursor = this.getCursor();
        const parent = this.parent;
        const host = parent?.blockName === 'diagram-container'
            ? parent.parent
            : parent;
        const diagramType = getDiagramType(firstWordOfInfo(lang));

        // Changing a normal code fence into a supported diagram must replace
        // the block, not merely change `meta.lang`: the diagram renderer and
        // its preview attachment only exist on a Diagram Block. The same
        // replacement path lets a wrongly labelled diagram be corrected.
        if (host?.blockName === 'code-block' && diagramType) {
            const newBlock = replaceBlockWithDiagram(host, diagramType);
            if (newBlock)
                return this._focusReplacedBlock(newBlock);
        }

        if (host?.blockName === 'diagram') {
            const currentType = (host as Parent & { meta: IDiagramState['meta'] }).meta.type;
            if (diagramType && diagramType !== currentType) {
                const newBlock = replaceBlockWithDiagram(host, diagramType);
                if (newBlock)
                    return this._focusReplacedBlock(newBlock);
            }
            else if (!diagramType) {
                // Clearing or changing to a non-diagram language returns to a
                // normal fenced code block, so the “no declared type” rule is
                // preserved and no stale preview remains attached.
                const newBlock = replaceBlockWithCode(host, lang);
                if (newBlock)
                    return this._focusReplacedBlock(newBlock);
            }
        }

        // Diagram metadata stores only the supported type, not an arbitrary
        // info string. Normalize same-type edits before writing `meta.type`.
        const effectiveLang = host?.blockName === 'diagram' && diagramType
            ? diagramType
            : lang;
        const { start, end } = cursor ?? {
            start: { offset: effectiveLang.length },
            end: { offset: effectiveLang.length },
        };
        this.text = effectiveLang;
        if (parent)
            parent.lang = effectiveLang;
        const startOffset = Math.min(effectiveLang.length, start.offset);
        const endOffset = Math.min(effectiveLang.length, end.offset);
        this.setCursor(startOffset, endOffset, true);
        this.muya.eventCenter.emit('content-change', { block: this });

        return this;
    }

    private _focusReplacedBlock(block: Parent): Content {
        const source = block.lastContentInDescendant();
        if (source) {
            source.setCursor(0, 0, true);
            this.muya.eventCenter.emit('content-change', { block: source });
            return source;
        }

        const languageInput = block.firstContentInDescendant();
        if (languageInput) {
            languageInput.setCursor(0, 0, true);
            this.muya.eventCenter.emit('content-change', { block: languageInput });
            return languageInput;
        }

        return this;
    }

    // Public entry for setting the language programmatically (e.g. pasting into
    // the language input), so the code block re-highlights and `parent.lang`
    // updates; the DOM input handlers use `_updateLanguage` directly.
    updateLanguage(lang: string): Content {
        return this._updateLanguage(lang);
    }

    override inputHandler() {
        const textContent = this.domNode!.textContent ?? '';
        // Store the whole info string; the language is derived as its first word
        // elsewhere (`firstWordOfInfo`). Previously this truncated at the first
        // whitespace, which dropped `title="x"` / Pandoc attributes on edit.
        this._updateLanguage(textContent);
    }

    override enterHandler(event: Event) {
        event.preventDefault();
        event.stopPropagation();

        const { parent } = this;
        parent!.lastContentInDescendant()?.setCursor(0, 0);
    }

    override backspaceHandler(event: Event) {
        const { start, end } = this.getCursor()!;
        const { text } = this;
        // The next if statement is used to fix Firefox compatibility issues
        if (start.offset === 1 && end.offset === 1 && text.length === 1) {
            event.preventDefault();
            const lang = '';
            this._updateLanguage(lang);
        }
        if (start.offset === 0 && end.offset === 0) {
            event.preventDefault();
            const cursorBlock = this.previousContentInContext();
            // The cursorBlock will be null, if the code block is the first block in doc.
            if (cursorBlock) {
                const offset = cursorBlock.text.length;
                cursorBlock.setCursor(offset, offset, true);
            }
        }
    }
}

export default LangInputContent;
