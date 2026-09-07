import type { Muya } from '../../../muya';
import type { IDiagramMeta, IDiagramState } from '../../../state/types';
import type { TBlockPath } from '../../types';
import logger from '../../../utils/logger';
import { loadLanguage } from '../../../utils/prism';
import Parent from '../../base/parent';
import { ScrollPage } from '../../scrollPage';

const debug = logger('diagram:');

class DiagramBlock extends Parent {
    public meta: IDiagramMeta;
    static override blockName = 'diagram';

    // Focusing the source editor is an explicit request to edit the diagram.
    // Keep this separate from the renderer result so a valid diagram can stay
    // preview-only until the user enters it again.
    override get active() {
        return super.active;
    }

    override set active(value) {
        const wasActive = super.active;
        super.active = value;

        const preview = this.attachments.head as (Parent & {
            showSource?: () => void;
            showPreviewOnBlur?: () => Promise<void>;
        }) | null;
        if (value) {
            preview?.showSource?.();
        }
        else if (wasActive) {
            void preview?.showPreviewOnBlur?.();
        }
    }

    static create(muya: Muya, state: IDiagramState) {
        const diagramBlock = new DiagramBlock(muya, state);
        const { lang } = state.meta;
        const diagramPreview = ScrollPage.loadBlock('diagram-preview').create(
            muya,
            state,
        );
        const diagramContainer = ScrollPage.loadBlock('diagram-container').create(
            muya,
            state,
        );

        diagramBlock.appendAttachment(diagramPreview);
        diagramBlock.append(diagramContainer);

        !!lang
        && loadLanguage(lang)
            .then((infoList) => {
                if (!Array.isArray(infoList))
                    return;
                // There are three status `loaded`, `noexist` and `cached`.
                // if the status is `loaded`, indicated that it's a new loaded language
                const needRender = infoList.some(
                    ({ status }) => status === 'loaded' || status === 'cached',
                );
                if (needRender)
                    diagramBlock.lastContentInDescendant()?.update();
            })
            .catch((err) => {
                // if no parameter provided, will cause error.
                debug.warn(err);
            });

        return diagramBlock;
    }

    override get path() {
        const { path: pPath } = this.parent!;
        const offset = this.parent!.offset(this);

        return [...pPath, offset];
    }

    constructor(muya: Muya, { meta }: IDiagramState) {
        super(muya);
        this.tagName = 'figure';
        this.meta = meta;
        this.classList = ['mu-diagram-block'];
        this.createDomNode();
    }

    queryBlock(path: TBlockPath) {
        if (!path.length)
            return this;
        if (path[0] === 'meta')
            return this;
        if (path[0] === 'type')
            return this.firstContentInDescendant();
        if (path[0] === 'text')
            return this.lastContentInDescendant();

        return this;
    }

    override getState(): IDiagramState {
        const { meta } = this;
        const text = this.lastContentInDescendant()?.text;

        if (text == null)
            throw new Error('text is null when getState in diagram block.');

        return {
            name: 'diagram',
            text,
            meta,
        };
    }

    override remove(source = 'user') {
        // The preview is an attachment rather than a child in the block tree,
        // so it would otherwise keep its debounce timer and renderer view
        // alive after the figure is removed from the document.
        this.attachments.forEach((attachment) => {
            if (attachment.blockName !== 'diagram-preview')
                return;

            (attachment as Parent & { dispose?: () => void }).dispose?.();
        });
        super.remove(source);

        return this;
    }
}

export default DiagramBlock;
