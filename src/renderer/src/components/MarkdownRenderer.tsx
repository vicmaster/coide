import React, { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getSingletonHighlighter, createJavaScriptRegexEngine } from 'shiki'

const THEME = 'github-dark-dimmed'
const LANGS = [
  'typescript', 'javascript', 'tsx', 'jsx',
  'python', 'bash', 'sh', 'shell',
  'json', 'jsonc', 'yaml', 'toml',
  'css', 'html', 'markdown',
  'rust', 'go', 'java', 'c', 'cpp',
  'sql', 'regex', 'diff', 'text'
]

// Pre-warm once at module load — no WASM, pure JS regex engine
const highlighterPromise = getSingletonHighlighter({
  themes: [THEME],
  langs: LANGS,
  engine: createJavaScriptRegexEngine()
})

function CodeBlock({ language, code }: { language: string; code: string }): React.JSX.Element {
  const [html, setHtml] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const lang = LANGS.includes(language) ? language : 'text'
    highlighterPromise.then((h) => {
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
    <div className="my-3 rounded-lg overflow-hidden border border-white/[0.08] bg-[#1a1f27]">
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
          className="[&>pre]:p-4 [&>pre]:overflow-x-auto [&>pre]:text-[13px] [&>pre]:leading-relaxed [&>pre]:m-0 [&_code]:bg-transparent [&_code]:p-0"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="p-4 overflow-x-auto text-[13px] leading-relaxed m-0">
          <code className="text-white/60 font-mono">{code}</code>
        </pre>
      )}
    </div>
  )
}

export default function MarkdownRenderer({ children }: { children: string }): React.JSX.Element {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Block code — delegate entirely to CodeBlock
        pre({ children }) {
          return <>{children}</>
        },
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '')
          const code = String(children).replace(/\n$/, '')
          const isBlock = !!className || code.includes('\n')

          if (!isBlock) {
            return (
              <code
                className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[0.85em] font-mono text-white/80"
                {...props}
              >
                {children}
              </code>
            )
          }

          return <CodeBlock language={match?.[1] ?? ''} code={code} />
        },

        // Headings
        h1({ children }) {
          return <h1 className="text-xl font-bold text-white/90 mt-5 mb-2 first:mt-0">{children}</h1>
        },
        h2({ children }) {
          return <h2 className="text-base font-semibold text-white/85 mt-4 mb-2 first:mt-0">{children}</h2>
        },
        h3({ children }) {
          return <h3 className="text-sm font-semibold text-white/80 mt-3 mb-1 first:mt-0">{children}</h3>
        },

        // Paragraphs & text
        p({ children }) {
          return <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>
        },
        strong({ children }) {
          return <strong className="font-semibold text-white/95">{children}</strong>
        },
        em({ children }) {
          return <em className="italic text-white/70">{children}</em>
        },

        // Lists
        ul({ children }) {
          return <ul className="mb-3 ml-4 list-disc space-y-1 last:mb-0">{children}</ul>
        },
        ol({ children }) {
          return <ol className="mb-3 ml-4 list-decimal space-y-1 last:mb-0">{children}</ol>
        },
        li({ children }) {
          return <li className="text-white/80 leading-relaxed">{children}</li>
        },

        // Blockquote
        blockquote({ children }) {
          return (
            <blockquote className="border-l-2 border-white/15 pl-3 my-3 italic text-white/45">
              {children}
            </blockquote>
          )
        },

        // Links
        a({ href, children }) {
          return (
            <a
              href={href}
              className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
              target="_blank"
              rel="noreferrer"
            >
              {children}
            </a>
          )
        },

        // Horizontal rule
        hr() {
          return <hr className="border-white/10 my-4" />
        },

        // Tables (remark-gfm)
        table({ children }) {
          return (
            <div className="my-3 overflow-x-auto">
              <table className="w-full text-sm border-collapse">{children}</table>
            </div>
          )
        },
        thead({ children }) {
          return <thead className="border-b border-white/10">{children}</thead>
        },
        th({ children }) {
          return (
            <th className="text-left py-1.5 px-3 text-white/55 font-medium text-xs uppercase tracking-wide">
              {children}
            </th>
          )
        },
        td({ children }) {
          return (
            <td className="py-1.5 px-3 border-b border-white/[0.05] text-white/70">
              {children}
            </td>
          )
        }
      }}
    >
      {children}
    </ReactMarkdown>
  )
}
