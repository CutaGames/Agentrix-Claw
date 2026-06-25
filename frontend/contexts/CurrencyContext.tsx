import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type SupportedCurrency = 'USD' | 'CNY' | 'EUR' | 'SGD' | 'JPY' | 'GBP' | 'INR'

interface CurrencyMeta {
  code: SupportedCurrency
  label: string
  symbol: string
  locale: string
  usdPerUnit: number
}

const currencyMetaList: CurrencyMeta[] = [
  { code: 'USD', label: 'USD · US Dollar', symbol: '$', locale: 'en-US', usdPerUnit: 1 },
  { code: 'CNY', label: 'CNY · 人民币', symbol: '¥', locale: 'zh-CN', usdPerUnit: 0.14 },
  { code: 'EUR', label: 'EUR · Euro', symbol: '€', locale: 'de-DE', usdPerUnit: 1.08 },
  { code: 'SGD', label: 'SGD · Singapore Dollar', symbol: 'S$', locale: 'en-SG', usdPerUnit: 0.74 },
  { code: 'JPY', label: 'JPY · 日元', symbol: '¥', locale: 'ja-JP', usdPerUnit: 0.0068 },
  { code: 'GBP', label: 'GBP · Pound Sterling', symbol: '£', locale: 'en-GB', usdPerUnit: 1.27 },
  { code: 'INR', label: 'INR · भारतीय रुपया', symbol: '₹', locale: 'en-IN', usdPerUnit: 0.012 },
]

const metaMap = currencyMetaList.reduce<Record<SupportedCurrency, CurrencyMeta>>((acc, meta) => {
  acc[meta.code] = meta
  return acc
}, {} as Record<SupportedCurrency, CurrencyMeta>)

interface FormatOptions {
  fromCurrency?: SupportedCurrency
  toCurrency?: SupportedCurrency
  maximumFractionDigits?: number
}

interface CurrencyContextValue {
  currency: SupportedCurrency
  availableCurrencies: CurrencyMeta[]
  setCurrency: (currency: SupportedCurrency) => void
  convert: (amount: number, fromCurrency?: SupportedCurrency, toCurrency?: SupportedCurrency) => number
  format: (amount: number, options?: FormatOptions) => string
}

const STORAGE_KEY = 'agentrix_currency'

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: 'CNY',
  availableCurrencies: currencyMetaList,
  setCurrency: () => undefined,
  convert: (amount) => amount,
  format: (amount) => amount.toString(),
})

const defaultCurrency: SupportedCurrency = 'CNY'

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<SupportedCurrency>(defaultCurrency)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(STORAGE_KEY) as SupportedCurrency | null
    if (stored && metaMap[stored]) {
      setCurrencyState(stored)
    }
  }, [])

  const setCurrency = (code: SupportedCurrency) => {
    setCurrencyState(code)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, code)
    }
  }

  const convert = (
    amount: number,
    fromCurrency: SupportedCurrency = 'USD',
    toCurrency: SupportedCurrency = currency,
  ) => {
    if (!amount || Number.isNaN(amount)) return 0
    const fromMeta = metaMap[fromCurrency]
    const toMeta = metaMap[toCurrency]
    if (!fromMeta || !toMeta) return amount
    const usdAmount = amount * fromMeta.usdPerUnit
    return usdAmount / toMeta.usdPerUnit
  }

  const format = (amount: number, options?: FormatOptions) => {
    const { fromCurrency = 'USD', toCurrency = currency, maximumFractionDigits } = options || {}
    const targetMeta = metaMap[toCurrency]
    if (!targetMeta) return amount.toString()
    const converted = convert(amount, fromCurrency, toCurrency)
    const fractionDigits =
      typeof maximumFractionDigits === 'number'
        ? maximumFractionDigits
        : toCurrency === 'JPY'
        ? 0
        : 2
    return new Intl.NumberFormat(targetMeta.locale, {
      style: 'currency',
      currency: toCurrency,
      maximumFractionDigits: fractionDigits,
    }).format(converted)
  }

  const value = useMemo<CurrencyContextValue>(
    () => ({
      currency,
      availableCurrencies: currencyMetaList,
      setCurrency,
      convert,
      format,
    }),
    [currency],
  )

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}

export function useCurrency(): CurrencyContextValue {
  return useContext(CurrencyContext)
}


