// Map agent name + description to a personality icon.
// Each entry: keywords (lowercase) → { svg path, hue }.

type IconDef = {
  /** Inner SVG paths/shapes. Drawn inside a 14x14 viewBox. */
  paths: string
  /** Tailwind text color classes for the badge tint. */
  tone: string
}

const ICON_LIBRARY: Record<string, IconDef> = {
  // 🏛️ Architecture / system design
  architect: {
    paths: '<path d="M2 12h10M3 12V6M6 12V4M9 12V6M11 12V6M2 4l4-2 4 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    tone: 'text-amber-400/80'
  },
  // 🔍 Code review / inspection
  review: {
    paths: '<circle cx="6" cy="6" r="3.5" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M9 9l3 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
    tone: 'text-blue-400/80'
  },
  // 🎨 Design / UI / UX
  design: {
    paths: '<circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.3" fill="none"/><circle cx="4.5" cy="6" r="0.6" fill="currentColor"/><circle cx="6" cy="9.5" r="0.6" fill="currentColor"/><circle cx="9.5" cy="6.5" r="0.6" fill="currentColor"/>',
    tone: 'text-pink-400/80'
  },
  // 🛡️ Security / audit
  security: {
    paths: '<path d="M7 1.5L2 3.5v3.5c0 3 2 5 5 6 3-1 5-3 5-6V3.5L7 1.5z" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linejoin="round"/><path d="M5 7l1.5 1.5L9 6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    tone: 'text-emerald-400/80'
  },
  // 🐛 Debug / bug
  debug: {
    paths: '<ellipse cx="7" cy="8" rx="3" ry="3.5" stroke="currentColor" stroke-width="1.2" fill="none"/><path d="M7 4.5V6M4 8H2M12 8h-2M4 11l-1.5 1.5M10 11l1.5 1.5M5.5 4l-1-1.5M8.5 4l1-1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
    tone: 'text-red-400/80'
  },
  // 🧪 Testing / QA
  test: {
    paths: '<path d="M5 1.5v4L2.5 11.5a1 1 0 00.9 1.5h7.2a1 1 0 00.9-1.5L9 5.5v-4M4 1.5h6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="6" cy="9" r="0.6" fill="currentColor"/><circle cx="8" cy="10.5" r="0.6" fill="currentColor"/>',
    tone: 'text-cyan-400/80'
  },
  // 📚 Research / docs / explore
  research: {
    paths: '<path d="M2 2.5h6.5L11 5v8H2v-10.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="none"/><path d="M8 2.5V5h3M4 7h5M4 9.5h5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
    tone: 'text-purple-400/80'
  },
  // 📝 Writing / docs author
  writer: {
    paths: '<path d="M2 11.5L4 13l8.5-8.5L11 3 2.5 11.5zM10 4l1 1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    tone: 'text-sky-400/80'
  },
  // ⚡ Performance / optimization
  perf: {
    paths: '<path d="M7 1.5l-4 7h3l-1 4 5-7h-3l1-4z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="none"/>',
    tone: 'text-yellow-400/80'
  },
  // 🚀 Release / deploy / ship
  release: {
    paths: '<path d="M7 1.5c-2 1.5-3 3.5-3 5.5L2 10l2.5-1 2 2 1-2.5 2.5 2v-2c2-2 2-4 0-7z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="none"/><circle cx="7" cy="5" r="1" fill="currentColor"/>',
    tone: 'text-orange-400/80'
  },
  // 🗄️ Data / database
  data: {
    paths: '<ellipse cx="7" cy="3" rx="4" ry="1.5" stroke="currentColor" stroke-width="1.2" fill="none"/><path d="M3 3v8c0 .8 1.8 1.5 4 1.5s4-.7 4-1.5V3M3 7c0 .8 1.8 1.5 4 1.5s4-.7 4-1.5" stroke="currentColor" stroke-width="1.2" fill="none"/>',
    tone: 'text-indigo-400/80'
  },
  // 🤖 Default fallback (sparkle / generic agent)
  default: {
    paths: '<path d="M7 1.5l1.5 3.5L12 6.5l-3 2 1 3.5-3-2-3 2 1-3.5-3-2 3.5-1L7 1.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="none"/>',
    tone: 'text-fg-muted'
  }
}

const KEYWORD_MAP: Array<{ keys: string[]; icon: keyof typeof ICON_LIBRARY }> = [
  { keys: ['architect', 'system', 'design pattern'], icon: 'architect' },
  { keys: ['review', 'critic', 'inspect', 'audit'], icon: 'review' },
  { keys: ['design', 'ui', 'ux', 'visual', 'styling', 'layout'], icon: 'design' },
  { keys: ['security', 'auth', 'vuln', 'pentest', 'crypto'], icon: 'security' },
  { keys: ['debug', 'bug', 'fix', 'troubleshoot'], icon: 'debug' },
  { keys: ['test', 'qa', 'spec', 'coverage'], icon: 'test' },
  { keys: ['research', 'explore', 'investigate', 'analyze', 'docs'], icon: 'research' },
  { keys: ['write', 'author', 'doc', 'content', 'copy'], icon: 'writer' },
  { keys: ['perf', 'fast', 'optim', 'speed', 'profile'], icon: 'perf' },
  { keys: ['release', 'deploy', 'ship', 'publish'], icon: 'release' },
  { keys: ['data', 'database', 'sql', 'query', 'migration', 'schema'], icon: 'data' }
]

export function pickAgentIcon(name: string, description = ''): IconDef {
  const haystack = `${name} ${description}`.toLowerCase()
  for (const entry of KEYWORD_MAP) {
    if (entry.keys.some((k) => haystack.includes(k))) {
      return ICON_LIBRARY[entry.icon]
    }
  }
  return ICON_LIBRARY.default
}

export type { IconDef }
