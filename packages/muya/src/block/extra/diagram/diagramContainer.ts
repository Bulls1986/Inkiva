import type { Muya } from '../../../muya';
import type { IDiagramMeta, IDiagramState, TState } from '../../../state/types';
import { firstWordOfInfo } from '../../../utils';
import { getDiagramType } from '../../../utils/diagram/languages';
import logger from '../../../utils/logger';
import Parent from '../../base/parent';
import { ScrollPage } from '../../scrollPage';

const debug = logger('diagramContainer:');

class DiagramContainer extends Parent {
    public meta: IDiagramMeta;
    static override blockName = 'diagram-container';

    static create(muya: Muya, state: IDiagramState) {
        const diagramContainer = new DiagramContainer(muya, state);

        // Diagram Blocks need the same editable language affordance as normal
        // fenced code blocks. LangInputContent reads `meta.type` for diagram
        // state, while the code child continues to read the original source.
        const langInput = ScrollPage.loadBlock('language-input').create(
            muya,
            state,
        );
        const code = ScrollPage.loadBlock('code').create(muya, state);

        diagramContainer.append(langInput);
        diagramContainer.append(code);

        return diagramContainer;
    }

    get lang() {
        return this.meta.type;
    }

    set lang(value: string) {
        const type = getDiagramType(firstWordOfInfo(value));
        if (type)
            this.meta.type = type;
    }

    override get path() {
        const { path: pPath } = this.parent!;

        return [...pPath];
    }

    constructor(muya: Muya, { meta }: IDiagramState) {
        super(muya);
        this.tagName = 'pre';
        this.meta = meta;
        this.classList = ['mu-diagram-container'];
        this.createDomNode();
    }

    override getState(): TState {
        debug.warn('You can never call `getState` in diagramContainer');
        return {} as TState;
    }
}

export default DiagramContainer;
