import { createContext, useContext, ReactNode, useState, useCallback, useRef } from 'react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  type: ToastType
  message: string
  duration?: number
}

interface ToastContextType {
  toasts: Toast[]
  showToast: (type: ToastType, message: string, duration?: number) => void
  removeToast: (id: string) => void
  success: (message: string, duration?: number) => void
  error: (message: string, duration?: number) => void
  warning: (message: string, duration?: number) => void
  info: (message: string, duration?: number) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const recentToastRef = useRef<Map<string, number>>(new Map())

  const showToast = useCallback((type: ToastType, message: string, duration = 3000) => {
    const dedupeKey = `${type}:${message}`
    const now = Date.now()
    const lastShownAt = recentToastRef.current.get(dedupeKey)

    if (lastShownAt && now - lastShownAt < 4000) {
      return
    }

    recentToastRef.current.set(dedupeKey, now)

    const id = Math.random().toString(36).substring(2, 9)
    const toast: Toast = { id, type, message, duration }
    
    setToasts(prev => [...prev, toast])

    // 自动移除
    if (duration > 0) {
      setTimeout(() => {
        recentToastRef.current.delete(dedupeKey)
        removeToast(id)
      }, duration)
    } else {
      setTimeout(() => {
        recentToastRef.current.delete(dedupeKey)
      }, 4000)
    }
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }, [])

  const success = useCallback((message: string, duration?: number) => {
    showToast('success', message, duration)
  }, [showToast])

  const error = useCallback((message: string, duration?: number) => {
    showToast('error', message, duration)
  }, [showToast])

  const warning = useCallback((message: string, duration?: number) => {
    showToast('warning', message, duration)
  }, [showToast])

  const info = useCallback((message: string, duration?: number) => {
    showToast('info', message, duration)
  }, [showToast])

  return (
    <ToastContext.Provider
      value={{
        toasts,
        showToast,
        removeToast,
        success,
        error,
        warning,
        info,
      }}
    >
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

function ToastContainer({ toasts, removeToast }: { toasts: Toast[]; removeToast: (id: string) => void }) {
  return (
    <div className="fixed top-4 right-4 md:right-4 md:left-auto left-4 toast-container z-50 space-y-2 pointer-events-none">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
  }

  const colors = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  }

  return (
    <div
      className={`min-w-[300px] md:min-w-[300px] w-full md:w-auto max-w-md px-4 py-3 rounded-lg border shadow-lg pointer-events-auto animate-slide-in-right toast-item ${colors[toast.type]}`}
      role="alert"
    >
      <div className="flex items-start space-x-3">
        <span className="text-xl flex-shrink-0">{icons[toast.type]}</span>
        <div className="flex-1">
          <p className="text-sm font-medium">{toast.message}</p>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="关闭"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

