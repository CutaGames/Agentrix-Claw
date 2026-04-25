import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useUser } from '../../contexts/UserContext'
import { UserMenu } from '../auth/UserMenu'
import { MobileMenu } from './MobileMenu'
import { GlobalSearch } from '../search/GlobalSearch'
import { NotificationCenter } from '../notification/NotificationCenter'
import { useLocalization } from '../../contexts/LocalizationContext'
import { AgentrixLogo } from '../common/AgentrixLogo'
import { LanguageSwitcher } from './LanguageSwitcher'
import { Store, Smartphone, Sparkles, ChevronDown } from 'lucide-react'

// Primary items always visible in the nav bar
const primaryNavItems = [
  { href: '/claw', label: { zh: 'Agentrix Claw', en: 'Agentrix Claw' }, isClaw: true },
  { href: '/marketplace', label: { zh: '市场', en: 'Marketplace' }, highlight: true },
  { href: '/predict', label: { zh: '🎯 预测', en: '🎯 Predict' } },
  { href: '/agent-enhanced', label: { zh: 'Agent 工作台', en: 'Workspace' } },
]

// Secondary items grouped under a "More" dropdown
const secondaryNavItems = [
  { href: '/ax-payment', label: { zh: 'AX 支付', en: 'AX Payment' }, icon: '💳' },
  { href: '/developers', label: { zh: '开发者', en: 'Developers' }, icon: '⚙️' },
  { href: '/alliance', label: { zh: '联盟', en: 'Alliance' }, icon: '🤝' },
]

function MoreDropdown() {
  const router = useRouter()
  const { t } = useLocalization()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const isAnyActive = secondaryNavItems.some(item => router.pathname === item.href)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1 text-sm font-semibold transition-all ${
          isAnyActive ? 'text-cyan-400' : 'text-slate-300 hover:text-cyan-400'
        }`}
      >
        {t({ zh: '更多', en: 'More' })}
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-2 w-44 rounded-xl bg-slate-900 border border-white/10 shadow-xl shadow-black/40 py-1 z-50">
          {secondaryNavItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                router.pathname === item.href
                  ? 'text-cyan-400 bg-white/5'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <span>{item.icon}</span>
              {t(item.label)}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export function Navigation() {
  const router = useRouter()
  const { isAuthenticated } = useUser()
  const { t } = useLocalization()

  const isActive = (path: string) => router.pathname === path

  return (
    <nav className="sticky top-0 z-40 border-b border-white/5 bg-slate-950/80 backdrop-blur-xl">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex h-16 items-center justify-between">
          {/* Logo + Mobile Menu */}
          <div className="flex items-center space-x-3">
            <MobileMenu />
            <Link href="/" className="hover:opacity-80 transition-opacity">
              <AgentrixLogo size="md" showText={true} className="text-white" />
            </Link>
          </div>

          {/* Desktop Menu — primary items only */}
          <div className="hidden flex-1 items-center justify-center md:flex">
            <div className="ml-4 flex items-center space-x-4">
              {primaryNavItems.map((item) => {
                const isHighlight = 'highlight' in item && item.highlight;
                const isClaw = 'isClaw' in item && item.isClaw;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`text-sm font-semibold tracking-wide transition-all flex items-center gap-1.5 ${
                      isActive(item.href)
                        ? 'text-cyan-400'
                        : isClaw
                          ? 'text-white bg-gradient-to-r from-violet-600/30 to-cyan-600/30 px-3 py-1.5 rounded-full border border-violet-500/40 hover:border-cyan-400/60 hover:text-cyan-300'
                          : isHighlight
                            ? 'text-white bg-gradient-to-r from-blue-600/20 to-purple-600/20 px-3 py-1.5 rounded-full border border-blue-500/30 hover:text-cyan-400'
                            : 'text-slate-300 hover:text-cyan-400'
                    }`}
                  >
                    {isClaw && <Smartphone size={13} className="text-violet-400" />}
                    {isHighlight && !isClaw && <Store size={14} />}
                    {t(item.label)}
                    {isClaw && (
                      <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider bg-gradient-to-r from-violet-500 to-cyan-500 text-white uppercase">
                        NEW
                      </span>
                    )}
                  </Link>
                );
              })}
              {/* More dropdown for secondary items */}
              <MoreDropdown />
            </div>
          </div>

          {/* Right Side */}
          <div className="flex items-center space-x-2 md:space-x-3">
            <div className="hidden lg:flex">
              <LanguageSwitcher />
            </div>
            <Link
              href="/claw#download"
              className="hidden items-center rounded-full bg-gradient-to-r from-violet-600/20 to-cyan-600/20 border border-violet-500/30 px-4 py-1.5 text-xs font-bold text-slate-200 transition-all hover:border-cyan-400/60 hover:text-white md:inline-flex gap-1.5"
            >
              <Smartphone size={12} className="text-violet-400" />
              {t({ zh: '下载 Claw', en: 'Download Claw' })}
            </Link>
            {isAuthenticated && <NotificationCenter />}
            {isAuthenticated ? (
              <UserMenu />
            ) : (
              <Link
                href="/auth/login"
                className="rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-1.5 text-sm font-bold text-white transition-all hover:opacity-90 shadow-lg shadow-blue-600/20"
              >
                {t({ zh: '登录', en: 'Sign in' })}
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
