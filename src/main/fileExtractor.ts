/**
 * File text extraction — reads content from various file types for injection into Claude prompts
 */
import { readFile, stat, copyFile, mkdir } from 'fs/promises'
import { join, extname, basename } from 'path'
import { tmpdir } from 'os'

// Lazy-load heavy deps to avoid startup crashes (pdf-parse needs DOMMatrix polyfill)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lazy = <T>(mod: string): (() => T) => {
  let cached: T | undefined
  return () => (cached ??= (eval('require') as NodeRequire)(mod) as T)
}
const getPdfParse = lazy<{ PDFParse: any }>('pdf-parse')
const getMammoth = lazy<any>('mammoth')
const getXLSX = lazy<any>('xlsx')

const FILES_DIR = join(tmpdir(), 'coide-files')
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const MAX_TEXT_LENGTH = 500_000 // 500K chars

// Text-based file extensions that can be read as UTF-8
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.yaml', '.yml', '.xml', '.html', '.htm',
  '.csv', '.tsv', '.log', '.env', '.toml', '.ini', '.cfg',
  '.sh', '.bash', '.zsh', '.fish',
  '.py', '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
  '.rb', '.go', '.rs', '.java', '.kt', '.swift',
  '.c', '.cpp', '.h', '.hpp', '.cs',
  '.css', '.scss', '.less', '.sass',
  '.sql', '.graphql', '.gql',
  '.r', '.R', '.lua', '.pl', '.php',
  '.dockerfile', '.makefile', '.gitignore',
  '.tf', '.hcl', '.proto',
  '.mdx', '.rst', '.tex', '.bib'
])

// Document extensions that need special extraction
const DOCUMENT_EXTENSIONS: Record<string, string> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.xlsx': 'xlsx',
  '.xls': 'xls',
  '.pptx': 'pptx'
}

// Image extensions (handled separately, not extracted)
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico'])

export type FileResult = {
  id: string
  name: string
  path: string
  size: number
  category: 'image' | 'document' | 'text'
  extractedText?: string
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + `\n\n[... truncated at ${maxLen.toLocaleString()} characters]`
}

async function extractPdf(filePath: string): Promise<string> {
  const buffer = await readFile(filePath)
  const { PDFParse } = getPdfParse()
  const parser = new PDFParse({ data: buffer })
  await parser.load()
  const result = await parser.getText()
  // v2 returns { pages: [{ text }] }
  if (result?.pages) {
    return result.pages.map((p: { text: string }) => p.text).join('\n\n')
  }
  return ''
}

async function extractDocx(filePath: string): Promise<string> {
  const result = await getMammoth().extractRawText({ path: filePath })
  return result.value || ''
}

async function extractSpreadsheet(filePath: string): Promise<string> {
  const XLSX = getXLSX()
  const workbook = XLSX.readFile(filePath)
  const parts: string[] = []
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const csv = XLSX.utils.sheet_to_csv(sheet)
    if (workbook.SheetNames.length > 1) {
      parts.push(`--- Sheet: ${sheetName} ---\n${csv}`)
    } else {
      parts.push(csv)
    }
  }
  return parts.join('\n\n')
}

async function extractPptx(filePath: string): Promise<string> {
  // PPTX files are ZIP archives containing XML
  // Use xlsx's ZIP reader to extract text from slide XML files
  try {
    const JSZip = (eval('require') as NodeRequire)('jszip') as any
    const buffer = await readFile(filePath)
    const zip = await JSZip.loadAsync(buffer)
    const parts: string[] = []

    // Get slide files in order
    const slideFiles = Object.keys(zip.files)
      .filter((f: string) => f.match(/^ppt\/slides\/slide\d+\.xml$/))
      .sort()

    for (const slideFile of slideFiles) {
      const xml = await zip.files[slideFile].async('string')
      // Extract text content from XML tags like <a:t>text</a:t>
      const texts: string[] = []
      const matches = xml.matchAll(/<a:t>(.*?)<\/a:t>/g)
      for (const match of matches) {
        if (match[1].trim()) texts.push(match[1])
      }
      if (texts.length > 0) {
        const slideNum = slideFile.match(/slide(\d+)/)?.[1]
        parts.push(`--- Slide ${slideNum} ---\n${texts.join(' ')}`)
      }
    }
    return parts.join('\n\n')
  } catch {
    return '[Could not extract PPTX text — jszip not available]'
  }
}

export async function processFile(filePath: string): Promise<FileResult> {
  const ext = extname(filePath).toLowerCase()
  const name = basename(filePath)

  // Check file size
  const stats = await stat(filePath)
  if (stats.size > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${name} (${(stats.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.`)
  }

  // Copy to temp directory
  await mkdir(FILES_DIR, { recursive: true })
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const tempPath = join(FILES_DIR, `${id}-${name}`)
  await copyFile(filePath, tempPath)

  // Images — return without text extraction
  if (IMAGE_EXTENSIONS.has(ext)) {
    return { id, name, path: tempPath, size: stats.size, category: 'image' }
  }

  // Text files — read directly
  if (TEXT_EXTENSIONS.has(ext) || ext === '' || name.startsWith('.')) {
    const content = await readFile(filePath, 'utf-8')
    return {
      id, name, path: tempPath, size: stats.size, category: 'text',
      extractedText: truncateText(content, MAX_TEXT_LENGTH)
    }
  }

  // Document extraction
  const docType = DOCUMENT_EXTENSIONS[ext]
  if (docType) {
    let extractedText = ''
    try {
      switch (docType) {
        case 'pdf':
          extractedText = await extractPdf(filePath)
          break
        case 'docx':
          extractedText = await extractDocx(filePath)
          break
        case 'xlsx':
        case 'xls':
          extractedText = await extractSpreadsheet(filePath)
          break
        case 'pptx':
          extractedText = await extractPptx(filePath)
          break
      }
    } catch (err) {
      throw new Error(`Failed to extract text from ${name}: ${err}`)
    }

    if (!extractedText.trim()) {
      throw new Error(`No text content found in ${name}`)
    }

    return {
      id, name, path: tempPath, size: stats.size, category: 'document',
      extractedText: truncateText(extractedText, MAX_TEXT_LENGTH)
    }
  }

  // Legacy Office formats
  if (['.doc', '.ppt', '.xls'].includes(ext) && !DOCUMENT_EXTENSIONS[ext]) {
    throw new Error(`Legacy Office format (${ext}) is not supported. Please convert to ${ext}x format.`)
  }

  // Unknown format — try reading as text
  try {
    const content = await readFile(filePath, 'utf-8')
    // Check if it looks like binary (lots of null bytes)
    if (content.includes('\0')) {
      throw new Error(`Unsupported file type: ${ext}`)
    }
    return {
      id, name, path: tempPath, size: stats.size, category: 'text',
      extractedText: truncateText(content, MAX_TEXT_LENGTH)
    }
  } catch (err) {
    if ((err as Error).message.startsWith('Unsupported')) throw err
    throw new Error(`Unsupported file type: ${ext || name}`)
  }
}

export { FILES_DIR }
