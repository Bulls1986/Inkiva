// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { CLASS_NAMES } from '../../../config';
import htmlTag from '../htmlTag';

describe('table hard-break WYSIWYG rendering contract', () => {
    it('keeps the serialized <br> marker hidden while rendering a real line break', () => {
        const h = (selector: string, dataOrChildren?: unknown, children?: unknown) => ({
            selector,
            data: children === undefined ? undefined : dataOrChildren,
            children: children === undefined ? dataOrChildren : children,
        });
        const renderer = {
            highlight: () => ['<br>'],
        };
        const token = {
            type: 'html_tag',
            raw: '<br>',
            tag: 'br',
            openTag: '<br>',
            closeTag: undefined,
            attrs: {},
            children: [],
            range: { start: 1, end: 5 },
        };
        const output = htmlTag.call(renderer as never, {
            h,
            cursor: { start: { offset: 0 }, end: { offset: 0 } },
            block: {},
            token,
        } as never) as unknown as Array<{ selector: string }>;

        expect(output).toHaveLength(2);
        expect(output[0].selector).toContain(CLASS_NAMES.MU_HIDE);
        expect(output[0].selector).toContain(CLASS_NAMES.MU_OUTPUT_REMOVE);
        expect(output[1].selector).toBe('br');
    });
});
