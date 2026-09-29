// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { CLASS_NAMES } from '../../config';
import {
    getLegalOffset,
    getNodeAndOffset,
    getSourceOffsetOfDomPoint,
} from '../dom';

// Regression coverage for the `Failed to execute 'setStart' on 'Range'`
// crashes reported in #4575 / #4464 (offset past the rendered text after a
// re-render) and #4458 (offset 4294967295 = unsigned -1 from a corrupted
// browser selection). The legacy engine clamped the recorded offset to the
// node's legal range before touching the DOM Range API; the rewrite dropped
// that guard. `getLegalOffset` restores it.
describe('getLegalOffset', () => {
    it('clamps a text-node offset to the text length', () => {
        const text = document.createTextNode('abc');

        expect(getLegalOffset(text, 99)).toBe(3);
    });

    it('clamps an element-node offset to childNodes.length', () => {
        const el = document.createElement('span');
        el.appendChild(document.createTextNode('a'));
        el.appendChild(document.createElement('b'));

        expect(getLegalOffset(el, 99)).toBe(2);
    });

    it('coerces a negative offset to 0', () => {
        const text = document.createTextNode('abc');

        expect(getLegalOffset(text, -1)).toBe(0);
    });

    it('clamps the unsigned -1 offset (4294967295) to the text length', () => {
        const text = document.createTextNode('abc');

        expect(getLegalOffset(text, 4294967295)).toBe(3);
    });

    it('leaves an in-range offset unchanged', () => {
        const text = document.createTextNode('abcde');

        expect(getLegalOffset(text, 2)).toBe(2);
    });

    it('produces an offset Range.setStart accepts when getNodeAndOffset overflows', () => {
        const p = document.createElement('p');
        p.appendChild(document.createTextNode('hello'));
        document.body.appendChild(p);

        const { node, offset } = getNodeAndOffset(p, 999);
        const legal = getLegalOffset(node, offset);

        expect(legal).toBeLessThanOrEqual(
            node.nodeType === Node.TEXT_NODE
                ? (node as Text).length
                : node.childNodes.length,
        );
        expect(legal).toBeGreaterThanOrEqual(0);

        p.remove();
    });
});

describe('source ↔ DOM caret mapping', () => {
    function hardBreakDom() {
        const paragraph = document.createElement('span');
        paragraph.appendChild(document.createTextNode('alpha'));

        const marker = document.createElement('span');
        marker.classList.add(
            CLASS_NAMES.MU_HIDE,
            CLASS_NAMES.MU_HTML_TAG,
            CLASS_NAMES.MU_OUTPUT_REMOVE,
        );
        marker.textContent = '<br>';
        paragraph.appendChild(marker);
        paragraph.appendChild(document.createElement('br'));
        paragraph.appendChild(document.createTextNode('beta'));

        return paragraph;
    }

    it('maps the source offset after an atomic hard break to the visible DOM boundary after <br>', () => {
        const paragraph = hardBreakDom();
        const point = getNodeAndOffset(paragraph, 'alpha<br>'.length);

        expect(point.node).toBe(paragraph);
        expect(point.offset).toBe(3);
        expect(getSourceOffsetOfDomPoint(point.node, point.offset, paragraph))
            .toBe('alpha<br>'.length);
    });

    it('projects only explicit hard-break element boundaries into source offsets', () => {
        const paragraph = hardBreakDom();

        expect(getSourceOffsetOfDomPoint(paragraph, 1, paragraph)).toBe('alpha'.length);
        expect(getSourceOffsetOfDomPoint(paragraph, 3, paragraph)).toBe('alpha<br>'.length);
    });

    it('preserves legacy offsets for ordinary element boundaries', () => {
        const paragraph = document.createElement('span');
        const plainText = document.createElement('span');
        plainText.classList.add('mu-plain-text');
        plainText.textContent = 'The quick needleAlpha brown fox and needleBeta jumps.';
        paragraph.appendChild(plainText);

        expect(getSourceOffsetOfDomPoint(plainText, 1, paragraph)).toBe(1);
    });

    it('maps a caret after a rendered inline image to the atomic image source end', () => {
        const raw = '![alt](https://example.com/a.png)';
        const paragraph = document.createElement('span');
        const wrapper = document.createElement('span');
        wrapper.classList.add(CLASS_NAMES.MU_INLINE_IMAGE);
        wrapper.setAttribute('data-raw', raw);

        const container = document.createElement('span');
        container.classList.add(CLASS_NAMES.MU_IMAGE_CONTAINER);
        container.appendChild(document.createElement('img'));
        wrapper.appendChild(container);
        paragraph.appendChild(wrapper);

        expect(getSourceOffsetOfDomPoint(container, 0, paragraph)).toBe(0);
        expect(getSourceOffsetOfDomPoint(container, 1, paragraph)).toBe(raw.length);
    });
});
