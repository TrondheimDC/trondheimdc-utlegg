// iPhone photos are HEIC. Safari decodes them, Chrome and Firefox don't, and the crop
// dialog and the PDF both need an image the browser can draw. So HEIC becomes JPEG on upload.

const HEIC_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
])

/** By type or, when the OS gives no type (Windows), by extension. */
export function isHeicFile(file: File): boolean {
  return (
    HEIC_TYPES.has(file.type.toLowerCase()) || /\.hei[cf]$/i.test(file.name)
  )
}

function jpegName(name: string): string {
  return `${name.replace(/\.hei[cf]$/i, "") || "kvittering"}.jpg`
}

/** Decodes with the browser where it can (Safari). */
async function nativeToJpeg(file: File): Promise<Blob | null> {
  if (typeof createImageBitmap !== "function") return null
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return null
  }
  const canvas = document.createElement("canvas")
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0)
  bitmap.close()
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9))
}

/** HEIC/HEIF -> JPEG. Throws when the image can't be decoded. */
export async function heicToJpeg(file: File): Promise<File> {
  let blob = await nativeToJpeg(file)
  if (!blob) {
    // libheif compiled to WebAssembly (~3 MB), so only loaded when needed.
    const { heicTo } = await import("heic-to/next")
    blob = await heicTo({ blob: file, type: "image/jpeg", quality: 0.9 })
  }
  return new File([blob], jpegName(file.name), {
    type: "image/jpeg",
    lastModified: file.lastModified,
  })
}
