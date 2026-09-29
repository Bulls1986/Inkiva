// utils used in selection/index.js
import { CLASS_NAMES } from '../config';
import { isElement } from '../utils';

export function isContentDOM(element: HTMLElement) {
    return (
        element
        && element.tagName === 'SPAN'
        && element.classList.contains('mu-content')
    );
}

export function findContentDOM(node: Node | null | undefined) {
    if (!node)
        return null;

    do {
        if (node instanceof HTMLElement && isContentDOM(node))
            return node;

        node = node.parentNode;
    } while (node);

    return null;
}

export function compareParagraphsOrder(paragraph1: HTMLElement, paragraph2: HTMLElement) {
    return (
        paragraph1.compareDocumentPosition(paragraph2)
        & Node.DOCUMENT_POSITION_FOLLOWING
    );
}

export function getTextContent(node: Node, blackList: string[] = []) {
    if (node.nodeType === Node.TEXT_NODE || blackList.length === 0)
        return node.textContent!;

    let text = '';
    if (
        isElement(node)
        && blackList.some(
            className => node.classList && node.classList.contains(className),
        )
    ) {
        return text;
    }

    if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
    }
    else if (
        isElement(node)
        && node.classList.contains(`${CLASS_NAMES.MU_INLINE_IMAGE}`)
    ) {
    // handle inline image
        const raw = node.getAttribute('data-raw');
        const imageContainer = node.querySelector(
            `.${CLASS_NAMES.MU_IMAGE_CONTAINER}`,
        );
        const hasImg = imageContainer!.querySelector('img');
        const childNodes = imageContainer!.childNodes;
        if (childNodes.length && hasImg) {
            for (const child of childNodes) {
                if (child.nodeType === Node.ELEMENT_NODE && child.nodeName === 'IMG')
                    text += raw;
                else if (child.nodeType === Node.TEXT_NODE)
                    text += child.textContent;
            }
        }
        else {
            text += raw;
        }
    }
    else {
        const childNodes = node.childNodes;

        for (const n of childNodes)
            text += getTextContent(n, blackList);
    }

    return text;
}

const SELECTION_TEXT_BLACKLIST = [
    CLASS_NAMES.MU_MATH_RENDER,
    CLASS_NAMES.MU_RUBY_RENDER,
];

function getSelectionTextLength(node: Node): number {
    return getTextContent(node, SELECTION_TEXT_BLACKLIST).length;
}

export function getOffsetOfParagraph(node: Node, paragraph: HTMLElement): number {
    let offset = 0;
    let preSibling: Node | null = node;

    if (node === paragraph)
        return offset;

    do {
        preSibling = preSibling.previousSibling;
        if (preSibling)
            offset += getSelectionTextLength(preSibling);
    } while (preSibling);

    return node === paragraph || node.parentNode === paragraph
        ? offset
        : offset + getOffsetOfParagraph(node.parentNode!, paragraph);
}

function getInlineImageSourceOffset(
    node: Node,
    domOffset: number,
    paragraph: HTMLElement,
): number | null {
    if (
        !isElement(node)
        || !node.classList.contains(CLASS_NAMES.MU_IMAGE_CONTAINER)
    ) {
        return null;
    }

    const imageContainer = node;
    const imageWrapper = imageContainer.closest<HTMLElement>(
        `.${CLASS_NAMES.MU_INLINE_IMAGE}`,
    );

    if (!imageWrapper || !paragraph.contains(imageWrapper))
        return null;

    const imageStart = getOffsetOfParagraph(imageWrapper, paragraph);
    const raw = imageWrapper.getAttribute('data-raw');
    const imageLength = raw?.length ?? getSelectionTextLength(imageWrapper);

    return imageStart + (domOffset > 0 ? imageLength : 0);
}

function getHardBreakSourceOffset(
    node: Node,
    domOffset: number,
    paragraph: HTMLElement,
): number | null {
    if (!isElement(node))
        return null;

    const childNodes = node.childNodes;
    const boundary = Math.min(Math.max(domOffset, 0), childNodes.length);
    const beforeMarker = childNodes[boundary];
    const afterBreak = boundary >= 2
        && childNodes[boundary - 1]?.nodeName === 'BR'
        && isHiddenHardBreakMarker(childNodes[boundary - 2]);

    const beforeBreak = beforeMarker != null
        && isHiddenHardBreakMarker(beforeMarker);

    if (!beforeBreak && !afterBreak)
        return null;

    let localOffset = 0;
    for (let i = 0; i < boundary; i++)
        localOffset += getSelectionTextLength(childNodes[i]);

    return getOffsetOfParagraph(node, paragraph) + localOffset;
}

/**
 * Convert one native DOM Range endpoint into the source-text offset used by
 * Muya's logical selection.
 *
 * Ordinary Element offsets retain Muya's legacy DOM-boundary semantics.
 * Renderers whose visual topology diverges from their source range must opt in
 * through an explicit atomic-boundary mapping instead of changing every
 * Element endpoint globally.
 */
export function getSourceOffsetOfDomPoint(
    node: Node,
    domOffset: number,
    paragraph: HTMLElement,
): number {
    const imageOffset = getInlineImageSourceOffset(node, domOffset, paragraph);
    if (imageOffset != null)
        return imageOffset;

    const hardBreakOffset = getHardBreakSourceOffset(node, domOffset, paragraph);
    if (hardBreakOffset != null)
        return hardBreakOffset;

    const baseOffset = getOffsetOfParagraph(node, paragraph);

    if (node.nodeType === Node.TEXT_NODE)
        return baseOffset + Math.min(Math.max(domOffset, 0), (node as Text).length);

    return baseOffset + Math.min(Math.max(domOffset, 0), node.childNodes.length);
}

function isHiddenHardBreakMarker(node: Node): node is HTMLElement {
    return isElement(node)
        && node.classList.contains(CLASS_NAMES.MU_HIDE)
        && node.classList.contains(CLASS_NAMES.MU_HTML_TAG)
        && node.classList.contains(CLASS_NAMES.MU_OUTPUT_REMOVE)
        && node.nextSibling?.nodeName === 'BR';
}

function getHardBreakBoundary(
    parent: Node,
    markerIndex: number,
    sourceOffset: number,
    sourceLength: number,
): { node: Node; offset: number } {
    const before = markerIndex;
    const after = Math.min(markerIndex + 2, parent.childNodes.length);

    if (sourceOffset <= 0)
        return { node: parent, offset: before };

    if (sourceOffset >= sourceLength)
        return { node: parent, offset: after };

    return sourceOffset * 2 < sourceLength
        ? { node: parent, offset: before }
        : { node: parent, offset: after };
}

export function getNodeAndOffset(
    node: Node,
    offset: number,
): { node: Node; offset: number } {
    if (node.nodeType === Node.TEXT_NODE) {
        return {
            node,
            offset,
        };
    }

    const childNodes = node.childNodes;
    const len = childNodes.length;
    let i;
    let count = 0;

    for (i = 0; i < len; i++) {
        const child = childNodes[i];
        const textContent = getTextContent(child, SELECTION_TEXT_BLACKLIST);
        const textLength = textContent.length;

        if (
            isHiddenHardBreakMarker(child)
            && count <= offset
            && offset <= count + textLength
        ) {
            return getHardBreakBoundary(
                node,
                i,
                offset - count,
                textLength,
            );
        }

        // Fix #1460 - put the cursor at the next text node or element if it can be put at the last of /^\n$/ or the next text node/element.
        if (
            /^\n$/.test(textContent) && i !== len - 1
                ? count + textLength > offset
                : count + textLength >= offset
        ) {
            if (
                isElement(child)
                && child.classList
                && child.classList.contains(`${CLASS_NAMES.MU_INLINE_IMAGE}`)
            ) {
                const imageContainer = child.querySelector(
                    `.${CLASS_NAMES.MU_IMAGE_CONTAINER}`,
                )!;
                const hasImg = imageContainer.querySelector('img');

                if (!hasImg) {
                    return {
                        node: child,
                        offset: 0,
                    };
                }

                if (count + textLength === offset) {
                    if (child.nextElementSibling) {
                        return {
                            node: child.nextElementSibling,
                            offset: 0,
                        };
                    }
                    else {
                        return {
                            node: imageContainer,
                            offset: 1,
                        };
                    }
                }
                else if (count === offset && count === 0) {
                    return {
                        node: imageContainer,
                        offset: 0,
                    };
                }
                else {
                    return {
                        node: child,
                        offset: 0,
                    };
                }
            }
            else {
                return getNodeAndOffset(child, offset - count);
            }
        }
        else {
            count += textLength;
        }
    }

    return { node, offset };
}

export function getLegalOffset(node: Node, offset: number): number {
    if (!node || typeof offset !== 'number' || !Number.isFinite(offset) || offset < 0)
        return 0;

    const max = node.nodeType === Node.TEXT_NODE
        ? (node as Text).length
        : node.childNodes.length;

    return Math.min(offset, max);
}
