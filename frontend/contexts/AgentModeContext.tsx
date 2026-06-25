import {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  ReactNode,
  Dispatch,
  SetStateAction,
} from 'react'

export type AgentMode = 'personal' | 'merchant' | 'developer'

interface AgentModeContextValue {
  mode: AgentMode
  setMode: (newMode: AgentMode) => void
  trySetMode: (newMode: AgentMode, userRoles?: string[]) => { success: boolean; reason?: string }
  currentAgentId?: string
  setCurrentAgentId: Dispatch<SetStateAction<string | undefined>>
  accessDenied: { mode: AgentMode; reason: string } | null
  clearAccessDenied: () => void
}

const AgentModeContext = createContext<AgentModeContextValue | null>(null)

export function AgentModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AgentMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('agentrix_active_mode')
      if (saved === 'personal' || saved === 'merchant' || saved === 'developer') {
        return saved as AgentMode
      }
    }
    return 'personal'
  })
  const [currentAgentId, setCurrentAgentId] = useState<string | undefined>(undefined)
  const [accessDenied, setAccessDenied] = useState<{ mode: AgentMode; reason: string } | null>(null)

  const clearAccessDenied = useCallback(() => {
    setAccessDenied(null)
  }, [])

  const handleSetMode = useCallback((newMode: AgentMode) => {
    setMode(newMode)
    if (typeof window !== 'undefined') {
      localStorage.setItem('agentrix_active_mode', newMode)
    }
  }, [])

  const trySetMode = useCallback((newMode: AgentMode, userRoles?: string[]) => {
    // Personal mode is always accessible
    if (newMode === 'personal') {
      handleSetMode(newMode)
      setAccessDenied(null)
      return { success: true }
    }

    // Check roles for merchant mode
    if (newMode === 'merchant') {
      if (userRoles && userRoles.includes('merchant')) {
        handleSetMode(newMode)
        setAccessDenied(null)
        return { success: true }
      }
      setAccessDenied({ 
        mode: 'merchant', 
        reason: '您需要注册成为商户才能使用商户工作台。请前往设置完成商户注册。' 
      })
      return { success: false, reason: 'merchant_registration_required' }
    }

    // Check roles for developer mode
    if (newMode === 'developer') {
      if (userRoles && (userRoles.includes('agent') || userRoles.includes('developer'))) {
        handleSetMode(newMode)
        setAccessDenied(null)
        return { success: true }
      }
      setAccessDenied({ 
        mode: 'developer', 
        reason: '您需要注册成为开发者才能使用开发者工作台。请前往设置完成开发者注册。' 
      })
      return { success: false, reason: 'developer_registration_required' }
    }

    return { success: false, reason: 'unknown_mode' }
  }, [handleSetMode])

  const value = useMemo(
    () => ({
      mode,
      setMode: handleSetMode,
      trySetMode,
      currentAgentId,
      setCurrentAgentId,
      accessDenied,
      clearAccessDenied,
    }),
    [mode, handleSetMode, trySetMode, currentAgentId, accessDenied, clearAccessDenied]
  )

  return <AgentModeContext.Provider value={value}>{children}</AgentModeContext.Provider>
}

export function useAgentMode() {
  const context = useContext(AgentModeContext)
  if (!context) {
    throw new Error('useAgentMode must be used within an AgentModeProvider')
  }
  return context
}

