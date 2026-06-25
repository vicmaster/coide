import { BrowserWindow } from 'electron'
import * as cron from 'node-cron'
import chokidar from 'chokidar'
import { listWorkflows, loadWorkflow } from './workflowStore'
import { executeWorkflow } from './workflow'
import { createLogger } from './logger'
import type { CoideSettings } from '../shared/types'
import type {
  WorkflowDefinition,
  WorkflowTrigger,
  WorkflowTriggerCron,
  WorkflowTriggerFileWatcher,
  WorkflowTriggerWebhook
} from '../shared/workflow-types'

const tLog = createLogger('workflow-triggers')

type CronRegistration = {
  workflowId: string
  triggerId: string
  task: cron.ScheduledTask
}

// One chokidar watcher per unique (cwd, paths) set, shared by every trigger that
// watches the same paths — so N identical file-watcher triggers don't spawn N watchers.
type WatcherPoolEntry = {
  watcher: chokidar.FSWatcher
  listeners: Map<string, (event: string, path: string) => void> // key: `${workflowId}:${triggerId}`
}
const MAX_FILE_WATCHERS = 24

type WebhookRegistration = {
  workflowId: string
  triggerId: string
  token: string
  cwd: string
  inputValues?: Record<string, string>
}

const cronRegistrations: CronRegistration[] = []
const fileWatcherPool = new Map<string, WatcherPoolEntry>()
const webhookRegistrations = new Map<string, WebhookRegistration>() // key: `${workflowId}:${triggerId}`

let runtimeWin: BrowserWindow | null = null
let runtimeSettings: CoideSettings | null = null

function fireTrigger(
  workflowId: string,
  trigger: WorkflowTrigger,
  source: 'cron' | 'fileWatcher' | 'webhook',
  extraInputs?: Record<string, string>
): void {
  if (!runtimeWin || !runtimeSettings) return
  const cwd = 'cwd' in trigger ? trigger.cwd : ''
  const inputs = { ...(trigger.inputValues ?? {}), ...(extraInputs ?? {}) }
  tLog(`Firing ${source} trigger for workflow=${workflowId} cwd=${cwd}`)
  executeWorkflow(workflowId, cwd, runtimeWin, runtimeSettings, inputs, source).catch((err) => {
    tLog(`Trigger execution failed: ${err}`)
  })
}

function registerCron(workflow: WorkflowDefinition, trigger: WorkflowTriggerCron): void {
  if (!trigger.cwd) {
    tLog(`Cron trigger for ${workflow.name}/${trigger.id} missing cwd; skipping`)
    return
  }
  if (!cron.validate(trigger.schedule)) {
    tLog(`Invalid cron schedule "${trigger.schedule}" for ${workflow.name}/${trigger.id}`)
    return
  }
  const task = cron.schedule(trigger.schedule, () => {
    fireTrigger(workflow.id, trigger, 'cron')
  })
  cronRegistrations.push({ workflowId: workflow.id, triggerId: trigger.id, task })
  tLog(`Registered cron "${trigger.schedule}" for ${workflow.name}`)
}

function registerFileWatcher(
  workflow: WorkflowDefinition,
  trigger: WorkflowTriggerFileWatcher
): void {
  if (!trigger.paths || trigger.paths.length === 0) return
  if (!trigger.cwd) {
    tLog(`File watcher for ${workflow.name}/${trigger.id} missing cwd; skipping`)
    return
  }
  const events = trigger.events ?? ['change']
  const debounceMs = trigger.debounceMs ?? 1000
  const key = JSON.stringify([trigger.cwd, [...trigger.paths].sort()])
  const listenerKey = `${workflow.id}:${trigger.id}`

  let entry = fileWatcherPool.get(key)
  if (!entry) {
    if (fileWatcherPool.size >= MAX_FILE_WATCHERS) {
      tLog(`File-watcher cap (${MAX_FILE_WATCHERS}) reached; skipping ${workflow.name}/${trigger.id} on ${trigger.paths.join(', ')}`)
      return
    }
    const watcher = chokidar.watch(trigger.paths, {
      cwd: trigger.cwd,
      ignoreInitial: true,
      persistent: true
    })
    const created: WatcherPoolEntry = { watcher, listeners: new Map() }
    const dispatch = (event: string, path: string): void => {
      for (const fn of created.listeners.values()) fn(event, path)
    }
    watcher.on('add', (p) => dispatch('add', p))
    watcher.on('change', (p) => dispatch('change', p))
    watcher.on('unlink', (p) => dispatch('unlink', p))
    watcher.on('error', (err) => tLog(`Watcher error on ${key}: ${err}`))
    fileWatcherPool.set(key, created)
    entry = created
  }

  // Each trigger gets its own debounced listener fanned out from the shared watcher.
  let debounceTimer: NodeJS.Timeout | undefined
  const listener = (event: string, path: string): void => {
    if (!events.includes(event as 'add' | 'change' | 'unlink')) return
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      fireTrigger(workflow.id, trigger, 'fileWatcher', { trigger_event: event, trigger_path: path })
    }, debounceMs)
  }
  entry.listeners.set(listenerKey, listener)
  tLog(`Registered file watcher for ${workflow.name} on ${trigger.paths.join(', ')} (${entry.listeners.size} trigger(s) sharing this watcher)`)
}

function registerWebhook(
  workflow: WorkflowDefinition,
  trigger: WorkflowTriggerWebhook
): void {
  const key = `${workflow.id}:${trigger.id}`
  webhookRegistrations.set(key, {
    workflowId: workflow.id,
    triggerId: trigger.id,
    token: trigger.token,
    cwd: trigger.cwd,
    inputValues: trigger.inputValues
  })
  tLog(`Registered webhook for ${workflow.name}`)
}

export function fireWebhook(
  workflowId: string,
  triggerId: string,
  token: string,
  bodyInputs?: Record<string, string>
): { ok: boolean; error?: string } {
  const key = `${workflowId}:${triggerId}`
  const reg = webhookRegistrations.get(key)
  if (!reg) return { ok: false, error: 'Webhook trigger not found' }
  if (reg.token !== token) return { ok: false, error: 'Invalid token' }
  if (!runtimeWin || !runtimeSettings) return { ok: false, error: 'Runtime not ready' }

  const inputs = { ...(reg.inputValues ?? {}), ...(bodyInputs ?? {}) }
  tLog(`Firing webhook trigger for workflow=${workflowId}`)
  executeWorkflow(workflowId, reg.cwd, runtimeWin, runtimeSettings, inputs, 'webhook').catch((err) => {
    tLog(`Webhook execution failed: ${err}`)
  })
  return { ok: true }
}

function clearAll(): void {
  for (const reg of cronRegistrations) {
    try { reg.task.stop() } catch { /* ignore */ }
  }
  cronRegistrations.length = 0
  for (const entry of fileWatcherPool.values()) {
    entry.listeners.clear()
    entry.watcher.close().catch(() => {})
  }
  fileWatcherPool.clear()
  webhookRegistrations.clear()
}

export async function refreshTriggers(): Promise<void> {
  if (!runtimeWin || !runtimeSettings) return
  clearAll()
  const workflows = await listWorkflows()
  for (const wf of workflows) {
    if (!wf.triggers) continue
    for (const trigger of wf.triggers) {
      if (!trigger.enabled) continue
      try {
        if (trigger.type === 'cron') registerCron(wf, trigger)
        else if (trigger.type === 'fileWatcher') registerFileWatcher(wf, trigger)
        else if (trigger.type === 'webhook') registerWebhook(wf, trigger)
      } catch (err) {
        tLog(`Failed to register trigger ${trigger.id} for ${wf.name}: ${err}`)
      }
    }
  }
  let watcherTriggers = 0
  for (const entry of fileWatcherPool.values()) watcherTriggers += entry.listeners.size
  tLog(`Active triggers: ${cronRegistrations.length} cron, ${watcherTriggers} file-watcher trigger(s) across ${fileWatcherPool.size} pooled watcher(s), ${webhookRegistrations.size} webhooks`)
}

export async function startTriggerRuntime(
  win: BrowserWindow,
  settings: CoideSettings
): Promise<void> {
  runtimeWin = win
  runtimeSettings = settings
  await refreshTriggers()
}

export function updateTriggerSettings(settings: CoideSettings): void {
  runtimeSettings = settings
}

export async function testTrigger(
  workflowId: string,
  triggerId: string
): Promise<{ ok: boolean; error?: string }> {
  const wf = await loadWorkflow(workflowId)
  if (!wf) return { ok: false, error: 'Workflow not found' }
  const trigger = (wf.triggers ?? []).find((t) => t.id === triggerId)
  if (!trigger) return { ok: false, error: 'Trigger not found' }
  fireTrigger(workflowId, trigger, trigger.type === 'webhook' ? 'webhook' : trigger.type)
  return { ok: true }
}

export function stopTriggerRuntime(): void {
  clearAll()
  runtimeWin = null
  runtimeSettings = null
}

export function getActiveWebhookKeys(): string[] {
  return Array.from(webhookRegistrations.keys())
}
