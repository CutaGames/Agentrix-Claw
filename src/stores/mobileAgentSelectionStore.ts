import { create } from 'zustand';

const SAFE_AGENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/;

interface MobileAgentSelectionState {
  /** Presentation selection only. This never changes the canonical Primary Agent. */
  selectedAgentId?: string;
  selectionEpoch: number;
  selectAgent: (agentId: string) => boolean;
  clearSelection: () => void;
}

export const useMobileAgentSelectionStore = create<MobileAgentSelectionState>((set) => ({
  selectedAgentId: undefined,
  selectionEpoch: 0,
  selectAgent: (agentId) => {
    if (!SAFE_AGENT_ID.test(agentId)) return false;
    set((state) => ({
      selectedAgentId: agentId,
      selectionEpoch: state.selectionEpoch + 1,
    }));
    return true;
  },
  clearSelection: () => set((state) => ({
    selectedAgentId: undefined,
    selectionEpoch: state.selectionEpoch + 1,
  })),
}));
