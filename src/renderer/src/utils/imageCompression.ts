const MAX_DIMENSION = 1568
const JPEG_QUALITY = 0.85
const SKIP_THRESHOLD_BYTES = 200 * 1024 // 200KB

export type CompressionResult = {
  base64: string
  mediaType: string
  compressed: boolean
  originalBytes: number
  compressedBytes: number
}

export async function compressImage(base64: string, mediaType: string): Promise<CompressionResult> {
  const originalBytes = Math.ceil(base64.length * 3 / 4)

  // Skip GIFs (would lose animation)
  if (mediaType === 'image/gif') {
    return { base64, mediaType, compressed: false, originalBytes, compressedBytes: originalBytes }
  }

  // Load image to check dimensions
  const img = await loadImage(base64, mediaType)

  const needsResize = img.width > MAX_DIMENSION || img.height > MAX_DIMENSION
  const needsCompress = originalBytes > SKIP_THRESHOLD_BYTES

  if (!needsResize && !needsCompress) {
    return { base64, mediaType, compressed: false, originalBytes, compressedBytes: originalBytes }
  }

  // Compute target dimensions
  let targetW = img.width
  let targetH = img.height
  if (needsResize) {
    const scale = MAX_DIMENSION / Math.max(img.width, img.height)
    targetW = Math.round(img.width * scale)
    targetH = Math.round(img.height * scale)
  }

  // Draw to canvas and compress
  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, targetW, targetH)

  // Use JPEG for best compression (except PNGs with transparency — keep PNG)
  const outputType = mediaType === 'image/png' ? 'image/png' : 'image/jpeg'
  const quality = outputType === 'image/jpeg' ? JPEG_QUALITY : undefined
  const dataUrl = canvas.toDataURL(outputType, quality)
  const compressedBase64 = dataUrl.split(',')[1]
  const compressedBytes = Math.ceil(compressedBase64.length * 3 / 4)

  // If compression made it larger (unlikely but possible for small PNGs), return original
  if (compressedBytes >= originalBytes) {
    return { base64, mediaType, compressed: false, originalBytes, compressedBytes: originalBytes }
  }

  return {
    base64: compressedBase64,
    mediaType: outputType,
    compressed: true,
    originalBytes,
    compressedBytes
  }
}

function loadImage(base64: string, mediaType: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = `data:${mediaType};base64,${base64}`
  })
}
