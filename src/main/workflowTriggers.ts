import { BrowserWindow } from 'electron'
import { appendFile } from 'fs'
import * as cron from 'node-cron'
import chokidar from 'chokidar'
import { listWorkflows, loadWorkflow } from './workflowStore'
import { executeWorkflow } from './workflow'
import type { CoideSettings } from '../shared/types'
import type {
  WorkflowDefinition,
  WorkflowTrigger,
  WorkflowTriggerCron,
  WorkflowTriggerFileWatcher,
  WorkflowTriggerWebhook
} from '../shared/workflow-types'

function tLog(msg: string): void {
  const line = `[${new Date().toISOString()}] [workflow-triggers] ${msg}\n`
  console.log(line.trim())
  appendFile('/tmp/coide-debug.log', line, () => {})
}

type CronRegistration = {
  workflowId: string
  triggerId: string
  task: cron.ScheduledTask
}

type WatcherRegistration = {
  workflowId: string
  triggerId: string
  watcher: chokidar.FSWatcher
  debounceTimer?: NodeJS.Timeout
}

type WebhookRegistration = {
  workflowId: string
  triggerId: string
  token: string
  cwd: string
  inputValues?: Record<string, string>
}

const cronRegistrations: CronRegistration[] = []
const watcherRegistrations: WatcherRegistration[] = []
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

  const watcher = chokidar.watch(trigger.paths, {
    cwd: trigger.cwd,
    ignoreInitial: true,
    persistent: true
  })

  const reg: WatcherRegistration = {
    workflowId: workflow.id,
    triggerId: trigger.id,
    watcher
  }

  const fire = (event: string, path: string): void => {
    if (!events.includes(event as 'add' | 'change' | 'unlink')) return
    if (reg.debounceTimer) clearTimeout(reg.debounceTimer)
    reg.debounceTimer = setTimeout(() => {
      fireTrigger(workflow.id, trigger, 'fileWatcher', { trigger_event: event, trigger_path: path })
    }, debounceMs)
  }

  watcher.on('add', (p) => fire('add', p))
  watcher.on('change', (p) => fire('change', p))
  watcher.on('unlink', (p) => fire('unlink', p))
  watcher.on('error', (err) => tLog(`Watcher error for ${workflow.name}: ${err}`))

  watcherRegistrations.push(reg)
  tLog(`Registered file watcher for ${workflow.name} on ${trigger.paths.join(', ')}`)
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
  for (const reg of watcherRegistrations) {
    if (reg.debounceTimer) clearTimeout(reg.debounceTimer)
    reg.watcher.close().catch(() => {})
  }
  watcherRegistrations.length = 0
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
  tLog(`Active triggers: ${cronRegistrations.length} cron, ${watcherRegistrations.length} watchers, ${webhookRegistrations.size} webhooks`)
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
