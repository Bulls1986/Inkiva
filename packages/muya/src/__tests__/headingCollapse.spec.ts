// @vitest-environment happy-dom

import type Content from '../block/base/content';
import type Parent from '../block/base/parent';
import type { ScrollPage } from '../block/scrollPage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../muya';

interface IHeadingCollapseState {
    key: string;
    level: number;
    collapsed: boolean;
}

interface IHeadingCollapseApi {
    getHeadingCollapseState: () => IHeadingCollapseState[];
    setHeadingCollapseState: (state: readonly IHeadingCollapseState[]) => void;
    setHeadingCollapsed: (slug: string, collapsed: boolean) => boolean;
    revealHeadingTarget: (slug: string) => boolean;
    revealBlockTarget: (blockIndex: number) => boolean;
    revealElementTarget: (element: Element) => boolean;
    isTocItemVisible: (slug: string) => boolean;
}

const bootedHosts: HTMLElement[] = [];
let originalVersion: string | undefined;
let hadVersion = false;

beforeEach(() => {
    hadVersion = 'MUYA_VERSION' in window;
    originalVersion = window.MUYA_VERSION;
    window.MUYA_VERSION = 'test';
});

afterEach(() => {
    while (bootedHosts.length) {
        const host = bootedHosts.pop()!;
        host.remove();
    }
    if (hadVersion)
        window.MUYA_VERSION = originalVersion as string;
    else
        delete (window as Partial<Window>).MUYA_VERSION;
});

function bootMuya(
    markdown: string,
    options: Record<string, unknown> = {},
): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { markdown, ...options } as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    bootedHosts.push(muya.domNode);
    return muya;
}

function collapseApi(muya: Muya): IHeadingCollapseApi {
    return muya as unknown as IHeadingCollapseApi;
}

function topLevelBlock(muya: Muya, index: number): Parent {
    return muya.editor.scrollPage!.find(index) as Parent;
}

function headingByText(muya: Muya, text: string): HTMLElement {
    const heading = Array.from(muya.domNode.querySelectorAll('h1, h2, h3, h4, h5, h6'))
        .find(node => node.textContent?.includes(text));
    if (!heading)
        throw new Error(`heading not found: ${text}`);
    return heading as HTMLElement;
}

function toggleFor(muya: Muya, text: string): HTMLElement | null {
    return headingByText(muya, text).querySelector<HTMLElement>('.mu-heading-collapse-toggle:not([hidden])');
}

function clickToggle(muya: Muya, text: string): void {
    const toggle = toggleFor(muya, text);
    if (!toggle)
        throw new Error(`collapse toggle not found: ${text}`);
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

function isSectionHidden(block: Parent): boolean {
    return Boolean(block.domNode?.classList.contains('mu-heading-section-hidden'));
}

const markdown = [
    '# Alpha',
    '',
    'Alpha body.',
    '',
    '## Beta',
    '',
    'Beta body.',
    '',
    '### Empty child',
    '',
    '# Gamma',
    '',
    'Gamma body.',
    '',
    '# Last',
].join('\n');

describe('v0.7.0 heading collapse', () => {
    it('renders a collapse control only for headings with section content', () => {
        const muya = bootMuya(markdown);

        expect(muya.getTOC().map(item => item.content)).toEqual([
            'Alpha',
            'Beta',
            'Empty child',
            'Gamma',
            'Last',
        ]);
        expect(muya.domNode.querySelectorAll('.mu-heading-collapse-toggle:not([hidden])')).toHaveLength(3);
        expect(toggleFor(muya, 'Alpha')?.getAttribute('aria-expanded')).toBe('true');
        expect(toggleFor(muya, 'Beta')?.getAttribute('aria-expanded')).toBe('true');
        expect(toggleFor(muya, 'Empty child')).toBeNull();
        expect(toggleFor(muya, 'Last')).toBeNull();
    });

    it('collapses through the next same-or-higher heading without changing Markdown', () => {
        const muya = bootMuya(markdown);
        const before = muya.getMarkdown();

        clickToggle(muya, 'Alpha');

        expect(headingByText(muya, 'Alpha').textContent).toContain('Alpha');
        expect(isSectionHidden(topLevelBlock(muya, 1))).toBe(true);
        expect(isSectionHidden(topLevelBlock(muya, 2))).toBe(true);
        expect(isSectionHidden(topLevelBlock(muya, 3))).toBe(true);
        expect(isSectionHidden(topLevelBlock(muya, 4))).toBe(true);
        expect(isSectionHidden(topLevelBlock(muya, 5))).toBe(false);
        expect(muya.getMarkdown()).toBe(before);
        expect(muya.getTOC()).toHaveLength(5);
        expect(toggleFor(muya, 'Alpha')?.getAttribute('aria-expanded')).toBe('false');
    });

    it('restores the previous child collapse state when the parent expands', () => {
        const muya = bootMuya(markdown);

        clickToggle(muya, 'Beta');
        expect(isSectionHidden(topLevelBlock(muya, 3))).toBe(true);
        clickToggle(muya, 'Alpha');
        expect(isSectionHidden(topLevelBlock(muya, 2))).toBe(true);
        clickToggle(muya, 'Alpha');

        expect(isSectionHidden(topLevelBlock(muya, 2))).toBe(false);
        expect(isSectionHidden(topLevelBlock(muya, 3))).toBe(true);
        expect(toggleFor(muya, 'Beta')?.getAttribute('aria-expanded')).toBe('false');
        expect(toggleFor(muya, 'Alpha')?.getAttribute('aria-expanded')).toBe('true');
    });

    it('reveals only the ancestors blocking an explicitly activated target', () => {
        const muya = bootMuya(markdown);
        const betaSlug = muya.getTOC().find(item => item.content === 'Beta')!.slug;

        clickToggle(muya, 'Beta');
        clickToggle(muya, 'Alpha');

        expect(collapseApi(muya).revealHeadingTarget(betaSlug)).toBe(true);
        expect(isSectionHidden(topLevelBlock(muya, 1))).toBe(false);
        expect(isSectionHidden(topLevelBlock(muya, 3))).toBe(true);
        expect(toggleFor(muya, 'Alpha')?.getAttribute('aria-expanded')).toBe('true');
        expect(toggleFor(muya, 'Beta')?.getAttribute('aria-expanded')).toBe('false');

        expect(collapseApi(muya).revealBlockTarget(3)).toBe(true);
        expect(isSectionHidden(topLevelBlock(muya, 3))).toBe(false);
        expect(toggleFor(muya, 'Beta')?.getAttribute('aria-expanded')).toBe('true');
        expect(isSectionHidden(topLevelBlock(muya, 5))).toBe(false);
    });

    it('moves a caret that would be hidden to the collapsed heading end', () => {
        const muya = bootMuya(markdown);
        const alphaBody = topLevelBlock(muya, 1).firstContentInDescendant() as Content;
        alphaBody.setCursor(4, 4, true);

        clickToggle(muya, 'Alpha');

        const selection = muya.getSelection();
        expect(selection?.anchor.block.outMostBlock).toBe(topLevelBlock(muya, 0));
        expect(selection?.anchor.offset).toBe((topLevelBlock(muya, 0).firstContentInDescendant() as Content).text.length);
    });

    it('keeps a visible caret when collapsing an unrelated section', () => {
        const muya = bootMuya(markdown);
        const gammaBody = topLevelBlock(muya, 6).firstContentInDescendant() as Content;
        gammaBody.setCursor(3, 3, true);

        clickToggle(muya, 'Alpha');

        const selection = muya.getSelection();
        expect(selection?.anchor.block.outMostBlock).toBe(topLevelBlock(muya, 6));
        expect(selection?.anchor.offset).toBe(3);
    });

    it('does not interrupt an active IME composition', () => {
        const muya = bootMuya(markdown);
        const alphaBody = topLevelBlock(muya, 1).firstContentInDescendant() as Content;
        muya.editor.activeContentBlock = alphaBody;
        alphaBody.composeHandler(new Event('compositionstart'));

        clickToggle(muya, 'Alpha');
        expect(isSectionHidden(topLevelBlock(muya, 1))).toBe(false);

        vi.spyOn(alphaBody, 'inputHandler').mockImplementation(() => {});
        alphaBody.composeHandler(new Event('compositionend'));
        clickToggle(muya, 'Alpha');
        expect(isSectionHidden(topLevelBlock(muya, 1))).toBe(true);
    });

    it('supports setext headings with the same section rules', () => {
        const setext = 'Title\n=====\n\nBody.\n\nSub\n---\n\nSub body.\n';
        const muya = bootMuya(setext);

        expect(muya.domNode.querySelectorAll('.mu-heading-collapse-toggle:not([hidden])')).toHaveLength(2);
        clickToggle(muya, 'Title');
        expect(isSectionHidden(topLevelBlock(muya, 1))).toBe(true);
        expect(isSectionHidden(topLevelBlock(muya, 2))).toBe(true);
        expect(isSectionHidden(topLevelBlock(muya, 3))).toBe(true);
    });

    it('disambiguates duplicate heading keys by document order', () => {
        const duplicate = '# Foo\n\nfirst.\n\n# Foo\n\nsecond.\n';
        const muya = bootMuya(duplicate);

        expect(collapseApi(muya).getHeadingCollapseState()).toEqual([
            expect.objectContaining({ key: 'foo', collapsed: false }),
            expect.objectContaining({ key: 'foo-1', collapsed: false }),
        ]);
        const secondHeading = muya.domNode.querySelectorAll('.mu-container > h1')[1] as HTMLElement;
        secondHeading.querySelector<HTMLElement>('.mu-heading-collapse-toggle')!
            .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(isSectionHidden(topLevelBlock(muya, 1))).toBe(false);
        expect(isSectionHidden(topLevelBlock(muya, 3))).toBe(true);
        expect(collapseApi(muya).getHeadingCollapseState()).toEqual([
            expect.objectContaining({ key: 'foo', collapsed: false }),
            expect.objectContaining({ key: 'foo-1', collapsed: true }),
        ]);
    });

    it('restores keyed collapse state after a block-tree rebuild', () => {
        const muya = bootMuya(markdown);
        clickToggle(muya, 'Beta');
        const state = collapseApi(muya).getHeadingCollapseState();
        expect(state).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ key: 'beta', collapsed: true }),
            ]),
        );

        // Source-mode return and tab activation rebuild block objects; the
        // stable heading key, not the old object identity, must restore state.
        muya.setContent(markdown);
        collapseApi(muya).setHeadingCollapseState(state);

        expect(isSectionHidden(topLevelBlock(muya, 3))).toBe(true);
        expect(toggleFor(muya, 'Beta')?.getAttribute('aria-expanded')).toBe('false');
        expect(isSectionHidden(topLevelBlock(muya, 1))).toBe(false);
    });

    it('keeps long-document collapse virtualized and preserves full Markdown', async () => {
        const bulk = Array.from({ length: 260 }, (_, index) => `bulk paragraph ${index}`).join('\n\n');
        const longMarkdown = `# Alpha\n\n${bulk}\n\n## Beta\n\nBeta body.\n`;
        const muya = bootMuya(longMarkdown, { virtualizeLargeDocuments: true });
        await muya.whenRenderComplete();
        const scrollPage = muya.editor.scrollPage as ScrollPage;
        const before = muya.getMarkdown();
        const mountedBefore = scrollPage.getVirtualizationSnapshot().mountedBlocks;

        clickToggle(muya, 'Alpha');

        expect(scrollPage.isWindowed()).toBe(true);
        expect(scrollPage.getVirtualizationSnapshot().mountedBlocks).toBeLessThan(mountedBefore);
        expect(muya.getMarkdown()).toBe(before);
        expect(muya.getMarkdown()).toContain('bulk paragraph 259');
        expect(muya.getMarkdown()).toContain('Beta body.');
        expect(muya.domNode.textContent).not.toContain('bulk paragraph 259');
        expect(collapseApi(muya).getHeadingCollapseState()).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ key: 'alpha', level: 1, collapsed: true }),
                expect.objectContaining({ key: 'beta', level: 2, collapsed: false }),
            ]),
        );
    });
});
