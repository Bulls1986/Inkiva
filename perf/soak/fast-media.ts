export interface FastOffscreenImageState {
  top: number
  lazy: string | null
  loadStarted: string | null
  hasImage: boolean
  complete: boolean
  naturalWidth: number
}

export const selectFastOffscreenImage = (
  images: readonly FastOffscreenImageState[],
  viewportHeight: number
): FastOffscreenImageState => {
  const image = images.find((candidate) => candidate.top > viewportHeight)
  if (!image) {
    throw new Error('fast diagram gate produced no measurable offscreen image')
  }
  return image
}

export const evaluateFastOffscreenImage = (
  image: FastOffscreenImageState
): { request: number; decode: number } => {
  const isPending = image.lazy === 'pending'
  return {
    request: isPending && image.loadStarted === null ? 0 : 1,
    decode: isPending && !image.hasImage && !image.complete && image.naturalWidth <= 0 ? 0 : 1
  }
}
