import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { ViewMode } from '../types/agent';

/* ── localStorage helpers (SSR-safe) ── */
const STORAGE_PREFIX = 'agentrix_wb_';
function loadItem<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try { const v = localStorage.getItem(STORAGE_PREFIX + key); return v !== null ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function saveItem<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value)); } catch { /* quota */ }
}

interface WorkbenchContextType {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  selection: string[];
  setSelection: (ids: string[]) => void;
  workspaceData: any;
  setWorkspaceData: (data: any) => void;
  isChatExpanded: boolean;
  setIsChatExpanded: (expanded: boolean) => void;
}

const WorkbenchContext = createContext<WorkbenchContextType | undefined>(undefined);

export const WorkbenchProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [viewMode, _setViewMode] = useState<ViewMode>(() => loadItem<ViewMode>('viewMode', 'chat'));
  const [selection, setSelection] = useState<string[]>([]);
  const [workspaceData, setWorkspaceData] = useState<any>(null);
  const [isChatExpanded, _setIsChatExpanded] = useState<boolean>(() => loadItem<boolean>('chatExpanded', true));

  // Persist viewMode & isChatExpanded changes to localStorage
  const setViewMode = useCallback((m: ViewMode) => { _setViewMode(m); saveItem('viewMode', m); }, []);
  const setIsChatExpanded = useCallback((v: boolean) => { _setIsChatExpanded(v); saveItem('chatExpanded', v); }, []);

  return (
    <WorkbenchContext.Provider
      value={{
        viewMode,
        setViewMode,
        selection,
        setSelection,
        workspaceData,
        setWorkspaceData,
        isChatExpanded,
        setIsChatExpanded,
      }}
    >
      {children}
    </WorkbenchContext.Provider>
  );
};

export const useWorkbench = () => {
  const context = useContext(WorkbenchContext);
  if (context === undefined) {
    throw new Error('useWorkbench must be used within a WorkbenchProvider');
  }
  return context;
};
