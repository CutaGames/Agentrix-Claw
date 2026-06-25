import { useState } from 'react'
import { useCurrency } from '../../contexts/CurrencyContext'

export function CurrencySelector() {
  const { currency, availableCurrencies, setCurrency } = useCurrency()
  const [open, setOpen] = useState(false)

  const current = availableCurrencies.find((c) => c.code === currency)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center space-x-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 shadow-sm transition-colors hover:border-gray-300 hover:text-gray-900"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span role="img" aria-label="currency">
          💱
        </span>
        <span>{currency}</span>
        <svg
          className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-44 rounded-lg border border-gray-100 bg-white py-1 shadow-lg">
          {availableCurrencies.map((meta) => (
            <button
              key={meta.code}
              onClick={() => {
                setCurrency(meta.code)
                setOpen(false)
              }}
              className={`flex w-full items-center justify-between px-3 py-2 text-sm ${
                currency === meta.code ? 'text-blue-600 font-semibold' : 'text-gray-600'
              } hover:bg-gray-50`}
              role="option"
              aria-selected={currency === meta.code}
            >
              <span>{meta.label}</span>
              {currency === meta.code && (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}


