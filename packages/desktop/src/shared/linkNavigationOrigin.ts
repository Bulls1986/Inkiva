/** Deliberate navigation may activate a tab only while its source intent is current. */
export const isLinkNavigationOriginCurrent = (
  expected: { documentId: string; revision: number; interactionRevision?: number } | null,
  active: { documentId: string; revision: number; interactionRevision?: number } | null
): boolean =>
  expected === null ||
  (active !== null &&
    expected.documentId === active.documentId &&
    expected.revision === active.revision &&
    (expected.interactionRevision === undefined ||
      expected.interactionRevision === active.interactionRevision))
