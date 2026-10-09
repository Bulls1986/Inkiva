/** A delayed file open may never replay navigation over a newer explicit request. */
export class LinkNavigationIntents {
  private sequence = 0
  private readonly byPath = new Map<string, { sequence: number; fragment: string }>()

  request(pathKey: string, fragment: string): void {
    this.byPath.set(pathKey, { sequence: ++this.sequence, fragment })
  }

  supersede(): void {
    this.sequence += 1
  }

  consume(pathKey: string): string | null {
    const request = this.byPath.get(pathKey)
    this.byPath.delete(pathKey)
    return request?.sequence === this.sequence ? request.fragment : null
  }

  discard(pathKey: string): void {
    this.byPath.delete(pathKey)
  }

  clear(): void {
    this.byPath.clear()
    this.sequence += 1
  }
}
