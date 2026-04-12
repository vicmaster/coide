import { readdir, readFile, writeFile, unlink, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { WorkflowDefinition } from '../shared/workflow-types'

const WORKFLOW_DIR = join(homedir(), '.coide', 'workflows')

async function ensureDir(): Promise<void> {
  if (!existsSync(WORKFLOW_DIR)) {
    await mkdir(WORKFLOW_DIR, { recursive: true })
  }
}

export async function listWorkflows(): Promise<WorkflowDefinition[]> {
  await ensureDir()
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
  if (!existsSync(filePath)) return null
  const raw = await readFile(filePath, 'utf-8')
  return JSON.parse(raw)
}

export async function saveWorkflow(wf: WorkflowDefinition): Promise<void> {
  await ensureDir()
  wf.updatedAt = Date.now()
  await writeFile(join(WORKFLOW_DIR, `${wf.id}.json`), JSON.stringify(wf, null, 2), 'utf-8')
}

export async function deleteWorkflow(id: string): Promise<void> {
  const filePath = join(WORKFLOW_DIR, `${id}.json`)
  if (existsSync(filePath)) {
    await unlink(filePath)
  }
}

// --- Built-in Templates ---

export function getBuiltInTemplates(): WorkflowDefinition[] {
  return [prReviewTemplate(), bugFixTemplate(), leadResearchTemplate()]
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
      { id: 'e-check-fix', source: 'has_issues', target: 'fix', label: 'yes' },
      { id: 'e-check-approve', source: 'has_issues', target: 'approve', label: 'no' }
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
      { id: 'e-check-done', source: 'check_pass', target: 'done', label: 'yes' }
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
