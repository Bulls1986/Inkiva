import type { TContainerState, TState } from './types';
import { MUYA_DEFAULT_OPTIONS } from '../config';
import { MarkdownToState } from './markdownToState';
import { isCodeBlockState, isDiagramState } from './types';

export interface IMarkdownWysiwygSafetyOptions {
    footnote: boolean;
    frontMatter: boolean;
    isGitlabCompatibilityEnabled: boolean;
    math: boolean;
    trimUnnecessaryCodeBlockEmptyLines: boolean;
}

function isContainerState(state: TState): state is TContainerState {
    return 'children' in state;
}

function hasUnsafeIntermediateState(states: TState[]): boolean {
    for (const state of states) {
        if (
            isCodeBlockState(state)
            && state.meta.type === 'fenced'
            && state.meta.fenceClosed === false
        ) {
            return true;
        }

        if (isDiagramState(state) && state.meta.fenceClosed === false)
            return true;

        if (isContainerState(state) && hasUnsafeIntermediateState(state.children))
            return true;
    }

    return false;
}

/**
 * Returns true when Muya can build a WYSIWYG state without carrying an
 * explicitly incomplete structural construct.
 *
 * Source byte stability is a separate desktop handoff contract. A serializer
 * formatting difference is therefore not evidence that the source snapshot is
 * unsafe to view in WYSIWYG. The safety gate consumes semantic metadata
 * produced by Muya's parser instead of duplicating Markdown parsing rules in
 * the desktop layer.
 */
export function isMarkdownWysiwygTransitionSafe(
    markdown: string,
    overrides: Partial<IMarkdownWysiwygSafetyOptions> = {},
): boolean {
    const options: IMarkdownWysiwygSafetyOptions = {
        footnote: MUYA_DEFAULT_OPTIONS.footnote,
        frontMatter: MUYA_DEFAULT_OPTIONS.frontMatter,
        isGitlabCompatibilityEnabled: MUYA_DEFAULT_OPTIONS.isGitlabCompatibilityEnabled,
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

        return !hasUnsafeIntermediateState(state);
    }
    catch {
        return false;
    }
}
