import { create } from 'zustand'
import type {
  WorkflowDefinition,
  WorkflowExecutionState,
  WorkflowNodeRunState
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

  // Selected node (for config panel)
  selectedNodeId: string | null
  setSelectedNodeId: (id: string | null) => void

  // Saved workflow list
  workflows: WorkflowDefinition[]
  setWorkflows: (wfs: WorkflowDefinition[]) => void
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

  selectedNodeId: null,
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),

  workflows: [],
  setWorkflows: (wfs) => set({ workflows: wfs })
}))
