import { describe, it, expect, beforeEach } from 'vitest'
import { ensurePdfGlobals } from '../../main/fileExtractor'

// pdf-parse v2 (pdfjs-dist) needs DOMMatrix/ImageData/Path2D globals to extract text.
// In dev these come from @napi-rs/canvas, but that native module is excluded from the
// packaged build — so without these stubs PDF extraction throws "DOMMatrix is not
// defined" in production only. These tests guard that regression.
describe('ensurePdfGlobals', () => {
  const g = globalThis as Record<string, unknown>

  beforeEach(() => {
    delete g.DOMMatrix
    delete g.ImageData
    delete g.Path2D
  })

  it('defines DOMMatrix, ImageData and Path2D when missing', () => {
    expect(g.DOMMatrix).toBeUndefined()
    ensurePdfGlobals()
    expect(typeof g.DOMMatrix).toBe('function')
    expect(typeof g.ImageData).toBe('function')
    expect(typeof g.Path2D).toBe('function')
  })

  it('produces a DOMMatrix with identity defaults', () => {
    ensurePdfGlobals()
    const Ctor = g.DOMMatrix as new () => Record<string, number>
    const m = new Ctor()
    expect(m).toMatchObject({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
  })

  it('produces an ImageData backed by a sized RGBA buffer', () => {
    ensurePdfGlobals()
    const Ctor = g.ImageData as new (w: number, h: number) => { data: Uint8ClampedArray }
    const img = new Ctor(2, 3)
    expect(img.data).toBeInstanceOf(Uint8ClampedArray)
    expect(img.data.length).toBe(2 * 3 * 4)
  })

  it('does not overwrite globals that already exist', () => {
    const sentinel = class CustomDOMMatrix {}
    g.DOMMatrix = sentinel
    ensurePdfGlobals()
    expect(g.DOMMatrix).toBe(sentinel)
  })
})
