import { create } from 'zustand'
import type {
  WorkflowDefinition,
  WorkflowExecutionState,
  WorkflowNodeRunState,
  WorkflowExecutionRecord,
  ReviewRequest
} from '../../../shared/workflow-types'

type WorkflowStore = {
  // View
  isCanvasOpen: boolean
  openCanvas: () => void
  closeCanvas: () => void

  // Current workflow being edited
  currentWorkflow: WorkflowDefinition | null
  setCurrentWorkflow: (wf: WorkflowDefinition | null) => void
  updateCurrentWorkflow: (patch: Partial<WorkflowDefinition>) => void

  // Execution
  execution: WorkflowExecutionState | null
  setExecution: (exec: WorkflowExecutionState | null) => void
  updateNodeState: (nodeId: string, patch: Partial<WorkflowNodeRunState>) => void
  setVariable: (name: string, value: string) => void

  // Review queue
  reviewQueue: ReviewRequest[]
  pushReview: (req: ReviewRequest) => void
  popReview: (nodeId: string) => void

  // Selected node (for config panel)
  selectedNodeId: string | null
  setSelectedNodeId: (id: string | null) => void

  // Saved workflow list
  workflows: WorkflowDefinition[]
  setWorkflows: (wfs: WorkflowDefinition[]) => void

  // Execution history
  executions: WorkflowExecutionRecord[]
  setExecutions: (recs: WorkflowExecutionRecord[]) => void
}

export const useWorkflowStore = create<WorkflowStore>()((set) => ({
  isCanvasOpen: false,
  openCanvas: () => set({ isCanvasOpen: true }),
  closeCanvas: () => set({ isCanvasOpen: false, selectedNodeId: null }),

  currentWorkflow: null,
  setCurrentWorkflow: (wf) => set({ currentWorkflow: wf, selectedNodeId: null }),
  updateCurrentWorkflow: (patch) =>
    set((state) => ({
      currentWorkflow: state.currentWorkflow
        ? { ...state.currentWorkflow, ...patch }
        : null
    })),

  execution: null,
  setExecution: (exec) => set({ execution: exec }),
  updateNodeState: (nodeId, patch) =>
    set((state) => {
      if (!state.execution) return state
      const prev = state.execution.nodeStates[nodeId] ?? {
        nodeId,
        status: 'idle'
      }
      return {
        execution: {
          ...state.execution,
          nodeStates: {
            ...state.execution.nodeStates,
            [nodeId]: { ...prev, ...patch }
          }
        }
      }
    }),
  setVariable: (name, value) =>
    set((state) => {
      if (!state.execution) return state
      return {
        execution: {
          ...state.execution,
          vars: { ...(state.execution.vars ?? {}), [name]: value }
        }
      }
    }),

  reviewQueue: [],
  pushReview: (req) => set((state) => ({ reviewQueue: [...state.reviewQueue, req] })),
  popReview: (nodeId) =>
    set((state) => ({ reviewQueue: state.reviewQueue.filter((r) => r.nodeId !== nodeId) })),

  selectedNodeId: null,
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),

  workflows: [],
  setWorkflows: (wfs) => set({ workflows: wfs }),

  executions: [],
  setExecutions: (recs) => set({ executions: recs })
}))
