import { MUYA_DEFAULT_OPTIONS } from '../config';
import { MarkdownToState } from './markdownToState';
import StateToMarkdown from './stateToMarkdown';

export interface IMarkdownWysiwygSafetyOptions {
    footnote: boolean;
    frontMatter: boolean;
    isGitlabCompatibilityEnabled: boolean;
    listIndentation: number | string;
    math: boolean;
    trimUnnecessaryCodeBlockEmptyLines: boolean;
}

const normalizeTerminalNewlines = (markdown: string): string => markdown.replace(/\n+$/u, '');

interface IFenceState {
    marker: '`' | '~';
    length: number;
}

function countLeadingSpaces(line: string): number {
    let count = 0;
    while (count < line.length && line[count] === ' ')
        count += 1;
    return count;
}

function readOpeningFence(line: string): IFenceState | null {
    const indentation = countLeadingSpaces(line);
    if (indentation > 3)
        return null;

    const marker = line[indentation];
    if (marker !== '`' && marker !== '~')
        return null;

    let end = indentation;
    while (line[end] === marker)
        end += 1;

    const length = end - indentation;
    return length >= 3 ? { marker, length } : null;
}

function isClosingFence(line: string, openFence: IFenceState): boolean {
    const indentation = countLeadingSpaces(line);
    if (indentation > 3)
        return false;

    let end = indentation;
    while (line[end] === openFence.marker)
        end += 1;

    if (end - indentation < openFence.length)
        return false;

    for (let index = end; index < line.length; index += 1) {
        const char = line[index];
        if (char !== ' ' && char !== '\t')
            return false;
    }
    return true;
}

function hasUnterminatedFence(markdown: string): boolean {
    let openFence: IFenceState | null = null;

    for (const line of markdown.split('\n')) {
        if (!openFence) {
            openFence = readOpeningFence(line);
            continue;
        }

        if (isClosingFence(line, openFence))
            openFence = null;
    }

    return openFence !== null;
}

/**
 * Returns true only when Muya can parse and serialize the current Source snapshot
 * without changing its meaningful Markdown bytes. Source mode remains the
 * authority when the WYSIWYG model would normalize or synthesize structure
 * (for example an unfinished fenced block).
 */
export function isMarkdownWysiwygRoundTripSafe(
    markdown: string,
    overrides: Partial<IMarkdownWysiwygSafetyOptions> = {},
): boolean {
    if (hasUnterminatedFence(markdown))
        return false;

    const options: IMarkdownWysiwygSafetyOptions = {
        footnote: MUYA_DEFAULT_OPTIONS.footnote,
        frontMatter: MUYA_DEFAULT_OPTIONS.frontMatter,
        isGitlabCompatibilityEnabled: MUYA_DEFAULT_OPTIONS.isGitlabCompatibilityEnabled,
        listIndentation: MUYA_DEFAULT_OPTIONS.listIndentation,
        math: MUYA_DEFAULT_OPTIONS.math,
        trimUnnecessaryCodeBlockEmptyLines:
      MUYA_DEFAULT_OPTIONS.trimUnnecessaryCodeBlockEmptyLines,
        ...overrides,
    };

    try {
        const state = new MarkdownToState({
            footnote: options.footnote,
            frontMatter: options.frontMatter,
            isGitlabCompatibilityEnabled: options.isGitlabCompatibilityEnabled,
            math: options.math,
            trimUnnecessaryCodeBlockEmptyLines: options.trimUnnecessaryCodeBlockEmptyLines,
        }).generate(markdown);
        const serialized = new StateToMarkdown({
            listIndentation: options.listIndentation,
        }).generate(state);

        // EOF-newline count belongs to the desktop document metadata contract and
        // is preserved separately from Muya's structural state. Ignore only that
        // suffix here; every other byte must round-trip unchanged.
        return normalizeTerminalNewlines(serialized) === normalizeTerminalNewlines(markdown);
    }
    catch {
        return false;
    }
}
