let editorScrollRevision = 0

export const markEditorScrollInteraction = (): void => {
  editorScrollRevision =
    editorScrollRevision >= Number.MAX_SAFE_INTEGER ? 1 : editorScrollRevision + 1
}

export const getEditorScrollInteractionRevision = (): number => editorScrollRevision

// Explicit trusted editor gestures also fence cross-file navigation while a
// target is still loading. Do not use scroll events: layout restores can emit
// those without any user intent. Keep this hot-path counter nonreactive.
let editorUserInteractionRevision = 0
export const markExplicitEditorInteractionRevision = (): void => {
  editorUserInteractionRevision = editorUserInteractionRevision >= Number.MAX_SAFE_INTEGER
    ? 1
    : editorUserInteractionRevision + 1
}
export const getExplicitEditorInteractionRevision = (): number => editorUserInteractionRevision
