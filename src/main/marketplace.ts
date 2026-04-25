import { appendFile } from 'fs'
import { saveWorkflow } from './workflowStore'
import {
  MARKETPLACE_OWNER,
  MARKETPLACE_REPO,
  MARKETPLACE_RAW_BASE,
  buildMarketplaceShareUrl
} from '../shared/workflowHelpers'
import type {
  MarketplaceIndex,
  MarketplaceEntry,
  WorkflowDefinition
} from '../shared/workflow-types'

const INDEX_URL = `${MARKETPLACE_RAW_BASE}/index.json`
const FETCH_TIMEOUT_MS = 8000
const CACHE_TTL_MS = 5 * 60 * 1000

function mLog(msg: string): void {
  const line = `[${new Date().toISOString()}] [marketplace] ${msg}\n`
  console.log(line.trim())
  appendFile('/tmp/coide-debug.log', line, () => {})
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

let cachedIndex: { data: MarketplaceIndex; fetchedAt: number } | null = null

export async function fetchMarketplaceIndex(
  forceRefresh = false
): Promise<{ index?: MarketplaceIndex; error?: string }> {
  const now = Date.now()
  if (!forceRefresh && cachedIndex && now - cachedIndex.fetchedAt < CACHE_TTL_MS) {
    return { index: cachedIndex.data }
  }
  try {
    const res = await fetchWithTimeout(INDEX_URL, FETCH_TIMEOUT_MS)
    if (!res.ok) {
      // Surface stale cache if available; else error
      if (cachedIndex) return { index: cachedIndex.data, error: `HTTP ${res.status} (using cached)` }
      return { error: `HTTP ${res.status}` }
    }
    const json = (await res.json()) as MarketplaceIndex
    if (!json || !Array.isArray(json.templates)) {
      return { error: 'Marketplace index is malformed' }
    }
    cachedIndex = { data: json, fetchedAt: now }
    mLog(`Loaded ${json.templates.length} templates from marketplace`)
    return { index: json }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    mLog(`Index fetch failed: ${msg}`)
    if (cachedIndex) return { index: cachedIndex.data, error: `${msg} (using cached)` }
    return { error: msg }
  }
}

export async function installMarketplaceTemplate(
  entry: MarketplaceEntry
): Promise<{ workflow?: WorkflowDefinition; error?: string }> {
  if (!entry || !entry.path || !entry.id) {
    return { error: 'Invalid marketplace entry' }
  }
  // Defensive: ensure the path is repo-relative and doesn't escape via ../
  if (entry.path.includes('..') || entry.path.startsWith('/')) {
    return { error: 'Invalid template path' }
  }
  const url = `${MARKETPLACE_RAW_BASE}/${entry.path}`
  try {
    const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS)
    if (!res.ok) return { error: `HTTP ${res.status}` }
    const tpl = (await res.json()) as WorkflowDefinition
    if (!tpl || !Array.isArray(tpl.nodes) || !Array.isArray(tpl.edges)) {
      return { error: 'Template JSON is malformed' }
    }
    // Save with a fresh local id so re-installs don't clobber edits, and tag with
    // marketplaceId/Version so the UI can show installed/update-available state.
    const workflow: WorkflowDefinition = {
      ...tpl,
      id: `wf-mkt-${entry.id}-${Date.now()}`,
      isTemplate: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      marketplaceId: entry.id,
      marketplaceVersion: entry.version
    }
    await saveWorkflow(workflow)
    mLog(`Installed marketplace template ${entry.id} v${entry.version}`)
    return { workflow }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    mLog(`Install failed for ${entry.id}: ${msg}`)
    return { error: msg }
  }
}

export function getMarketplaceShareUrl(workflow: WorkflowDefinition): string {
  return buildMarketplaceShareUrl(workflow)
}

export function getMarketplaceRepoUrl(): string {
  return `https://github.com/${MARKETPLACE_OWNER}/${MARKETPLACE_REPO}`
}
