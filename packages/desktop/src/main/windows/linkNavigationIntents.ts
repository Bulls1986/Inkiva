/** A delayed file open may never replay navigation over a newer explicit request. */
export interface LinkNavigationRequest {
  fragment: string
  sourceDocumentId?: string
  sourceRevision?: number
  sourceInteractionRevision?: number
}

export class LinkNavigationIntents {
  private sequence = 0
  private readonly byPath = new Map<string, LinkNavigationRequest & { sequence: number }>()

  request(
    pathKey: string,
    fragment: string,
    source?: { documentId?: string; revision?: number; interactionRevision?: number }
  ): void {
    this.byPath.set(pathKey, {
      sequence: ++this.sequence,
      fragment,
      sourceDocumentId: source?.documentId,
      sourceRevision: source?.revision,
      sourceInteractionRevision: source?.interactionRevision
    })
  }

  supersede(): void {
    this.sequence += 1
  }

  consumeRequest(pathKey: string): LinkNavigationRequest | null {
    const request = this.byPath.get(pathKey)
    this.byPath.delete(pathKey)
    if (!request || request.sequence !== this.sequence) return null
    return {
      fragment: request.fragment,
      ...(request.sourceDocumentId !== undefined ? { sourceDocumentId: request.sourceDocumentId } : {}),
      ...(request.sourceRevision !== undefined ? { sourceRevision: request.sourceRevision } : {}),
      ...(request.sourceInteractionRevision !== undefined
        ? { sourceInteractionRevision: request.sourceInteractionRevision } : {})
    }
  }

  consume(pathKey: string): string | null {
    return this.consumeRequest(pathKey)?.fragment ?? null
  }

  discard(pathKey: string): void {
    this.byPath.delete(pathKey)
  }

  clear(): void {
    this.byPath.clear()
    this.sequence += 1
  }
}
