/**
 * Diagram languages that MarkText can render as a live Diagram Block.
 *
 * Keep this list shared by markdown import, paragraph conversion, the
 * language picker, and language-input edits. An ordinary fenced code block
 * must remain ordinary until its language is explicitly changed to one of
 * these values.
 */
export const DIAGRAM_LANGUAGES = [
    'mermaid',
    'plantuml',
    'vega-lite',
    'flowchart',
    'sequence',
] as const;

export type DiagramType = typeof DIAGRAM_LANGUAGES[number];

export function getDiagramType(language: string): DiagramType | null {
    return (DIAGRAM_LANGUAGES as readonly string[]).includes(language)
        ? language as DiagramType
        : null;
}
