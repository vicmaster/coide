import React, { useState, useEffect, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getSingletonHighlighter, createJavaScriptRegexEngine } from 'shiki'
import type { HighlighterGeneric } from 'shiki'
import { useFilePreviewStore } from '../store/filePreview'
import { useSettingsStore } from '../store/settings'

const THEME = 'github-dark-dimmed'

// Load only the most common languages initially (~1 MB vs ~3.8 MB)
const INITIAL_LANGS = ['typescript', 'javascript', 'tsx', 'jsx', 'json', 'bash', 'markdown', 'text', 'diff']
const DEFERRED_LANGS = ['python', 'sh', 'shell', 'jsonc', 'yaml', 'toml', 'css', 'html', 'rust', 'go', 'java', 'c', 'cpp', 'sql', 'regex']
const ALL_LANGS = [...INITIAL_LANGS, ...DEFERRED_LANGS]
const deferredSet = new Set(DEFERRED_LANGS)

// Pre-warm with initial languages only
const highlighterPromise = getSingletonHighlighter({
  themes: [THEME],
  langs: INITIAL_LANGS,
  engine: createJavaScriptRegexEngine()
})

// Load deferred languages on first use
const loadedLangs = new Set(INITIAL_LANGS)
async function ensureLang(highlighter: HighlighterGeneric<string, string>, lang: string): Promise<void> {
  if (loadedLangs.has(lang)) return
  if (deferredSet.has(lang)) {
    await highlighter.loadLanguage(lang as Parameters<typeof highlighter.loadLanguage>[0])
    loadedLangs.add(lang)
  }
}

const CodeBlock = React.memo(function CodeBlock({ language, code, compact }: { language: string; code: string; compact?: boolean }): React.JSX.Element {
  const [html, setHtml] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const lang = ALL_LANGS.includes(language) ? language : 'text'
    highlighterPromise.then(async (h) => {
      await ensureLang(h, lang)
      setHtml(
        h.codeToHtml(code, {
          lang,
          theme: THEME,
          colorReplacements: { '#22272e': 'transparent' }
        })
      )
    })
  }, [code, language])

  const handleCopy = (): void => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={`${compact ? 'my-1.5' : 'my-3'} rounded-lg overflow-hidden border border-white/[0.08] bg-[#1a1f27]`}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.03] border-b border-white/[0.06]">
        <span className="text-[10px] text-white/25 font-mono">{language || 'code'}</span>
        <button
          onClick={handleCopy}
          className="text-[10px] text-white/30 hover:text-white/60 transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      {html ? (
        <div
          className={`[&>pre]:overflow-x-auto [&>pre]:text-[13px] [&>pre]:leading-relaxed [&>pre]:m-0 [&_code]:bg-transparent [&_code]:p-0 ${compact ? '[&>pre]:p-2' : '[&>pre]:p-4'}`}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className={`${compact ? 'p-2' : 'p-4'} overflow-x-auto text-[13px] leading-relaxed m-0`}>
          <code className="text-white/60 font-mono">{code}</code>
        </pre>
      )}
    </div>
  )
})

const remarkPlugins = [remarkGfm]

// Matches file paths: must contain /, end with .ext, no spaces
const FILE_PATH_RE = /^\.{0,2}\/\S+\.\w+$/

function isFilePath(text: string): boolean {
  return FILE_PATH_RE.test(text)
}

function MarkdownRendererInner({ children }: { children: string }): React.JSX.Element {
  const compact = useSettingsStore((s) => s.compactMode)

  const components = useMemo(() => ({
    pre({ children }: { children: React.ReactNode }) {
      return <>{children}</>
    },
    code({ className, children, ...props }: { className?: string; children: React.ReactNode }) {
      const match = /language-(\w+)/.exec(className || '')
      const code = String(children).replace(/\n$/, '')
      const isBlock = !!className || code.includes('\n')

      if (!isBlock) {
        const text = String(children)
        if (isFilePath(text)) {
          return (
            <code
              className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[0.85em] font-mono text-blue-400/70 hover:text-blue-400 cursor-pointer transition-colors"
              onClick={() => useFilePreviewStore.getState().open(text)}
              {...props}
            >
              {children}
            </code>
          )
        }
        return (
          <code className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[0.85em] font-mono text-white/80" {...props}>
            {children}
          </code>
        )
      }

      return <CodeBlock language={match?.[1] ?? ''} code={code} compact={compact} />
    },
    h1({ children }: { children: React.ReactNode }) {
      return <h1 className={`text-xl font-bold text-white/90 first:mt-0 ${compact ? 'mt-3 mb-1' : 'mt-5 mb-2'}`}>{children}</h1>
    },
    h2({ children }: { children: React.ReactNode }) {
      return <h2 className={`text-base font-semibold text-white/85 first:mt-0 ${compact ? 'mt-2 mb-1' : 'mt-4 mb-2'}`}>{children}</h2>
    },
    h3({ children }: { children: React.ReactNode }) {
      return <h3 className={`text-sm font-semibold text-white/80 first:mt-0 ${compact ? 'mt-1.5 mb-0.5' : 'mt-3 mb-1'}`}>{children}</h3>
    },
    p({ children }: { children: React.ReactNode }) {
      return <p className={`last:mb-0 leading-relaxed ${compact ? 'mb-1.5' : 'mb-3'}`}>{children}</p>
    },
    strong({ children }: { children: React.ReactNode }) {
      return <strong className="font-semibold text-white/95">{children}</strong>
    },
    em({ children }: { children: React.ReactNode }) {
      return <em className="italic text-white/70">{children}</em>
    },
    ul({ children }: { children: React.ReactNode }) {
      return <ul className={`ml-4 list-disc last:mb-0 ${compact ? 'mb-1.5 space-y-0.5' : 'mb-3 space-y-1'}`}>{children}</ul>
    },
    ol({ children }: { children: React.ReactNode }) {
      return <ol className={`ml-4 list-decimal last:mb-0 ${compact ? 'mb-1.5 space-y-0.5' : 'mb-3 space-y-1'}`}>{children}</ol>
    },
    li({ children }: { children: React.ReactNode }) {
      return <li className="text-white/80 leading-relaxed">{children}</li>
    },
    blockquote({ children }: { children: React.ReactNode }) {
      return <blockquote className={`border-l-2 border-white/15 pl-3 italic text-white/45 ${compact ? 'my-1.5' : 'my-3'}`}>{children}</blockquote>
    },
    a({ href, children }: { href?: string; children: React.ReactNode }) {
      return <a href={href} className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors" target="_blank" rel="noreferrer">{children}</a>
    },
    hr() { return <hr className="border-white/10 my-4" /> },
    table({ children }: { children: React.ReactNode }) {
      return <div className="my-3 overflow-x-auto"><table className="w-full text-sm border-collapse">{children}</table></div>
    },
    thead({ children }: { children: React.ReactNode }) {
      return <thead className="border-b border-white/10">{children}</thead>
    },
    th({ children }: { children: React.ReactNode }) {
      return <th className="text-left py-1.5 px-3 text-white/55 font-medium text-xs uppercase tracking-wide">{children}</th>
    },
    td({ children }: { children: React.ReactNode }) {
      return <td className="py-1.5 px-3 border-b border-white/[0.05] text-white/70">{children}</td>
    }
  }), [compact])

  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
      {children}
    </ReactMarkdown>
  )
}

const MarkdownRenderer = React.memo(MarkdownRendererInner)
export default MarkdownRenderer
