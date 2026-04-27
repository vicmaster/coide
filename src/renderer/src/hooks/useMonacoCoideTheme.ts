import { useEffect, useState } from 'react'
import { useMonaco } from '@monaco-editor/react'
import { useResolvedTheme } from './useResolvedTheme'

const THEME_DARK = 'coide-dark'
const THEME_LIGHT = 'coide-light'

type ColorMap = Record<string, string>

const DARK_COLORS: ColorMap = {
  'editor.background': '#111111',
  'editorLineNumber.foreground': '#ffffff18',
  'editorGutter.background': '#111111',
  'scrollbar.shadow': '#00000000',
  'editorOverviewRuler.border': '#00000000'
}

const LIGHT_COLORS: ColorMap = {
  'editor.background': '#ffffff',
  'editorLineNumber.foreground': '#00000033',
  'editorGutter.background': '#ffffff',
  'scrollbar.shadow': '#00000000',
  'editorOverviewRuler.border': '#00000000'
}

const DIFF_DARK_EXTRAS: ColorMap = {
  'diffEditor.insertedTextBackground': '#22c55e12',
  'diffEditor.removedTextBackground': '#ef444412',
  'diffEditor.insertedLineBackground': '#22c55e08',
  'diffEditor.removedLineBackground': '#ef444408'
}

const DIFF_LIGHT_EXTRAS: ColorMap = {
  'diffEditor.insertedTextBackground': '#22c55e22',
  'diffEditor.removedTextBackground': '#ef444422',
  'diffEditor.insertedLineBackground': '#22c55e10',
  'diffEditor.removedLineBackground': '#ef444410'
}

/**
 * Defines coide-dark + coide-light Monaco themes and returns the active one
 * based on the resolved app theme. Pass `withDiff: true` for DiffEditor usage.
 */
export function useMonacoCoideTheme({ withDiff = false }: { withDiff?: boolean } = {}): {
  defined: boolean
  theme: string
} {
  const monacoApi = useMonaco()
  const resolved = useResolvedTheme()
  const [defined, setDefined] = useState(false)

  useEffect(() => {
    if (!monacoApi) return
    monacoApi.editor.defineTheme(THEME_DARK, {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: { ...DARK_COLORS, ...(withDiff ? DIFF_DARK_EXTRAS : {}) }
    })
    monacoApi.editor.defineTheme(THEME_LIGHT, {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: { ...LIGHT_COLORS, ...(withDiff ? DIFF_LIGHT_EXTRAS : {}) }
    })
    setDefined(true)
  }, [monacoApi, withDiff])

  return { defined, theme: resolved === 'light' ? THEME_LIGHT : THEME_DARK }
}
