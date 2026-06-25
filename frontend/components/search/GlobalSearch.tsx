import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { useToast } from '../../contexts/ToastContext'

interface SearchResult {
  id: string
  type: 'page' | 'product' | 'user' | 'transaction'
  title: string
  description?: string
  url: string
}

export function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const toast = useToast()

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      inputRef.current?.focus()
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // 键盘快捷键 (Ctrl/Cmd + K)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault()
        setIsOpen(true)
      }
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  const performSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([])
      return
    }

    setIsSearching(true)

    try {
      // 调用实际的搜索API
      const { searchApi } = await import('../../lib/api/search.api')
      const response = await searchApi.search(searchQuery, { limit: 10 })
      setResults(response.results)
      return

      // 降级到模拟搜索（如果API失败）
      await new Promise(resolve => setTimeout(resolve, 300))
      
      const mockResults: SearchResult[] = [
        {
          id: '1',
          type: 'page' as const,
          title: '支付页面',
          description: '查看支付相关功能',
          url: '/pay/agent',
        },
        {
          id: '2',
          type: 'product' as const,
          title: '产品管理',
          description: '管理您的产品',
          url: '/app/merchant/products',
        },
        {
          id: '3',
          type: 'transaction' as const,
          title: '交易记录',
          description: '查看交易历史',
          url: '/app/user/transactions',
        },
      ].filter(item => 
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )

      setResults(mockResults)
    } catch (error) {
      console.error('搜索失败:', error)
      toast.error('搜索失败，请重试')
    } finally {
      setIsSearching(false)
    }
  }

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      performSearch(query)
    }, 300)

    return () => clearTimeout(debounceTimer)
  }, [query])

  const handleResultClick = (result: SearchResult) => {
    setIsOpen(false)
    setQuery('')
    router.push(result.url)
  }

  const getResultIcon = (type: SearchResult['type']) => {
    switch (type) {
      case 'page':
        return '📄'
      case 'product':
        return '🛒'
      case 'user':
        return '👤'
      case 'transaction':
        return '💳'
      default:
        return '🔍'
    }
  }

  return (
    <div className="relative" ref={searchRef}>
      {/* Search Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="hidden md:flex items-center space-x-2 px-4 py-2 bg-gray-100 rounded-lg text-gray-600 hover:bg-gray-200 transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="text-sm text-gray-500">搜索...</span>
        <kbd className="hidden lg:inline-flex items-center px-2 py-1 text-xs font-semibold text-gray-500 bg-white border border-gray-200 rounded">
          ⌘K
        </kbd>
      </button>

      {/* Mobile Search Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="md:hidden p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100"
        aria-label="搜索"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </button>

      {/* Search Modal */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="fixed top-20 left-1/2 transform -translate-x-1/2 w-full max-w-2xl mx-4 bg-white rounded-lg shadow-xl z-50">
            {/* Search Input */}
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center space-x-3">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索页面、产品、交易..."
                  className="flex-1 outline-none text-gray-900 placeholder-gray-400 bg-transparent"
                  style={{ color: '#111827' }}
                />
                {isSearching && (
                  <svg className="animate-spin h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Search Results */}
            <div className="max-h-96 overflow-y-auto">
              {query.trim() === '' ? (
                <div className="px-4 py-8 text-center text-gray-500">
                  <div className="text-4xl mb-2">🔍</div>
                  <p>输入关键词开始搜索</p>
                  <p className="text-xs mt-2 text-gray-400">使用 Ctrl+K 或 Cmd+K 快速打开搜索</p>
                </div>
              ) : results.length === 0 && !isSearching ? (
                <div className="px-4 py-8 text-center text-gray-500">
                  <div className="text-4xl mb-2">🔎</div>
                  <p>未找到相关结果</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {results.map((result) => (
                    <button
                      key={result.id}
                      onClick={() => handleResultClick(result)}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <span className="text-xl">{getResultIcon(result.type)}</span>
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{result.title}</div>
                          {result.description && (
                            <div className="text-sm text-gray-500 mt-1">{result.description}</div>
                          )}
                        </div>
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

