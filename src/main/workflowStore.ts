import { readdir, readFile, writeFile, unlink, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type {
  WorkflowDefinition,
  WorkflowExecutionRecord,
  WorkflowMetrics
} from '../shared/workflow-types'
import { aggregateWorkflowMetrics } from '../shared/workflowHelpers'

const WORKFLOW_DIR = join(homedir(), '.coide', 'workflows')
const EXECUTIONS_DIR = join(homedir(), '.coide', 'workflow-executions')

async function ensureDir(dir: string): Promise<void> {
  if (!existsSync(dir)) await mkdir(dir, { recursive: true })
}

export async function listWorkflows(): Promise<WorkflowDefinition[]> {
  await ensureDir(WORKFLOW_DIR)
  const files = await readdir(WORKFLOW_DIR)
  const workflows: WorkflowDefinition[] = []
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    try {
      const raw = await readFile(join(WORKFLOW_DIR, file), 'utf-8')
      workflows.push(JSON.parse(raw))
    } catch {
      // skip corrupt files
    }
  }
  return workflows.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function loadWorkflow(id: string): Promise<WorkflowDefinition | null> {
  const filePath = join(WORKFLOW_DIR, `${id}.json`)
  if (existsSync(filePath)) {
    const raw = await readFile(filePath, 'utf-8')
    return JSON.parse(raw)
  }
  // Fallback: allow sub-workflow nodes to reference built-in templates directly
  return getBuiltInTemplates().find((t) => t.id === id) ?? null
}

export async function saveWorkflow(wf: WorkflowDefinition): Promise<void> {
  await ensureDir(WORKFLOW_DIR)
  wf.updatedAt = Date.now()
  await writeFile(join(WORKFLOW_DIR, `${wf.id}.json`), JSON.stringify(wf, null, 2), 'utf-8')
}

export async function deleteWorkflow(id: string): Promise<void> {
  const filePath = join(WORKFLOW_DIR, `${id}.json`)
  if (existsSync(filePath)) await unlink(filePath)
}

// --- Execution records ---
export async function saveExecutionRecord(record: WorkflowExecutionRecord): Promise<void> {
  await ensureDir(EXECUTIONS_DIR)
  await writeFile(
    join(EXECUTIONS_DIR, `${record.id}.json`),
    JSON.stringify(record, null, 2),
    'utf-8'
  )
}

export async function listExecutionRecords(
  workflowId?: string
): Promise<WorkflowExecutionRecord[]> {
  await ensureDir(EXECUTIONS_DIR)
  const files = await readdir(EXECUTIONS_DIR)
  const records: WorkflowExecutionRecord[] = []
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    try {
      const raw = await readFile(join(EXECUTIONS_DIR, file), 'utf-8')
      const rec = JSON.parse(raw) as WorkflowExecutionRecord
      if (!workflowId || rec.workflowId === workflowId) records.push(rec)
    } catch {
      // skip corrupt
    }
  }
  return records.sort((a, b) => b.startedAt - a.startedAt)
}

export async function loadExecutionRecord(id: string): Promise<WorkflowExecutionRecord | null> {
  const filePath = join(EXECUTIONS_DIR, `${id}.json`)
  if (!existsSync(filePath)) return null
  const raw = await readFile(filePath, 'utf-8')
  return JSON.parse(raw)
}

export async function deleteExecutionRecord(id: string): Promise<void> {
  const filePath = join(EXECUTIONS_DIR, `${id}.json`)
  if (existsSync(filePath)) await unlink(filePath)
}

// --- Metrics aggregation ---
export async function computeWorkflowMetrics(
  workflowId: string
): Promise<WorkflowMetrics | null> {
  const wf = await loadWorkflow(workflowId)
  if (!wf) return null
  const records = await listExecutionRecords(workflowId)
  return aggregateWorkflowMetrics(wf, records)
}

// --- Built-in Templates ---
export function getBuiltInTemplates(): WorkflowDefinition[] {
  return [
    prReviewTemplate(),
    bugFixTemplate(),
    leadResearchTemplate(),
    parallelAuditTemplate(),
    iterativeRefinerTemplate(),
    researchBriefTemplate(),
    auditReusableTemplate(),
    weeklyRepoDigestTemplate()
  ]
}

function prReviewTemplate(): WorkflowDefinition {
  return {
    id: 'template-pr-review',
    name: 'PR Review Pipeline',
    description: 'Explore diff, analyze changes, fix issues if found',
    isTemplate: true,
    createdAt: 0,
    updatedAt: 0,
    nodes: [
      {
        id: 'explore',
        label: 'Explore Diff',
        position: { x: 50, y: 160 },
        data: {
          type: 'prompt',
          prompt:
            'Read the git diff for the current branch and list all changed files with a brief description of each change.',
          model: 'haiku'
        }
      },
      {
        id: 'analyze',
        label: 'Analyze Changes',
        position: { x: 320, y: 160 },
        data: {
          type: 'prompt',
          prompt:
            'Review the following changes for bugs, security issues, and style problems:\n\n{{prev.output}}',
          systemPrompt: 'You are a senior code reviewer.',
          model: 'sonnet'
        }
      },
      {
        id: 'has_issues',
        label: 'Has Issues?',
        position: { x: 590, y: 160 },
        data: {
          type: 'condition',
          expression: "output.includes('issue') || output.includes('bug') || output.includes('problem')"
        }
      },
      {
        id: 'fix',
        label: 'Fix Issues',
        position: { x: 590, y: 300 },
        data: {
          type: 'prompt',
          prompt: 'Fix the issues identified in the review:\n\n{{prev.output}}',
          model: 'sonnet'
        }
      },
      {
        id: 'approve',
        label: 'PR Approved',
        position: { x: 590, y: 20 },
        data: {
          type: 'script',
          command: "echo 'No issues found — PR looks good!'"
        }
      }
    ],
    edges: [
      { id: 'e-explore-analyze', source: 'explore', target: 'analyze' },
      { id: 'e-analyze-check', source: 'analyze', target: 'has_issues' },
      { id: 'e-check-fix', source: 'has_issues', target: 'fix', sourceHandle: 'yes', label: 'yes' },
      { id: 'e-check-approve', source: 'has_issues', target: 'approve', sourceHandle: 'no', label: 'no' }
    ]
  }
}

function bugFixTemplate(): WorkflowDefinition {
  return {
    id: 'template-bug-fix',
    name: 'Bug Fix Pipeline',
    description: 'Diagnose bug, implement fix, run tests, verify passing',
    isTemplate: true,
    createdAt: 0,
    updatedAt: 0,
    nodes: [
      {
        id: 'diagnose',
        label: 'Diagnose Bug',
        position: { x: 50, y: 160 },
        data: {
          type: 'prompt',
          prompt:
            'Analyze the following bug description and identify the likely root cause. Look at relevant source files.\n\nBug: (describe your bug here)',
          model: 'sonnet'
        }
      },
      {
        id: 'fix',
        label: 'Implement Fix',
        position: { x: 320, y: 160 },
        data: {
          type: 'prompt',
          prompt: 'Based on the analysis, implement a fix for the bug:\n\n{{prev.output}}',
          model: 'sonnet'
        }
      },
      {
        id: 'test',
        label: 'Run Tests',
        position: { x: 590, y: 160 },
        data: { type: 'script', command: 'npm test' }
      },
      {
        id: 'check_pass',
        label: 'Tests Pass?',
        position: { x: 590, y: 300 },
        data: {
          type: 'condition',
          expression: "!output.includes('FAIL') && !output.includes('Error')"
        }
      },
      {
        id: 'done',
        label: 'Bug Fixed!',
        position: { x: 590, y: 440 },
        data: { type: 'script', command: "echo 'Bug fixed and all tests pass!'" }
      }
    ],
    edges: [
      { id: 'e-diag-fix', source: 'diagnose', target: 'fix' },
      { id: 'e-fix-test', source: 'fix', target: 'test' },
      { id: 'e-test-check', source: 'test', target: 'check_pass' },
      { id: 'e-check-done', source: 'check_pass', target: 'done', sourceHandle: 'yes', label: 'yes' }
    ]
  }
}

function leadResearchTemplate(): WorkflowDefinition {
  return {
    id: 'template-lead-research',
    name: 'Lead Research',
    description: 'Research a company, identify pain points, match to your product, and draft a personalized cold email',
    isTemplate: true,
    createdAt: 0,
    updatedAt: 0,
    inputs: [
      { key: 'company', label: 'Company name or website URL', placeholder: 'e.g. Acme Corp or https://acme.com' },
      { key: 'product', label: 'Your product/service description', placeholder: 'e.g. We offer an AI-powered CRM that...' }
    ],
    nodes: [
      {
        id: 'research',
        label: 'Research Company',
        position: { x: 50, y: 160 },
        data: {
          type: 'prompt',
          prompt:
            'Research this company and summarize what they do, their industry, size, recent news, and any publicly known challenges or initiatives.\n\nCompany: {{input.company}}',
          model: 'sonnet'
        }
      },
      {
        id: 'pain_points',
        label: 'Identify Pain Points',
        position: { x: 320, y: 160 },
        data: {
          type: 'prompt',
          prompt:
            'Based on this company research, identify 3-5 likely pain points or challenges they face. Focus on operational inefficiencies, growth blockers, or industry-wide problems that affect them.\n\n{{prev.output}}',
          model: 'sonnet'
        }
      },
      {
        id: 'match',
        label: 'Match to Product',
        position: { x: 590, y: 160 },
        data: {
          type: 'prompt',
          prompt:
            'Given these pain points, explain how our product/service addresses each one. Be specific about which features solve which problems. If a pain point is not addressed, say so honestly.\n\nOur product: {{input.product}}\n\nTheir pain points:\n{{prev.output}}',
          systemPrompt: 'You are a sales strategist who focuses on genuine value alignment, not hype.',
          model: 'sonnet'
        }
      },
      {
        id: 'draft_email',
        label: 'Draft Cold Email',
        position: { x: 860, y: 160 },
        data: {
          type: 'prompt',
          prompt:
            'Draft a personalized cold email to a decision-maker at this company. The email should:\n- Open with something specific about their company (not generic)\n- Reference 1-2 of their pain points naturally\n- Briefly explain how we can help (not a feature dump)\n- End with a soft CTA (suggest a 15-min call, not a demo)\n- Keep it under 150 words\n\nContext:\n{{prev.output}}',
          systemPrompt: 'Write like a human, not a marketer. No buzzwords. Be concise and genuine.',
          model: 'sonnet'
        }
      }
    ],
    edges: [
      { id: 'e-research-pain', source: 'research', target: 'pain_points' },
      { id: 'e-pain-match', source: 'pain_points', target: 'match' },
      { id: 'e-match-email', source: 'match', target: 'draft_email' }
    ]
  }
}

function parallelAuditTemplate(): WorkflowDefinition {
  return {
    id: 'template-parallel-audit',
    name: 'Parallel Code Audit',
    description: 'Fan out three specialist reviewers (security, perf, style), then join into a summary — and pause for human review before applying fixes',
    isTemplate: true,
    createdAt: 0,
    updatedAt: 0,
    nodes: [
      {
        id: 'prep',
        label: 'Prepare Target',
        position: { x: 40, y: 220 },
        data: {
          type: 'prompt',
          prompt: 'List the files changed on the current branch (git diff --name-only) and pick the top 3 to audit.',
          model: 'haiku'
        }
      },
      {
        id: 'fork',
        label: 'Fork Reviewers',
        position: { x: 300, y: 220 },
        data: { type: 'parallel' }
      },
      {
        id: 'security',
        label: 'Security',
        position: { x: 520, y: 60 },
        data: {
          type: 'prompt',
          prompt: 'Audit these files for security issues (injection, auth, secrets, unsafe eval). Output findings.\n\n{{prev.output}}',
          model: 'sonnet',
          allowedTools: ['Read', 'Grep', 'Glob']
        }
      },
      {
        id: 'perf',
        label: 'Performance',
        position: { x: 520, y: 220 },
        data: {
          type: 'prompt',
          prompt: 'Audit these files for performance issues (N+1, large allocations, render thrash). Output findings.\n\n{{prev.output}}',
          model: 'sonnet',
          allowedTools: ['Read', 'Grep', 'Glob']
        }
      },
      {
        id: 'style',
        label: 'Style',
        position: { x: 520, y: 380 },
        data: {
          type: 'prompt',
          prompt: 'Audit these files for style/naming/readability issues. Output findings.\n\n{{prev.output}}',
          model: 'haiku',
          allowedTools: ['Read']
        }
      },
      {
        id: 'join',
        label: 'Join Reports',
        position: { x: 780, y: 220 },
        data: { type: 'join', separator: '\n\n=== NEXT REPORT ===\n\n' }
      },
      {
        id: 'review',
        label: 'Human Review',
        position: { x: 1000, y: 220 },
        data: {
          type: 'humanReview',
          message: 'Review the consolidated audit findings. Approve to apply fixes; reject to stop.'
        }
      },
      {
        id: 'apply',
        label: 'Apply Fixes',
        position: { x: 1220, y: 220 },
        data: {
          type: 'prompt',
          prompt: 'Apply the approved fixes from this audit:\n\n{{prev.output}}',
          model: 'sonnet'
        }
      }
    ],
    edges: [
      { id: 'e-prep-fork', source: 'prep', target: 'fork' },
      { id: 'e-fork-sec', source: 'fork', target: 'security' },
      { id: 'e-fork-perf', source: 'fork', target: 'perf' },
      { id: 'e-fork-style', source: 'fork', target: 'style' },
      { id: 'e-sec-join', source: 'security', target: 'join' },
      { id: 'e-perf-join', source: 'perf', target: 'join' },
      { id: 'e-style-join', source: 'style', target: 'join' },
      { id: 'e-join-review', source: 'join', target: 'review' },
      { id: 'e-review-apply', source: 'review', target: 'apply' }
    ]
  }
}

function iterativeRefinerTemplate(): WorkflowDefinition {
  return {
    id: 'template-iterative-refiner',
    name: 'Iterative Refiner (Loop)',
    description:
      'Refine a draft over multiple passes: improve → score → repeat until quality threshold is met or max iterations reached. Shows Loop + setVars score-based exit.',
    isTemplate: true,
    createdAt: 0,
    updatedAt: 0,
    inputs: [
      {
        key: 'draft',
        label: 'Draft to refine',
        placeholder: 'Paste the draft text you want the loop to improve'
      },
      {
        key: 'goal',
        label: 'Refinement goal',
        placeholder: 'e.g. "make it more concise and remove jargon"'
      }
    ],
    nodes: [
      {
        id: 'seed',
        label: 'Seed Draft',
        position: { x: 40, y: 220 },
        data: {
          type: 'prompt',
          prompt:
            'Output the following draft verbatim so it becomes the starting point for the refinement loop. Do not add commentary.\n\n---\n{{input.draft}}\n---',
          model: 'haiku',
          setVars: [{ name: 'draft', extractor: '' }]
        }
      },
      {
        id: 'loop',
        label: 'Refine Loop',
        position: { x: 300, y: 220 },
        data: {
          type: 'loop',
          // Continue while score below 8 (or unset) AND we've run fewer than 5 passes.
          condition: '(parseInt(vars.score) || 0) < 8 && iteration < 5',
          maxIterations: 5
        }
      },
      {
        id: 'refine',
        label: 'Improve Draft',
        position: { x: 300, y: 420 },
        data: {
          type: 'prompt',
          prompt:
            'Refinement goal: {{input.goal}}\n\nImprove the following draft. Output ONLY the improved draft text, no preamble, no commentary.\n\n---\n{{vars.draft}}\n---',
          systemPrompt:
            'You are a precise editor. Make surgical improvements — keep the author\'s voice. Never add meta-commentary; respond with only the revised text.',
          model: 'sonnet',
          setVars: [{ name: 'draft', extractor: '' }]
        }
      },
      {
        id: 'score',
        label: 'Score Draft',
        position: { x: 620, y: 420 },
        data: {
          type: 'prompt',
          prompt:
            'Rate the following draft from 1 to 10 against this goal: "{{input.goal}}".\n\nReply with JUST a single integer (1-10). No prose.\n\n---\n{{vars.draft}}\n---',
          model: 'haiku',
          setVars: [{ name: 'score', extractor: 'regex:(\\d+)' }]
        }
      },
      {
        id: 'finalize',
        label: 'Final Report',
        position: { x: 620, y: 220 },
        data: {
          type: 'prompt',
          prompt:
            'Summarize the refinement run in a short report.\n\nFinal score: {{vars.score}}/10\n\nFinal draft:\n{{vars.draft}}\n\nBriefly (2-3 sentences) describe what changed between the input and the final draft.\n\nOriginal input:\n{{input.draft}}',
          model: 'sonnet'
        }
      }
    ],
    edges: [
      { id: 'e-seed-loop', source: 'seed', target: 'loop' },
      // Loop body: refine → score (chain ends, loop evaluates condition)
      { id: 'e-loop-body', source: 'loop', target: 'refine', sourceHandle: 'body', label: 'body' },
      { id: 'e-refine-score', source: 'refine', target: 'score' },
      // Loop exit → finalize
      {
        id: 'e-loop-exit',
        source: 'loop',
        target: 'finalize',
        sourceHandle: 'exit',
        label: 'exit'
      }
    ]
  }
}

function researchBriefTemplate(): WorkflowDefinition {
  return {
    id: 'template-research-brief',
    name: 'Research Brief (Parallel + Vars)',
    description:
      'Kick off three parallel research angles for a topic, join into a review checkpoint, then synthesize an executive brief using captured variables.',
    isTemplate: true,
    createdAt: 0,
    updatedAt: 0,
    inputs: [
      {
        key: 'topic',
        label: 'Topic or product area',
        placeholder: 'e.g. "AI-powered CRM for small teams"'
      },
      {
        key: 'audience',
        label: 'Target audience',
        placeholder: 'e.g. "Heads of Sales at 20-200 person SaaS companies"'
      }
    ],
    nodes: [
      {
        id: 'plan',
        label: 'Scope Research',
        position: { x: 40, y: 240 },
        data: {
          type: 'prompt',
          prompt:
            'We are writing an executive research brief.\n\nTopic: {{input.topic}}\nAudience: {{input.audience}}\n\nBriefly outline the three research angles we will pursue in parallel (market trends, competitive landscape, customer pain points). Three bullets, one line each.',
          model: 'haiku'
        }
      },
      {
        id: 'fork',
        label: 'Fan Out',
        position: { x: 300, y: 240 },
        data: { type: 'parallel' }
      },
      {
        id: 'market',
        label: 'Market Trends',
        position: { x: 540, y: 60 },
        data: {
          type: 'prompt',
          prompt:
            'Research current market trends for: {{input.topic}}.\nAudience context: {{input.audience}}.\n\nProduce 4-6 concise bullets with recent signals (growth, funding, adoption, regulation). No fluff.',
          systemPrompt: 'You are a market analyst. Be specific, cite verifiable trends, avoid speculation.',
          model: 'sonnet',
          allowedTools: ['WebFetch', 'WebSearch', 'Read'],
          setVars: [{ name: 'market', extractor: '' }]
        }
      },
      {
        id: 'competitors',
        label: 'Competitors',
        position: { x: 540, y: 240 },
        data: {
          type: 'prompt',
          prompt:
            'Identify the top 3-5 competitors in the {{input.topic}} space relevant to {{input.audience}}. For each: one-line positioning, pricing tier (if known), and a concrete differentiator.',
          systemPrompt: 'You are a competitive intelligence analyst. Name real companies; skip any you are uncertain about.',
          model: 'sonnet',
          allowedTools: ['WebFetch', 'WebSearch'],
          setVars: [{ name: 'competitors', extractor: '' }]
        }
      },
      {
        id: 'painpoints',
        label: 'Customer Pain',
        position: { x: 540, y: 420 },
        data: {
          type: 'prompt',
          prompt:
            'What are the top 3-5 pain points the following audience has in this space?\n\nTopic: {{input.topic}}\nAudience: {{input.audience}}\n\nOutput as bullets: "Pain — one-line symptom the buyer feels."',
          systemPrompt: 'Ground the pain points in behaviors / workflows, not vague sentiments.',
          model: 'sonnet',
          setVars: [{ name: 'painpoints', extractor: '' }]
        }
      },
      {
        id: 'join',
        label: 'Consolidate',
        position: { x: 820, y: 240 },
        data: { type: 'join', separator: '\n\n--- NEXT ANGLE ---\n\n' }
      },
      {
        id: 'review',
        label: 'Human Review',
        position: { x: 1060, y: 240 },
        data: {
          type: 'humanReview',
          message:
            'Sanity-check the three research angles before we synthesize. Approve to generate the brief; reject to stop and revisit.'
        }
      },
      {
        id: 'brief',
        label: 'Executive Brief',
        position: { x: 1300, y: 240 },
        data: {
          type: 'prompt',
          prompt:
            'Write a 1-page executive research brief on "{{input.topic}}" for "{{input.audience}}".\n\nUse these findings (captured as variables):\n\nMarket Trends:\n{{vars.market}}\n\nCompetitive Landscape:\n{{vars.competitors}}\n\nCustomer Pain Points:\n{{vars.painpoints}}\n\nStructure:\n1. TL;DR (3 sentences)\n2. Market signals\n3. Competitive positioning\n4. Highest-leverage pain points\n5. Recommended next step\n\nBe concrete. No filler.',
          systemPrompt:
            'Write like a strategy consultant, not a marketer. Precise, structured, no buzzwords.',
          model: 'sonnet'
        }
      }
    ],
    edges: [
      { id: 'e-plan-fork', source: 'plan', target: 'fork' },
      { id: 'e-fork-market', source: 'fork', target: 'market' },
      { id: 'e-fork-comp', source: 'fork', target: 'competitors' },
      { id: 'e-fork-pain', source: 'fork', target: 'painpoints' },
      { id: 'e-market-join', source: 'market', target: 'join' },
      { id: 'e-comp-join', source: 'competitors', target: 'join' },
      { id: 'e-pain-join', source: 'painpoints', target: 'join' },
      { id: 'e-join-review', source: 'join', target: 'review' },
      { id: 'e-review-brief', source: 'review', target: 'brief' }
    ]
  }
}

function auditReusableTemplate(): WorkflowDefinition {
  return {
    id: 'template-audit-reusable',
    name: 'Parallel Audit (Reusable Sub-flow)',
    description:
      'Read-only parallel audit: runs security, performance, and style reviews in parallel, joins the reports, and captures the consolidated findings into the variable "audit_findings". Designed to be called by other workflows via a Sub-flow node.',
    isTemplate: true,
    createdAt: 0,
    updatedAt: 0,
    inputs: [
      {
        key: 'target',
        label: 'Target to audit',
        placeholder: 'e.g. a list of files, a diff, or a description of scope',
        defaultValue: 'the files changed on the current branch (git diff --name-only)'
      }
    ],
    nodes: [
      {
        id: 'fork',
        label: 'Fork Reviewers',
        position: { x: 60, y: 220 },
        data: { type: 'parallel' }
      },
      {
        id: 'security',
        label: 'Security',
        position: { x: 300, y: 60 },
        data: {
          type: 'prompt',
          prompt:
            'Audit the following target for security issues (injection, auth, unsafe eval, secrets, path traversal). Output a bulleted list of findings with file:line references where possible. If nothing found, say "No security issues found."\n\nTarget:\n{{input.target}}',
          model: 'sonnet',
          allowedTools: ['Read', 'Grep', 'Glob']
        }
      },
      {
        id: 'perf',
        label: 'Performance',
        position: { x: 300, y: 220 },
        data: {
          type: 'prompt',
          prompt:
            'Audit the following target for performance issues (N+1 queries, large allocations, render thrash, sync I/O on hot paths). Output a bulleted list. If nothing found, say "No performance issues found."\n\nTarget:\n{{input.target}}',
          model: 'sonnet',
          allowedTools: ['Read', 'Grep', 'Glob']
        }
      },
      {
        id: 'style',
        label: 'Style',
        position: { x: 300, y: 380 },
        data: {
          type: 'prompt',
          prompt:
            'Audit the following target for style / naming / readability issues. Output a bulleted list. If nothing found, say "No style issues found."\n\nTarget:\n{{input.target}}',
          model: 'haiku',
          allowedTools: ['Read']
        }
      },
      {
        id: 'join',
        label: 'Consolidate',
        position: { x: 560, y: 220 },
        data: { type: 'join', separator: '\n\n=== NEXT SECTION ===\n\n' }
      },
      {
        id: 'capture',
        label: 'Capture Findings',
        position: { x: 820, y: 220 },
        data: {
          type: 'prompt',
          prompt:
            'Return the following audit report verbatim — do not add commentary, do not summarize, do not edit. This output is captured into the parent workflow\'s variables.\n\n---\n{{prev.output}}\n---',
          model: 'haiku',
          setVars: [{ name: 'audit_findings', extractor: '' }]
        }
      }
    ],
    edges: [
      { id: 'e-fork-sec', source: 'fork', target: 'security' },
      { id: 'e-fork-perf', source: 'fork', target: 'perf' },
      { id: 'e-fork-style', source: 'fork', target: 'style' },
      { id: 'e-sec-join', source: 'security', target: 'join' },
      { id: 'e-perf-join', source: 'perf', target: 'join' },
      { id: 'e-style-join', source: 'style', target: 'join' },
      { id: 'e-join-capture', source: 'join', target: 'capture' }
    ]
  }
}

function weeklyRepoDigestTemplate(): WorkflowDefinition {
  return {
    id: 'template-weekly-repo-digest',
    name: 'Weekly Repo Digest (Phase 3 Showcase)',
    description:
      'Demonstrates sub-workflows, triggers, and metrics. Calls the Parallel Code Audit sub-workflow on this week\'s changes, captures its findings, and drafts a Friday digest. Ships with a disabled Friday-5pm cron trigger — flip it on in the Triggers tab.',
    isTemplate: true,
    createdAt: 0,
    updatedAt: 0,
    inputs: [
      {
        key: 'repo_label',
        label: 'Repo label (for the digest header)',
        placeholder: 'e.g. "coide"',
        defaultValue: 'this repo'
      }
    ],
    triggers: [
      {
        id: 'trg-weekly-cron',
        type: 'cron',
        enabled: false,
        name: 'Friday 5pm digest',
        schedule: '0 17 * * 5',
        cwd: ''
      }
    ],
    nodes: [
      {
        id: 'week_commits',
        label: 'List This Week\'s Commits',
        position: { x: 40, y: 200 },
        data: {
          type: 'script',
          command: 'git log --since="7 days ago" --pretty=format:"- %h %s" --no-merges | head -40'
        }
      },
      {
        id: 'scope',
        label: 'Summarize Changes',
        position: { x: 320, y: 200 },
        data: {
          type: 'prompt',
          prompt:
            'Here are this week\'s commits for {{input.repo_label}}:\n\n{{prev.output}}\n\nIn 3-5 bullets, describe what shipped this week. No prose, no hype — just what changed.',
          model: 'haiku',
          setVars: [{ name: 'changes', extractor: '' }]
        }
      },
      {
        id: 'audit',
        label: 'Audit via Sub-flow',
        position: { x: 620, y: 200 },
        data: {
          type: 'subworkflow',
          workflowId: 'template-audit-reusable',
          inputMapping: {
            target: '{{vars.changes}}'
          },
          captureVars: ['audit_findings']
        }
      },
      {
        id: 'digest',
        label: 'Draft Friday Digest',
        position: { x: 920, y: 200 },
        data: {
          type: 'prompt',
          prompt:
            'Draft a concise Friday digest for {{input.repo_label}}.\n\nWhat shipped:\n{{vars.changes}}\n\nConsolidated audit findings (from sub-workflow):\n{{vars.audit_findings}}\n\nStructure:\n1. This week in 3 bullets\n2. Top 2 audit findings worth attention\n3. One question to bring to Monday standup\n\nKeep it under 200 words. No buzzwords.',
          systemPrompt:
            'Write for engineers, not managers. Precise, concrete, concise. No filler.',
          model: 'sonnet',
          setVars: [{ name: 'digest', extractor: '' }]
        }
      }
    ],
    edges: [
      { id: 'e-commits-scope', source: 'week_commits', target: 'scope' },
      { id: 'e-scope-audit', source: 'scope', target: 'audit' },
      { id: 'e-audit-digest', source: 'audit', target: 'digest' }
    ]
  }
}
