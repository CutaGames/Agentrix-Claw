/**
 * 购物车全局状态管理
 * 
 * 功能:
 * - 管理购物车商品列表
 * - 持久化到localStorage
 * - 与后端API同步
 * - 提供便捷的购物车操作方法
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { cartApi, Cart, CartWithProducts } from '../lib/api/cart.api'
import { useUser } from './UserContext'

export interface CartItem {
  productId: string
  quantity: number
  addedAt: string
  // 扩展字段，用于显示
  product?: {
    id: string
    name: string
    description?: string
    price: number
    currency: string
    stock: number
    image?: string
    category?: string
    merchantId?: string
  }
}

interface CartContextType {
  // 状态
  items: CartItem[]
  loading: boolean
  error: string | null
  itemCount: number
  total: number
  currency: string
  
  // 操作方法
  addItem: (productId: string, quantity?: number, product?: CartItem['product']) => Promise<void>
  removeItem: (productId: string) => Promise<void>
  updateQuantity: (productId: string, quantity: number) => Promise<void>
  clearCart: () => Promise<void>
  refreshCart: () => Promise<void>
  
  // 便捷方法
  isInCart: (productId: string) => boolean
  getItemQuantity: (productId: string) => number
}

const CartContext = createContext<CartContextType | null>(null)

const CART_STORAGE_KEY = 'agentrix_cart'

interface CartProviderProps {
  children: ReactNode
}

export function CartProvider({ children }: CartProviderProps) {
  const { user } = useUser()
  const [items, setItems] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 计算商品总数
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0)
  
  // 计算总价（使用第一个商品的货币单位）
  const currency = items[0]?.product?.currency || 'CNY'
  const total = items.reduce((sum, item) => {
    const price = item.product?.price || 0
    return sum + price * item.quantity
  }, 0)

  // 从本地存储加载购物车
  const loadFromStorage = useCallback(() => {
    try {
      const stored = localStorage.getItem(CART_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        setItems(parsed.items || [])
      }
    } catch (e) {
      console.error('加载本地购物车失败:', e)
    }
  }, [])

  // 保存到本地存储
  const saveToStorage = useCallback((cartItems: CartItem[]) => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ items: cartItems }))
    } catch (e) {
      console.error('保存本地购物车失败:', e)
    }
  }, [])

  // 从API刷新购物车
  const refreshCart = useCallback(async () => {
    if (!user) {
      // 未登录用户使用本地存储
      loadFromStorage()
      return
    }

    try {
      setLoading(true)
      setError(null)
      const cartData = await cartApi.getCartWithProducts()
      const cartItems: CartItem[] = (cartData.items || []).map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        addedAt: new Date().toISOString(),
        product: item.product,
      }))
      setItems(cartItems)
      saveToStorage(cartItems)
    } catch (e: any) {
      console.error('刷新购物车失败:', e)
      // 如果API失败，尝试从本地存储加载
      loadFromStorage()
    } finally {
      setLoading(false)
    }
  }, [user, loadFromStorage, saveToStorage])

  // 初始化加载
  useEffect(() => {
    refreshCart()
  }, [refreshCart])

  // 添加商品
  const addItem = useCallback(async (
    productId: string, 
    quantity: number = 1,
    product?: CartItem['product']
  ) => {
    try {
      setLoading(true)
      setError(null)

      // 检查是否已在购物车中
      const existingIndex = items.findIndex(item => item.productId === productId)
      let newItems: CartItem[]

      if (existingIndex >= 0) {
        // 更新数量
        newItems = items.map((item, index) => {
          if (index === existingIndex) {
            return { ...item, quantity: item.quantity + quantity }
          }
          return item
        })
      } else {
        // 添加新商品
        const newItem: CartItem = {
          productId,
          quantity,
          addedAt: new Date().toISOString(),
          product,
        }
        newItems = [...items, newItem]
      }

      // 更新本地状态
      setItems(newItems)
      saveToStorage(newItems)

      // 如果已登录，同步到后端
      if (user) {
        try {
          await cartApi.addItem(productId, quantity)
        } catch (e) {
          console.error('同步购物车到后端失败:', e)
          // 不影响本地操作
        }
      }
    } catch (e: any) {
      setError(e.message || '添加商品失败')
      throw e
    } finally {
      setLoading(false)
    }
  }, [items, user, saveToStorage])

  // 移除商品
  const removeItem = useCallback(async (productId: string) => {
    try {
      setLoading(true)
      setError(null)

      const newItems = items.filter(item => item.productId !== productId)
      setItems(newItems)
      saveToStorage(newItems)

      // 如果已登录，同步到后端
      if (user) {
        try {
          await cartApi.removeItem(productId)
        } catch (e) {
          console.error('同步移除操作到后端失败:', e)
        }
      }
    } catch (e: any) {
      setError(e.message || '移除商品失败')
      throw e
    } finally {
      setLoading(false)
    }
  }, [items, user, saveToStorage])

  // 更新数量
  const updateQuantity = useCallback(async (productId: string, quantity: number) => {
    if (quantity <= 0) {
      return removeItem(productId)
    }

    try {
      setLoading(true)
      setError(null)

      const newItems = items.map(item => {
        if (item.productId === productId) {
          return { ...item, quantity }
        }
        return item
      })
      setItems(newItems)
      saveToStorage(newItems)

      // 如果已登录，同步到后端
      if (user) {
        try {
          await cartApi.updateItemQuantity(productId, quantity)
        } catch (e) {
          console.error('同步数量更新到后端失败:', e)
        }
      }
    } catch (e: any) {
      setError(e.message || '更新数量失败')
      throw e
    } finally {
      setLoading(false)
    }
  }, [items, user, saveToStorage, removeItem])

  // 清空购物车
  const clearCart = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      setItems([])
      saveToStorage([])

      // 如果已登录，同步到后端
      if (user) {
        try {
          await cartApi.clearCart()
        } catch (e) {
          console.error('同步清空购物车到后端失败:', e)
        }
      }
    } catch (e: any) {
      setError(e.message || '清空购物车失败')
      throw e
    } finally {
      setLoading(false)
    }
  }, [user, saveToStorage])

  // 检查商品是否在购物车中
  const isInCart = useCallback((productId: string) => {
    return items.some(item => item.productId === productId)
  }, [items])

  // 获取商品在购物车中的数量
  const getItemQuantity = useCallback((productId: string) => {
    const item = items.find(item => item.productId === productId)
    return item?.quantity || 0
  }, [items])

  return (
    <CartContext.Provider
      value={{
        items,
        loading,
        error,
        itemCount,
        total,
        currency,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        refreshCart,
        isInCart,
        getItemQuantity,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return context
}

// 导出便捷hook用于只读取购物车数量（用于导航栏等）
export function useCartCount() {
  const context = useContext(CartContext)
  return context?.itemCount || 0
}
