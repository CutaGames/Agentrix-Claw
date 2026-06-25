import { useState } from 'react'
import { useLocalization } from '../../contexts/LocalizationContext'

interface LanguageSwitcherProps {
  compact?: boolean
  dark?: boolean
}

export function LanguageSwitcher({ compact = false, dark = false }: LanguageSwitcherProps) {
  const { language, setLanguage, availableLanguages } = useLocalization()
  const [open, setOpen] = useState(false)

  const buttonClassName = dark
    ? compact
      ? 'inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:border-white/20 hover:bg-white/10'
      : 'inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:border-white/20 hover:bg-white/10'
    : compact
      ? 'inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:border-gray-300 hover:text-gray-900'
      : 'inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 shadow-sm transition-colors hover:border-gray-300 hover:text-gray-900'

  const menuClassName = dark
    ? 'absolute right-0 z-20 mt-2 w-36 rounded-xl border border-white/10 bg-slate-900/95 py-1 shadow-2xl shadow-black/40 backdrop-blur-xl'
    : 'absolute right-0 z-20 mt-2 w-36 rounded-lg border border-gray-100 bg-white py-1 shadow-lg'

  const itemBaseClassName = dark
    ? 'hover:bg-white/5'
    : 'hover:bg-gray-50'

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={buttonClassName}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span role="img" aria-label="language">
          🌐
        </span>
        <span>{language === 'zh' ? '中文' : 'EN'}</span>
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
        <div
          className={menuClassName}
          role="listbox"
        >
          {availableLanguages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => {
                setLanguage(lang.code)
                setOpen(false)
              }}
              className={`flex w-full items-center justify-between px-3 py-2 text-sm ${
                dark
                  ? language === lang.code
                    ? 'font-semibold text-cyan-300'
                    : 'text-slate-200'
                  : language === lang.code
                    ? 'text-blue-600 font-semibold'
                    : 'text-gray-600'
              } ${itemBaseClassName}`}
              role="option"
              aria-selected={language === lang.code}
            >
              <span>{lang.label}</span>
              {language === lang.code && (
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


