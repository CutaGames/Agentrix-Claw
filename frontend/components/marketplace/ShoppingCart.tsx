import { useState } from 'react'
import { useCart } from '../../contexts/CartContext'
import { useLocalization } from '../../contexts/LocalizationContext'

export function ShoppingCart() {
  const { itemCount, total, currency, items, removeItem, clearCart } = useCart()
  const { t } = useLocalization()
  const [isOpen, setIsOpen] = useState(false)

  if (itemCount === 0 && !isOpen) return null

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-8 right-8 z-50 flex items-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-white shadow-lg transition-transform hover:scale-105 hover:bg-blue-700"
      >
        <span>🛒</span>
        <span className="font-bold">{itemCount}</span>
        {itemCount > 0 && (
          <span className="ml-1 text-sm opacity-90">
            {currency} {total.toFixed(2)}
          </span>
        )}
      </button>

      {/* Cart Panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-8 z-50 w-96 rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">{t({ zh: '购物车', en: 'Shopping Cart' })}</h3>
            <button onClick={() => clearCart()} className="text-xs text-red-500 hover:underline">
              {t({ zh: '清空', en: 'Clear' })}
            </button>
          </div>

          {items.length === 0 ? (
            <p className="py-8 text-center text-slate-500">{t({ zh: '购物车是空的', en: 'Cart is empty' })}</p>
          ) : (
            <div className="max-h-96 space-y-4 overflow-y-auto">
              {items.map((item) => (
                <div key={item.productId} className="flex items-start justify-between border-b border-slate-100 pb-4">
                  <div>
                    <p className="font-medium text-slate-900">{item.product?.name || 'Product'}</p>
                    <p className="text-sm text-slate-500">
                      {item.quantity} x {currency} {item.product?.price}
                    </p>
                  </div>
                  <button
                    onClick={() => removeItem(item.productId)}
                    className="text-slate-400 hover:text-red-500"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="mb-4 flex justify-between text-lg font-bold text-slate-900">
              <span>{t({ zh: '总计', en: 'Total' })}</span>
              <span>{currency} {total.toFixed(2)}</span>
            </div>
            <button className="w-full rounded-lg bg-blue-600 py-3 font-bold text-white hover:bg-blue-700">
              {t({ zh: '去结算', en: 'Checkout' })}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
