import React, { useState, useEffect, useRef } from 'react'
import { useSettingsStore } from '../store/settings'

type Step = 1 | 2 | 3
type CliStatus = 'checking' | 'found' | 'not-found'

export default function WelcomeModal(): React.JSX.Element | null {
  const onboardingComplete = useSettingsStore((s) => s.onboardingComplete)
  const [step, setStep] = useState<Step>(1)

  if (onboardingComplete) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-line-strong bg-surface-3 shadow-2xl overflow-hidden">
        {/* Step dots */}
        <div className="flex justify-center gap-2 pt-5 pb-2">
          {([1, 2, 3] as Step[]).map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                s === step ? 'w-6 bg-blue-500' : s < step ? 'w-1.5 bg-blue-500/40' : 'w-1.5 bg-overlay-3'
              }`}
            />
          ))}
        </div>

        <div className="p-6">
          {step === 1 && <StepCli onNext={() => setStep(2)} />}
          {step === 2 && <StepFolder onNext={() => setStep(3)} onBack={() => setStep(1)} />}
          {step === 3 && <StepTips />}
        </div>
      </div>
    </div>
  )
}

function StepCli({ onNext }: { onNext: () => void }): React.JSX.Element {
  const [status, setStatus] = useState<CliStatus>('checking')
  const [cliPath, setCliPath] = useState('')
  const [cliVersion, setCliVersion] = useState('')
  const [customPath, setCustomPath] = useState('')
  const [verifying, setVerifying] = useState(false)
  const advancedRef = useRef(false)

  const checkBinary = async (path?: string): Promise<void> => {
    setStatus('checking')
    try {
      const result = await window.api.claude.checkBinary(path)
      if (result.found) {
        setStatus('found')
        setCliPath(result.path)
        setCliVersion(result.version ?? '')
      } else {
        setStatus('not-found')
        setCliPath(result.path)
      }
    } catch {
      setStatus('not-found')
    }
  }

  useEffect(() => {
    checkBinary()
  }, [])

  // Auto-advance after CLI is found
  useEffect(() => {
    if (status === 'found' && !advancedRef.current) {
      advancedRef.current = true
      const timer = setTimeout(onNext, 1200)
      return () => clearTimeout(timer)
    }
  }, [status, onNext])

  const handleVerifyCustom = async (): Promise<void> => {
    if (!customPath.trim()) return
    setVerifying(true)
    const result = await window.api.claude.checkBinary(customPath.trim())
    if (result.found) {
      useSettingsStore.getState().updateSettings({ claudeBinaryPath: customPath.trim() })
      setStatus('found')
      setCliPath(result.path)
      setCliVersion(result.version ?? '')
    } else {
      setStatus('not-found')
    }
    setVerifying(false)
  }

  return (
    <div className="text-center space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-fg-strong mb-1">Welcome to coide</h2>
        <p className="text-[12px] text-fg-subtle">Checking for Claude Code CLI…</p>
      </div>

      {status === 'checking' && (
        <div className="flex justify-center py-4">
          <div className="h-8 w-8 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin" />
        </div>
      )}

      {status === 'found' && (
        <div className="rounded-xl border border-green-500/20 bg-green-500/[0.06] p-4 space-y-2">
          <div className="flex justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-green-400">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="22 4 12 14.01 9 11.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <p className="text-[13px] font-medium text-green-400/80">Claude Code CLI found</p>
          <p className="text-[11px] text-fg-subtle font-mono truncate">{cliPath}</p>
          {cliVersion && <p className="text-[10px] text-fg-faint">{cliVersion}</p>}
        </div>
      )}

      {status === 'not-found' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/[0.06] p-4 space-y-3">
            <div className="flex justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-yellow-400">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <p className="text-[13px] font-medium text-yellow-400/80">Claude Code CLI not found</p>
            <p className="text-[11px] text-fg-subtle leading-relaxed">
              coide requires the Claude Code CLI to work. Install it first, then come back.
            </p>
            <a
              href="https://docs.anthropic.com/en/docs/claude-code/overview"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-lg bg-overlay-3 hover:bg-overlay-4 px-4 py-2 text-[12px] font-medium text-fg-muted transition-colors"
            >
              Install Claude Code →
            </a>
          </div>

          <button
            onClick={() => checkBinary()}
            className="rounded-lg border border-line-strong px-4 py-2 text-[12px] font-medium text-fg-muted hover:text-fg-muted hover:bg-overlay-2 transition-colors"
          >
            Check Again
          </button>

          <div className="pt-2 space-y-2">
            <p className="text-[10px] text-fg-faint uppercase tracking-wider font-medium">Or set custom path</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
                placeholder="/path/to/claude"
                className="flex-1 rounded-md border border-line-strong bg-overlay-2 px-3 py-1.5 text-[12px] text-fg-muted font-mono placeholder-fg-faint outline-none focus:border-line-strong"
                onKeyDown={(e) => e.key === 'Enter' && handleVerifyCustom()}
              />
              <button
                onClick={handleVerifyCustom}
                disabled={!customPath.trim() || verifying}
                className="rounded-md bg-blue-600/80 hover:bg-blue-600 px-3 py-1.5 text-[12px] font-medium text-fg transition-colors disabled:opacity-30"
              >
                {verifying ? '…' : 'Verify'}
              </button>
            </div>
          </div>
        </div>
      )}

      {status === 'found' && (
        <button
          onClick={onNext}
          className="rounded-lg bg-blue-600 hover:bg-blue-500 px-5 py-2 text-[13px] font-medium text-fg transition-colors"
        >
          Continue
        </button>
      )}
    </div>
  )
}

function StepFolder({ onNext, onBack }: { onNext: () => void; onBack: () => void }): React.JSX.Element {
  const defaultCwd = useSettingsStore((s) => s.defaultCwd)
  const [folder, setFolder] = useState(defaultCwd)
  const [picking, setPicking] = useState(false)

  const handlePick = async (): Promise<void> => {
    setPicking(true)
    const picked = await window.api.dialog.pickFolder()
    setPicking(false)
    if (picked) {
      setFolder(picked)
      useSettingsStore.getState().updateSettings({ defaultCwd: picked })
      localStorage.setItem('cwd', picked)
    }
  }

  return (
    <div className="text-center space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-fg-strong mb-1">Pick your project folder</h2>
        <p className="text-[12px] text-fg-subtle">This is where coide will open new sessions by default.</p>
      </div>

      <div className="rounded-xl border border-line bg-overlay-1 p-4 space-y-3">
        {folder ? (
          <div className="space-y-2">
            <div className="flex justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-blue-400/60">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p className="text-[12px] text-fg-muted font-mono truncate">{folder}</p>
          </div>
        ) : (
          <div className="flex justify-center py-2">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-fg-faint">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        )}
        <button
          onClick={handlePick}
          disabled={picking}
          className="rounded-lg bg-overlay-3 hover:bg-overlay-4 px-4 py-2 text-[12px] font-medium text-fg-muted transition-colors disabled:opacity-50"
        >
          {picking ? 'Choosing…' : folder ? 'Change Folder' : 'Choose Folder'}
        </button>
      </div>

      <div className="flex justify-between pt-2">
        <button
          onClick={onBack}
          className="rounded-lg px-4 py-2 text-[12px] font-medium text-fg-subtle hover:text-fg-muted transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={onNext}
          disabled={!folder}
          className="rounded-lg bg-blue-600 hover:bg-blue-500 px-5 py-2 text-[13px] font-medium text-fg transition-colors disabled:opacity-30"
        >
          Next →
        </button>
      </div>
    </div>
  )
}

function StepTips(): React.JSX.Element {
  const tips = [
    { keys: '⌘ K', label: 'New session' },
    { keys: '⌘ J', label: 'Toggle terminal' },
    { keys: '/', label: 'Slash commands & skills' },
    { keys: '⌘ [  ]', label: 'Switch sessions' }
  ]

  return (
    <div className="text-center space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-fg-strong mb-1">You're all set</h2>
        <p className="text-[12px] text-fg-subtle">A few shortcuts to get you started.</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {tips.map((tip) => (
          <div key={tip.keys} className="rounded-xl border border-line-soft bg-overlay-1 p-3 text-left">
            <kbd className="text-[12px] font-mono font-medium text-fg-muted bg-overlay-2 px-1.5 py-0.5 rounded">
              {tip.keys}
            </kbd>
            <p className="text-[11px] text-fg-subtle mt-1.5">{tip.label}</p>
          </div>
        ))}
      </div>

      <button
        onClick={() => useSettingsStore.getState().updateSettings({ onboardingComplete: true })}
        className="rounded-lg bg-blue-600 hover:bg-blue-500 px-6 py-2.5 text-[13px] font-semibold text-fg transition-colors"
      >
        Get Started
      </button>
    </div>
  )
}
