/**
 * Convert an image data URL to a File without going through fetch().
 *
 * Electron renderer CSP/network policies can reject fetch(data:...), even
 * though the data URL itself is valid and can be rendered by an <img>. Decode
 * the payload locally so clipboard images can be sent to the main-process
 * uploader as binary data.
 */
export const dataUrlToFile = (dataUrl: string): File => {
  const match = /^data:([^,]*),([\s\S]*)$/i.exec(dataUrl)
  if (!match) throw new Error('Cannot decode pasted image: invalid data URL.')

  const metadata = match[1].trim()
  const payload = match[2]
  const parts = metadata.split(';')
  const type = parts.shift()?.trim() || 'image/png'
  if (!/^image\//i.test(type)) {
    throw new Error('Cannot decode pasted image: unsupported MIME type.')
  }

  const isBase64 = parts.some((part) => part.trim().toLowerCase() === 'base64')
  let bytes: Uint8Array

  if (isBase64) {
    const normalizedPayload = payload.replace(/\s/g, '')
    if (!normalizedPayload) throw new Error('Cannot decode pasted image: empty data.')

    try {
      const binary = atob(normalizedPayload)
      bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    } catch {
      throw new Error('Cannot decode pasted image: invalid base64 data.')
    }
  } else {
    try {
      bytes = new TextEncoder().encode(decodeURIComponent(payload))
    } catch {
      throw new Error('Cannot decode pasted image: invalid encoded data.')
    }
  }

  const subtype = type
    .slice('image/'.length)
    .split(/[+;]/)[0]
    .replace(/[^a-z0-9-]/gi, '') || 'png'
  // Copy into a plain ArrayBuffer. TypeScript 6 distinguishes
  // ArrayBufferLike-backed views from the BlobPart ArrayBuffer shape, while
  // the runtime value is still the same binary image data.
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return new File([buffer], `pasted-image.${subtype}`, { type })
}
