// @vitest-environment happy-dom

import type { Muya } from '../../muya';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopyType } from '../types';

// The clipboard module pulls in CodeBlockContent → utils/prism, which touches
// `window` at import time. Keep this focused test independent of Prism's
// language loader.
vi.mock('../../utils/prism/index', () => ({
    default: {},
    walkTokens: () => null,
    loadedLanguages: new Set(),
    transformAliasToOrigin: (s: string) => s,
    loadLanguage: () => null,
    search: () => [],
}));

const Clipboard = (await import('../index')).default;

const originalExecCommand = document.execCommand;

afterEach(() => {
    document.body.replaceChildren();
    Object.defineProperty(document, 'execCommand', {
        configurable: true,
        value: originalExecCommand,
    });
});

function makeClipboard() {
    const domNode = document.createElement('div');
    domNode.contentEditable = 'true';
    domNode.tabIndex = 0;
    document.body.append(domNode);

    return {
        domNode,
        clipboard: new Clipboard({ domNode } as unknown as Muya),
    };
}

describe('clipboard menu copies', () => {
    it('restores editor focus before executing a custom copy command', () => {
        const { domNode, clipboard } = makeClipboard();
        const otherControl = document.createElement('button');
        otherControl.type = 'button';
        document.body.append(otherControl);
        otherControl.focus();

        const execCommand = vi.fn(() => {
            expect(document.activeElement).toBe(domNode);
            expect(clipboard.copyType).toBe(CopyType.COPY_AS_RICH);
            return true;
        });
        Object.defineProperty(document, 'execCommand', {
            configurable: true,
            value: execCommand,
        });

        clipboard.copyAsRich();

        expect(execCommand).toHaveBeenCalledWith('copy');
        expect(clipboard.copyType).toBe(CopyType.NORMAL);
    });

    it('resets the custom copy type when the browser rejects the command', () => {
        const { clipboard } = makeClipboard();
        Object.defineProperty(document, 'execCommand', {
            configurable: true,
            value: vi.fn(() => {
                throw new Error('copy unavailable');
            }),
        });

        expect(() => clipboard.copyAsMarkdown()).toThrow('copy unavailable');
        expect(clipboard.copyType).toBe(CopyType.NORMAL);
    });
});
