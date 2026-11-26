import type { Muya } from '../../../muya';
import type Parent from '../../base/parent';
import { isKeyboardEvent } from '../../../utils';
import logger from '../../../utils/logger';
import TreeNode from '../../base/treeNode';

const debug = logger('headingCollapseToggle:');

/**
 * A heading section can be collapsed without changing the document. The
 * control is an attachment like the heading copy-link affordance: it owns a
 * DOM node and interaction handlers but contributes no state to the Markdown
 * document model.
 *
 * The scroll page decides whether a heading has collapsible content and keeps
 * the visible/aria state in sync. Keeping that decision out of this block is
 * important because headings are also created incrementally while typing, when
 * the surrounding section is not yet known.
 */
class HeadingCollapseToggle extends TreeNode {
    static override blockName = 'heading-collapse-toggle';

    private _eventIds: string[] = [];
    private _available = true;
    private _expanded = true;
    private _headingLabel = '';

    static create(muya: Muya, _state?: unknown) {
        return new HeadingCollapseToggle(muya);
    }

    get isContainerBlock() {
        return false;
    }

    constructor(muya: Muya) {
        super(muya);
        this.tagName = 'button';
        this.classList = ['mu-heading-collapse-toggle'];
        this.attributes = {
            'type': 'button',
            'contenteditable': 'false',
            'role': 'button',
            'tabindex': '0',
            'aria-expanded': 'true',
            'data-testid': 'heading-collapse-toggle',
            'title': this._label(true),
        };
        this.createDomNode();
        if (this.domNode)
            this._initializeDomNode();
    }

    private _label(expanded: boolean): string {
        const action = this.muya.i18n.t(expanded ? 'Collapse section' : 'Expand section');
        return this._headingLabel ? `${action}: ${this._headingLabel}` : action;
    }

    private _initializeDomNode() {
        const { domNode } = this;
        if (!domNode)
            return;
        this._applyDomState();
        this._listen();
    }

    private _applyDomState() {
        const { domNode } = this;
        if (!domNode)
            return;
        domNode.classList.toggle('is-collapsed', !this._expanded);
        domNode.classList.toggle('mu-heading-collapse-toggle--hidden', !this._available);
        domNode.hidden = !this._available;
        domNode.setAttribute('aria-expanded', String(this._expanded));
        domNode.setAttribute('aria-label', this._label(this._expanded));
        domNode.setAttribute('title', this._label(this._expanded));
    }

    setHeadingLabel(label: string) {
        this._headingLabel = label.trim();
        this._applyDomState();
    }

    setAvailable(available: boolean) {
        this._available = available;
        this._applyDomState();
    }

    override materializeDomTree() {
        const wasMaterialized = this.domNode !== null;
        const domNode = super.materializeDomTree();
        if (!wasMaterialized && domNode)
            this._initializeDomNode();
        return domNode;
    }

    override dematerializeDomTree(): void {
        this._detachDOMEvents();
        super.dematerializeDomTree();
    }

    setExpanded(expanded: boolean) {
        this._expanded = expanded;
        this.classList = expanded
            ? ['mu-heading-collapse-toggle']
            : ['mu-heading-collapse-toggle', 'is-collapsed'];
        this._applyDomState();
    }

    private _listen() {
        const { domNode, muya } = this;
        const { eventCenter } = muya;

        const clickHandler = (event: Event) => {
            event.preventDefault();
            event.stopPropagation();
            this._activate();
        };
        const keydownHandler = (event: Event) => {
            if (!isKeyboardEvent(event))
                return;
            if (event.key !== 'Enter' && event.key !== ' ')
                return;
            event.preventDefault();
            event.stopPropagation();
            this._activate();
        };

        this._eventIds.push(
            eventCenter.attachDOMEvent(domNode!, 'click', clickHandler),
            eventCenter.attachDOMEvent(domNode!, 'keydown', keydownHandler),
        );
    }

    private _activate() {
        const heading = this.parent as Parent | null;
        if (!heading)
            return;
        this.scrollPage?.toggleHeadingCollapse(heading);
    }

    private _detachDOMEvents() {
        const eventIds = this._eventIds.splice(0);
        for (const id of eventIds)
            this.muya.eventCenter.detachDOMEvent(id);
    }

    override dispose(): void {
        this._detachDOMEvents();
        super.dispose();
    }

    getState() {
        debug.warn('You should never call this method.');
    }
}

export default HeadingCollapseToggle;
