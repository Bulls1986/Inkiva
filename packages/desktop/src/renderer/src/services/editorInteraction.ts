let editorScrollRevision = 0

export const markEditorScrollInteraction = (): void => {
  editorScrollRevision =
    editorScrollRevision >= Number.MAX_SAFE_INTEGER ? 1 : editorScrollRevision + 1
}

export const getEditorScrollInteractionRevision = (): number => editorScrollRevision
