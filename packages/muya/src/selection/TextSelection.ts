import type Content from '../block/base/content';
import type Format from '../block/base/format';
import type { TBlockPath } from '../block/types';
import type { Muya } from '../muya';
import type { Nullable } from '../types';
import type Selection from './index';
import type { IAnchorFocusInfo, INodeOffset, ISelection } from './types';
import { BLOCK_DOM_PROPERTY } from '../config';
import { isHTMLElement, isMouseEvent } from '../utils';
import {
    buildSelectionAffiliation,
    endpointBlockInfo,
} from './affiliation';
import { getCursorCoords } from './cursorCoords';
import {
    compareParagraphsOrder,
    findContentDOM,
    getLegalOffset,
    getNodeAndOffset,
    getOffsetOfParagraph,
} from './dom';
import { SelectionCaretType, SelectionDirection, SelectionType } from './types';

function computeDirection(
    anchorBlock: Content,
    focusBlock: Content,
    anchorOffset: number,
    focusOffset: number,
    isSelectionInSameBlock: boolean,
): SelectionDirection {
    if (isSelectionInSameBlock) {
        return anchorOffset < focusOffset
            ? SelectionDirection.FORWARD
            : SelectionDirection.BACKWARD;
    }

    return compareParagraphsOrder(anchorBlock.domNode!, focusBlock.domNode!)
        ? SelectionDirection.FORWARD
        : SelectionDirection.BACKWARD;
}

function computeCaretType(
    anchorBlock: Nullable<Content>,
    focusBlock: Nullable<Content>,
    isCollapsed: boolean,
): SelectionCaretType {
    if (!anchorBlock && !focusBlock)
        return SelectionCaretType.NONE;

    return isCollapsed ? SelectionCaretType.CARET : SelectionCaretType.RANGE;
}

class TextSelection {
    public anchorPath: TBlockPath = [];
    public anchorBlock: Nullable<Content> = null;
    public focusPath: TBlockPath = [];
    public focusBlock: Nullable<Content> = null;
    public anchor: Nullable<INodeOffset> = null;
    public focus: Nullable<INodeOffset> = null;

    private _doc: Document = document;

    private _selectInfo: {
        isSelect: boolean;
        selection: { anchor: IAnchorFocusInfo; focus: IAnchorFocusInfo } | null;
    } = {
        isSelect: false,
        selection: null,
    };

    constructor(private _muya: Muya, private _selection: Selection) {
        this._listenSelectActions();
    }

    private get _scrollPage() {
        return this._muya.editor.scrollPage;
    }

    private get _isCollapsed() {
        const { anchorBlock, focusBlock, anchor, focus } = this;

        if (anchor == null || focus == null)
            return false;

        return anchorBlock === focusBlock && anchor.offset === focus.offset;
    }

    get isSelectionInSameBlock() {
        const { anchorBlock, focusBlock, anchor, focus } = this;

        if (anchor == null || focus == null)
            return false;

        return anchorBlock === focusBlock;
    }

    private get _direction() {
        const {
            anchor,
            focus,
            anchorBlock,
            focusBlock,
            isSelectionInSameBlock,
            _isCollapsed: isCollapsed,
        } = this;
        if (anchor == null || focus == null || !anchorBlock || !focusBlock)
            return SelectionDirection.NONE;

        if (isCollapsed)
            return SelectionDirection.NONE;

        return computeDirection(
            anchorBlock,
            focusBlock,
            anchor.offset,
            focus.offset,
            isSelectionInSameBlock,
        );
    }

    private get _type() {
        const { anchorBlock, focusBlock, _isCollapsed: isCollapsed } = this;

        return computeCaretType(anchorBlock, focusBlock, isCollapsed);
    }

    collapse(): void {
        this.anchor = null;
        this.focus = null;
        this.anchorBlock = null;
        this.focusBlock = null;
        this.anchorPath = [];
        this.focusPath = [];
        this._updateSelection();
        this._emitSelectionChange();
    }

    selectAllContent() {
        const { _scrollPage: scrollPage } = this;
        const aBlock = scrollPage?.firstContentInDescendant();
        const fBlock = scrollPage?.lastContentInDescendant();

        if (aBlock == null || fBlock == null)
            return;

        this.setSelection(
            { offset: 0, block: aBlock, path: aBlock.path },
            { offset: fBlock.text.length, block: fBlock, path: fBlock.path },
        );
        const activeEle = this._doc.activeElement;
        if (isHTMLElement(activeEle) && activeEle.classList.contains('mu-content'))
            activeEle.blur();
    }

    getSelection(): ISelection | null {
        const selection = this._doc.getSelection();

        if (!selection)
            return null;

        const { anchorNode, anchorOffset, focusNode, focusOffset } = selection;

        if (!anchorNode || !focusNode)
            return null;

        const anchorDomNode = findContentDOM(anchorNode);
        const focusDomNode = findContentDOM(focusNode);

        if (!anchorDomNode || !focusDomNode)
            return null;

        const anchorBlock = anchorDomNode[BLOCK_DOM_PROPERTY] as Content | undefined;
        const focusBlock = focusDomNode[BLOCK_DOM_PROPERTY] as Content | undefined;
        // An `mu-content` span cloned by the browser's native edit
        // behavior is not linked back to a block. Bail out instead of
        // crashing — the caller treats null the same as "no selection".
        if (!anchorBlock || !focusBlock)
            return null;

        if (!anchorBlock.outMostBlock || !focusBlock.outMostBlock)
            return null;

        const anchorPath = anchorBlock.path;
        const focusPath = focusBlock.path;

        const aOffset = getOffsetOfParagraph(anchorNode, anchorDomNode) + anchorOffset;
        const fOffset = getOffsetOfParagraph(focusNode, focusDomNode) + focusOffset;
        const anchor = { offset: aOffset };
        const focus = { offset: fOffset };

        const isCollapsed = anchorBlock === focusBlock && anchor.offset === focus.offset;
        const isSelectionInSameBlock = anchorBlock === focusBlock;

        const direction = computeDirection(
            anchorBlock,
            focusBlock,
            anchor.offset,
            focus.offset,
            isSelectionInSameBlock,
        );
        const type = computeCaretType(anchorBlock, focusBlock, isCollapsed);

        return {
            anchor: { offset: anchor.offset, block: anchorBlock, path: anchorPath },
            focus: { offset: focus.offset, block: focusBlock, path: focusPath },
            isCollapsed,
            isSelectionInSameBlock,
            direction,
            type,
        };
    }

    setSelection(anchor: IAnchorFocusInfo, focus: IAnchorFocusInfo) {
        this.anchor = { offset: anchor.offset };
        this.anchorBlock = anchor.block;
        this.anchorPath = anchor.path;
        this.focus = { offset: focus.offset };
        this.focusBlock = focus.block;
        this.focusPath = focus.path;
        this._updateSelection();
        this._emitSelectionChange();
    }

    private _emitSelectionChange() {
        const { _isCollapsed: isCollapsed, isSelectionInSameBlock, _direction: direction, _type: type } = this;
        const anchorBlock = this.anchorBlock ?? null;
        const focusBlock = this.focusBlock ?? null;

        // Follow the caret (focus end) for forward selections so typewriter
        // scrolling tracks the cursor rather than the selection start.
        const cursorCoords = getCursorCoords(direction === SelectionDirection.FORWARD);
        // Duck-type the Format block — a value import of Format here would
        // create a selection -> format circular dependency.
        const anchorBlockRef = anchorBlock as Format | null;
        const formats
            = isSelectionInSameBlock
                && anchorBlockRef
                && typeof anchorBlockRef.getFormatsInRange === 'function'
                ? anchorBlockRef.getFormatsInRange().formats
                : [];

        const affiliation = buildSelectionAffiliation(anchorBlock, focusBlock);

        this._muya.eventCenter.emit('selection-change', {
            anchor: this.anchor,
            focus: this.focus,
            anchorBlock,
            anchorPath: this.anchorPath,
            focusBlock,
            focusPath: this.focusPath,
            isCollapsed,
            isSelectionInSameBlock,
            direction,
            type,
            kind: SelectionType.TEXT,
            selectedImage: this._selection.image,
            cursorCoords,
            formats,
            affiliation,
            anchorBlockInfo: endpointBlockInfo(anchorBlock),
            focusBlockInfo: endpointBlockInfo(focusBlock),
        });
    }

    private _listenSelectActions() {
        const { eventCenter, domNode } = this._muya;

        const handleMousedown = () => {
            this._selectInfo = {
                isSelect: true,
                selection: null,
            };
        };

        const handleMouseupOrLeave = () => {
            // Clear the pending drag state before restoring it. A DOM edit can
            // detach one of the saved endpoints between mousemove and mouseup;
            // if restoring it throws, the following mouseleave/mouseup must not
            // retry the same stale selection forever.
            const pendingSelection = this._selectInfo.selection;
            this._selectInfo = {
                isSelect: false,
                selection: null,
            };

            if (pendingSelection)
                this.setSelection(pendingSelection.anchor, pendingSelection.focus);
        };

        const handleMousemoveOrClick = (event: Event) => {
            if (!isMouseEvent(event))
                return;

            const { type, shiftKey } = event;
            if (type === 'mousemove' && !this._selectInfo.isSelect)
                return;

            if (type === 'click' && !shiftKey)
                return;

            const selection = this.getSelection();
            if (!selection)
                return;

            const { anchor, focus, isSelectionInSameBlock } = selection;

            if (isSelectionInSameBlock) {
                return;
            }

            const anchorBlock = anchor.block;
            const focusBlock = focus.block;
            const endpointAnchor = { offset: anchor.offset, block: anchorBlock, path: anchorBlock.path };
            const endpointFocus = { offset: focus.offset, block: focusBlock, path: focusBlock.path };

            if (type === 'mousemove')
                this._selectInfo.selection = { anchor: endpointAnchor, focus: endpointFocus };
            else
                this.setSelection(endpointAnchor, endpointFocus);
        };

        eventCenter.attachDOMEvent(domNode, 'mousedown', handleMousedown);
        eventCenter.attachDOMEvent(domNode, 'mousemove', handleMousemoveOrClick);
        eventCenter.attachDOMEvent(domNode, 'mouseup', handleMouseupOrLeave);
        eventCenter.attachDOMEvent(domNode, 'mouseleave', handleMouseupOrLeave);
        eventCenter.attachDOMEvent(domNode, 'click', handleMousemoveOrClick);
    }

    private _isLiveNode(node: Node | null): node is Node {
        return !!node
            && node.ownerDocument === this._doc
            && this._muya.domNode.contains(node);
    }

    private _resolveEndpoint(block: Nullable<Content>, path: TBlockPath) {
        const paragraph = block?.domNode;
        if (block && paragraph && this._isLiveNode(paragraph))
            return { block, paragraph };

        const resolvedBlock = this._scrollPage?.queryBlock([...path]);
        const resolvedParagraph = resolvedBlock?.isContent() ? resolvedBlock.domNode : null;
        if (resolvedBlock?.isContent() && resolvedParagraph && this._isLiveNode(resolvedParagraph))
            return { block: resolvedBlock, paragraph: resolvedParagraph };

        return null;
    }

    private _normalizeOffset(block: Content, offset: number) {
        if (!Number.isFinite(offset) || offset < 0)
            return 0;

        return Math.min(offset, block.text.length);
    }

    private _clearNativeSelection() {
        const selection = this._doc.getSelection();
        if (selection)
            selection.removeAllRanges();
    }

    private _selectRange(range: Range) {
        const selection = this._doc.getSelection();

        if (!selection)
            return false;

        try {
            selection.removeAllRanges();
            selection.addRange(range);
        }
        catch {
            return false;
        }

        // WebKit can silently reject a range whose endpoint was detached by a
        // concurrent DOM update. `extend()` throws InvalidStateError when there
        // is no range, so never report success based only on addRange returning.
        return selection.rangeCount > 0;
    }

    private _select(
        startNode: Node,
        startOffset: number,
        endNode?: Node,
        endOffset?: number,
    ) {
        if (!this._isLiveNode(startNode) || (endNode && !this._isLiveNode(endNode)))
            return null;

        try {
            const range = this._doc.createRange();
            range.setStart(startNode, getLegalOffset(startNode, startOffset));
            if (endNode && typeof endOffset === 'number')
                range.setEnd(endNode, getLegalOffset(endNode, endOffset));
            else
                range.collapse(true);

            return this._selectRange(range) ? range : null;
        }
        catch {
            return null;
        }
    }

    private _setFocus(focusNode: Node, focusOffset: number) {
        const selection = this._doc.getSelection();
        if (!selection || selection.rangeCount === 0 || !this._isLiveNode(focusNode))
            return;

        try {
            selection.extend(focusNode, getLegalOffset(focusNode, focusOffset));
        }
        catch {
            // A DOM replacement can invalidate the native range between the
            // guard above and extend(). Recover with a collapsed caret when the
            // focus node is still live; never let a browser Selection error
            // escape into the renderer process.
            this._select(focusNode, focusOffset);
        }
    }

    private _updateSelection() {
        const {
            anchor,
            focus,
            anchorBlock,
            anchorPath,
            focusBlock,
            focusPath,
            _scrollPage: scrollPage,
        } = this;

        if (!anchor || !focus) {
            const selection = this._doc.getSelection();

            if (selection)
                selection.removeAllRanges();

            return;
        }

        const anchorEndpoint = this._resolveEndpoint(anchorBlock, anchorPath);
        const focusEndpoint = this._resolveEndpoint(focusBlock, focusPath);

        // A block may have been removed or replaced after the selection was
        // captured. Prefer the endpoint that still resolves, otherwise use the
        // first live content block. This turns a stale selection into a safe
        // caret instead of feeding detached nodes to the DOM Range API.
        if (!anchorEndpoint || !focusEndpoint) {
            const fallbackEndpoint = anchorEndpoint ?? focusEndpoint;
            const fallbackBlock = fallbackEndpoint?.block ?? scrollPage?.firstContentInDescendant();
            const paragraph = fallbackEndpoint?.paragraph ?? fallbackBlock?.domNode;

            if (!fallbackBlock || !paragraph || !this._isLiveNode(paragraph)) {
                this.anchor = null;
                this.focus = null;
                this.anchorBlock = null;
                this.focusBlock = null;
                this.anchorPath = [];
                this.focusPath = [];
                this._clearNativeSelection();
                return;
            }

            const sourceOffset = anchorEndpoint
                ? anchor.offset
                : focusEndpoint
                    ? focus.offset
                    : 0;
            const offset = this._normalizeOffset(fallbackBlock, sourceOffset);
            this.anchor = { offset };
            this.focus = { offset };
            this.anchorBlock = fallbackBlock;
            this.focusBlock = fallbackBlock;
            this.anchorPath = [...fallbackBlock.path];
            this.focusPath = [...fallbackBlock.path];

            const { node, offset: nodeOffset } = getNodeAndOffset(paragraph, offset);
            this._select(node, nodeOffset);
            return;
        }

        const anchorOffset = this._normalizeOffset(anchorEndpoint.block, anchor.offset);
        const focusOffset = this._normalizeOffset(focusEndpoint.block, focus.offset);
        this.anchorBlock = anchorEndpoint.block;
        this.anchorPath = [...anchorEndpoint.block.path];
        this.anchor = { offset: anchorOffset };
        this.focusBlock = focusEndpoint.block;
        this.focusPath = [...focusEndpoint.block.path];
        this.focus = { offset: focusOffset };

        const { node: anchorNode, offset: anchorNodeOffset } = getNodeAndOffset(
            anchorEndpoint.paragraph,
            anchorOffset,
        );
        const { node: focusNode, offset: focusNodeOffset } = getNodeAndOffset(
            focusEndpoint.paragraph,
            focusOffset,
        );

        if (this._select(anchorNode, anchorNodeOffset))
            this._setFocus(focusNode, focusNodeOffset);
    }
}

export default TextSelection;
