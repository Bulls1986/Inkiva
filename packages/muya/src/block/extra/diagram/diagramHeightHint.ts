export interface IDiagramHeightHintCache {
    get: (key: string) => number | undefined;
    set: (key: string, height: number) => void;
}

// Reserve the same conservative height used by ScrollPage's progressive
// document estimate until the first diagram result is available. Without a
// baseline, every diagram starts as a one-line loading label; when the SVG
// arrives it can push later images into the viewport after their lazy-load
// decision has already been made.
export const DEFAULT_DIAGRAM_HEIGHT_HINT = 192;

export function createDiagramHeightHintCache(limit = 128): IDiagramHeightHintCache {
    const hints = new Map<string, number>();
    const maxEntries = Number.isInteger(limit) && limit > 0 ? limit : 128;

    return {
        get: (key: string) => hints.get(key),
        set: (key: string, height: number) => {
            if (!key || !Number.isFinite(height) || height <= 0)
                return;

            if (hints.has(key))
                hints.delete(key);
            hints.set(key, height);

            while (hints.size > maxEntries) {
                const oldest = hints.keys().next().value;
                if (typeof oldest !== 'string')
                    break;
                hints.delete(oldest);
            }
        },
    };
}

const diagramHeightHints = createDiagramHeightHintCache();

export function diagramHeightHintKey(type: string, code: string): string {
    return `${type}\u0000${code}`;
}

export function getDiagramHeightHint(type: string, code: string): number | undefined {
    if (!code)
        return undefined;

    return diagramHeightHints.get(diagramHeightHintKey(type, code))
        ?? DEFAULT_DIAGRAM_HEIGHT_HINT;
}

export function rememberDiagramHeight(type: string, code: string, height: number): void {
    diagramHeightHints.set(diagramHeightHintKey(type, code), height);
}
