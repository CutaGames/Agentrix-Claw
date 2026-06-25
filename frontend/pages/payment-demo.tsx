import Head from 'next/head'
import { Navigation } from '../components/ui/Navigation'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { paymentApi } from '../lib/api/payment.api'
import { SmartCheckout } from '../components/payment/SmartCheckout'

/* --------------------------- Mock API (simulated) --------------------------- */
const mockApi = {
  fetchRouting: async ({ amountUSD }: { amountUSD: number }) => {
    await wait(300)
    return [
      { id: 'quick', label: '快速支付（无需确认）', score: 98, eta: '即时', costUSD: amountUSD * 1.00 },
      { id: 'usdc', label: 'USDC 支付', score: 92, eta: '3-8s', costUSD: amountUSD * 0.995 },
      { id: 'apple', label: 'Apple/Google Pay', score: 90, eta: '即时', costUSD: amountUSD * 1.01 },
      { id: 'card', label: 'Visa / Mastercard', score: 80, eta: '几秒', costUSD: amountUSD * 1.06 },
      { id: 'fiat_standard', label: '法币标准支付', score: 60, eta: '即时', costUSD: amountUSD * 1.08 },
    ]
  },

  enableQuickPay: async ({ userId }: { userId: string }) => {
    await wait(1200)
    return { ok: true, msg: 'QuickPay 已启用', expiresInDays: 30 }
  },

  submitKYC: async (payload: any) => {
    await wait(2000)
    const ok = Math.random() > 0.08
    return { ok, msg: ok ? 'KYC 通过' : 'KYC 未通过，请重试' }
  },

  createPaymentIntent: async ({ method, amountUSD, currency }: any) => {
    await wait(800)
    return { ok: true, intentId: `pi_${Math.floor(Math.random() * 1e6)}` }
  },

  performGatewayPayment: async ({ intentId }: { intentId: string }) => {
    await wait(1200)
    const ok = Math.random() > 0.06
    return { ok, id: `gw_${Math.floor(Math.random() * 1e6)}` }
  },

  lockRate: async ({ amountUSD }: { amountUSD: number }) => {
    await wait(200)
    return { ok: true, lockedPriceLocal: 102.45, expiresInSec: 25 }
  },
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/* --------------------------- Main App Component --------------------------- */
export default function PaymentDemo() {
  const router = useRouter()
  const [showCheckout, setShowCheckout] = useState(false)
  const [currentOrder, setCurrentOrder] = useState<any>(null)
  
  // Order & display
  const [amountUSD] = useState(14.9)
  const [localSymbol] = useState('¥')

  // User/account state
  const [hasQuickPayAuth, setHasQuickPayAuth] = useState(false)
  const [kycStatus, setKycStatus] = useState<'not_started' | 'pending' | 'verified' | 'failed'>('not_started')

  // Routing & recommended
  const [routing, setRouting] = useState<any[]>([])
  const [recommended, setRecommended] = useState<any>(null)

  // UI state
  const [expanded, setExpanded] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [page, setPage] = useState<'home' | 'fiat' | 'crypto' | 'kyc' | 'quick'>('home')
  const [rateLock, setRateLock] = useState<{ locked: boolean; sec: number; priceLocal: number | null }>({
    locked: false,
    sec: 0,
    priceLocal: null,
  })

  useEffect(() => {
    ;(async () => {
      const r = await mockApi.fetchRouting({ amountUSD })
      setRouting(r)
      setRecommended(r.reduce((a, b) => (b.score > a.score ? b : a), r[0]))
    })()
  }, [amountUSD])

  useEffect(() => {
    let t: NodeJS.Timeout | null = null
    if (rateLock.locked && rateLock.sec > 0) {
      t = setInterval(() => {
        setRateLock((s) => {
          if (s.sec <= 1) {
            if (t) clearInterval(t)
            return { locked: false, sec: 0, priceLocal: s.priceLocal }
          }
          return { ...s, sec: s.sec - 1 }
        })
      }, 1000)
    }
    return () => {
      if (t) clearInterval(t)
    }
  }, [rateLock.locked, rateLock.sec])

  // Unified callback / logger
  const pushCallback = (payload: { status: string; method: string; message: string }) => {
    // [Agentrix Callback] logic
    setMessage(payload.message)
  }

  /* --------------------------- Handlers --------------------------- */
  const handlePayNow = async () => {
    setMessage(null)
    setProcessing(true)

    // If recommended quick
    if (recommended?.id === 'quick') {
      if (hasQuickPayAuth) {
        // instant pay
        await wait(400)
        pushCallback({ status: 'success', method: 'quick', message: '支付成功（快速支付）' })
        setProcessing(false)
        return
      }
      // otherwise open quick flow
      setProcessing(false)
      setPage('quick')
      return
    }

    // If recommended is USDC
    if (recommended?.id === 'usdc') {
      setPage('crypto')
      setProcessing(false)
      return
    }

    // If recommended is fiat/other
    setPage('fiat')
    setProcessing(false)
  }

  const handleEnableQuickPay = async ({ allowAuto = true }: { allowAuto?: boolean } = {}) => {
    setProcessing(true)
    setMessage('正在在钱包中签名以启用快速支付...')
    const res = await mockApi.enableQuickPay({ userId: 'demo_user' })
    if (res.ok) {
      setHasQuickPayAuth(true)
      pushCallback({ status: 'success', method: 'quick_enable', message: res.msg })
    } else {
      pushCallback({ status: 'failed', method: 'quick_enable', message: '启用失败' })
    }
    setProcessing(false)
    setPage('home')
  }

  const handleStartKYC = () => {
    setPage('kyc')
  }

  const handleFiatPay = async ({ useOptimal = true }: { useOptimal?: boolean }) => {
    setProcessing(true)
    setMessage(null)

    // lock rate if optimal and KYC verified
    if (useOptimal && kycStatus === 'verified') {
      const lock = await mockApi.lockRate({ amountUSD })
      if (lock.ok) {
        setRateLock({ locked: true, sec: lock.expiresInSec, priceLocal: lock.lockedPriceLocal })
      }
    }

    // create payment intent
    const intent = await mockApi.createPaymentIntent({
      method: useOptimal ? 'fiat_optimal' : 'fiat_standard',
      amountUSD,
      currency: 'CNY',
    })
    if (!intent.ok) {
      pushCallback({ status: 'failed', method: 'fiat', message: '创建支付失败' })
      setProcessing(false)
      return
    }

    // simulate gateway payment
    const gw = await mockApi.performGatewayPayment({ intentId: intent.intentId })
    if (gw.ok) {
      pushCallback({
        status: 'success',
        method: useOptimal ? 'fiat_optimal' : 'fiat_standard',
        message: '法币支付成功',
      })
    } else {
      pushCallback({ status: 'failed', method: 'fiat', message: '法币支付失败' })
    }
    setProcessing(false)
    setPage('home')
  }

  const handleCryptoPay = async ({
    chain = 'SOL',
    useQuickIfSmall = true,
  }: {
    chain?: string
    useQuickIfSmall?: boolean
  }) => {
    setProcessing(true)
    setMessage(null)

    // simulate decision for small amount
    const small = amountUSD < 20
    if (small && useQuickIfSmall && !hasQuickPayAuth) {
      if (!confirm('金额较小，是否启用快速支付以获得一键体验？')) {
        setProcessing(false)
        return
      }
    }

    if (small && useQuickIfSmall && hasQuickPayAuth) {
      await wait(400)
      pushCallback({
        status: 'success',
        method: 'crypto_quick',
        message: `Crypto 支付成功（${chain}，快速）`,
      })
      setProcessing(false)
      setPage('home')
      return
    }

    // normal wallet signing
    const intent = await mockApi.createPaymentIntent({
      method: 'crypto_wallet',
      amountUSD,
      currency: chain,
    })
    const ok = intent.ok
    await wait(900)
    if (!ok) {
      pushCallback({ status: 'failed', method: 'crypto', message: '创建支付失败' })
      setProcessing(false)
      return
    }

    // simulate wallet signature success
    const signed = Math.random() > 0.05
    if (signed) {
      pushCallback({
        status: 'success',
        method: 'crypto_wallet',
        message: `链上支付完成（${chain}）`,
      })
    } else {
      pushCallback({
        status: 'failed',
        method: 'crypto_wallet',
        message: `链上签名失败（${chain}）`,
      })
    }
    setProcessing(false)
    setPage('home')
  }

  /* --------------------------- Render --------------------------- */
  return (
    <>
      <Head>
        <title>支付体验演示 - Agentrix</title>
        <meta name="description" content="体验 Agentrix 统一支付流程：QuickPay、智能路由、KYC、法币和加密货币支付" />
      </Head>
      <Navigation />

      <div className="min-h-screen bg-slate-50 p-6 flex items-start justify-center">
        <div className="w-full max-w-3xl bg-white shadow-lg rounded-2xl p-6">
          <header className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Agentrix — 支付演示</h2>
              <p className="text-sm text-slate-600 mt-1">
                订单金额：{localSymbol}{' '}
                {rateLock.priceLocal ? rateLock.priceLocal.toFixed(2) : '102.45'}（≈ ${amountUSD.toFixed(2)}）
              </p>
            </div>
            <div className="text-right text-xs text-slate-600">
              <div>Demo 环境</div>
            </div>
          </header>

          {/* 统一支付流程入口 */}
          <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">⚡ 统一支付流程 V2.0</h3>
                <p className="text-sm text-gray-600">
                  支持QuickPay、商家收款方式配置、智能路由价格对比、KYC流程、自动托管交易
                </p>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    const order = {
                      id: `demo_${Date.now()}`,
                      amount: parseFloat((rateLock.priceLocal ? rateLock.priceLocal : 102.45).toFixed(2)),
                      currency: 'CNY',
                      description: 'iPhone 15 Pro Max',
                      merchantId: 'Apple Store',
                    }
                    setCurrentOrder(order)
                    setShowCheckout(true)
                  }}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                >
                  体验 V7.0 支付流程
                </button>
              </div>
            </div>
          </div>

          {/* Page switcher */}
          {page === 'home' && (
            <HomePage
              recommended={recommended}
              routing={routing}
              expanded={expanded}
              setExpanded={setExpanded}
              onPayNow={handlePayNow}
              onOpenKYC={handleStartKYC}
              onOpenQuick={() => setPage('quick')}
              hasQuickPayAuth={hasQuickPayAuth}
              kycStatus={kycStatus}
              onSelectOther={(id: string) => {
                if (id === 'fiat_standard' || id === 'fiat_optimal') setPage('fiat')
                if (id === 'usdc') setPage('crypto')
                if (id === 'apple' || id === 'card') setPage('fiat')
              }}
              processing={processing}
              message={message}
            />
          )}

          {page === 'kyc' && (
            <KYCPage
              onBack={() => setPage('home')}
              onSubmit={async (form: { name: string; id: string; selfie: any; idPhoto: any }) => {
                setKycStatus('pending')
                const res = await mockApi.submitKYC(form)
                if (res.ok) setKycStatus('verified')
                else setKycStatus('failed')
                pushCallback({
                  status: res.ok ? 'success' : 'failed',
                  method: 'kyc',
                  message: res.msg,
                })
                setPage('home')
              }}
              status={kycStatus}
            />
          )}

          {page === 'quick' && (
            <QuickPayPage
              onBack={() => setPage('home')}
              hasAuth={hasQuickPayAuth}
              onEnable={() => handleEnableQuickPay()}
            />
          )}

          {page === 'fiat' && (
            <FiatPaymentPage
              onBack={() => setPage('home')}
              amountUSD={amountUSD}
              kycStatus={kycStatus}
              rateLock={rateLock}
              onLockRate={async () => {
                const lock = await mockApi.lockRate({ amountUSD })
                if (lock.ok)
                  setRateLock({
                    locked: true,
                    sec: lock.expiresInSec,
                    priceLocal: lock.lockedPriceLocal,
                  })
              }}
              onPay={(opts: { useOptimal?: boolean }) => handleFiatPay(opts)}
              localSymbol={localSymbol}
            />
          )}

          {page === 'crypto' && (
            <CryptoPaymentPage
              onBack={() => setPage('home')}
              amountUSD={amountUSD}
              onPay={(opts: { chain?: string; useQuickIfSmall?: boolean }) => handleCryptoPay(opts)}
              hasQuickPayAuth={hasQuickPayAuth}
            />
          )}

          {/* footer */}
          <div className="mt-6 text-xs text-slate-600 flex items-center justify-between">
            <div>
              KYC 状态：<strong className="text-slate-900">{kycStatus}</strong>
            </div>
            <div>
              QuickPay：<strong className="text-slate-900">{hasQuickPayAuth ? '已启用' : '未启用'}</strong>
            </div>
          </div>

        </div>

        {/* Page switcher */}
        {page === 'home' && (
          <HomePage
            recommended={recommended}
            routing={routing}
            expanded={expanded}
            setExpanded={setExpanded}
            onPayNow={handlePayNow}
            onOpenKYC={handleStartKYC}
            onOpenQuick={() => setPage('quick')}
            hasQuickPayAuth={hasQuickPayAuth}
            kycStatus={kycStatus}
            onSelectOther={(id: string) => {
              if (id === 'fiat_standard' || id === 'fiat_optimal') setPage('fiat')
              if (id === 'usdc') setPage('crypto')
              if (id === 'apple' || id === 'card') setPage('fiat')
            }}
            processing={processing}
            message={message}
          />
        )}

        {page === 'kyc' && (
          <KYCPage
            onBack={() => setPage('home')}
            onSubmit={async (form: { name: string; id: string; selfie: any; idPhoto: any }) => {
              setKycStatus('pending')
              const res = await mockApi.submitKYC(form)
              if (res.ok) setKycStatus('verified')
              else setKycStatus('failed')
              pushCallback({
                status: res.ok ? 'success' : 'failed',
                method: 'kyc',
                message: res.msg,
              })
              setPage('home')
            }}
            status={kycStatus}
          />
        )}

        {page === 'quick' && (
          <QuickPayPage
            onBack={() => setPage('home')}
            hasAuth={hasQuickPayAuth}
            onEnable={() => handleEnableQuickPay()}
          />
        )}

        {page === 'fiat' && (
          <FiatPaymentPage
            onBack={() => setPage('home')}
            amountUSD={amountUSD}
            kycStatus={kycStatus}
            rateLock={rateLock}
            onLockRate={async () => {
              const lock = await mockApi.lockRate({ amountUSD })
              if (lock.ok)
                setRateLock({
                  locked: true,
                  sec: lock.expiresInSec,
                  priceLocal: lock.lockedPriceLocal,
                })
            }}
            onPay={(opts: { useOptimal?: boolean }) => handleFiatPay(opts)}
            localSymbol={localSymbol}
          />
        )}

        {page === 'crypto' && (
          <CryptoPaymentPage
            onBack={() => setPage('home')}
            amountUSD={amountUSD}
            onPay={(opts: { chain?: string; useQuickIfSmall?: boolean }) => handleCryptoPay(opts)}
            hasQuickPayAuth={hasQuickPayAuth}
          />
        )}

        {/* footer */}
        <div className="mt-6 text-xs text-slate-600 flex items-center justify-between">
          <div>
            KYC 状态：<strong className="text-slate-900">{kycStatus}</strong>
          </div>
          <div>
            QuickPay：<strong className="text-slate-900">{hasQuickPayAuth ? '已启用' : '未启用'}</strong>
          </div>
        </div>
      </div>

      {showCheckout && currentOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="relative">
            <button
              onClick={() => {
                setShowCheckout(false)
                setCurrentOrder(null)
              }}
              className="absolute -top-12 right-0 text-white hover:text-gray-300 text-2xl"
            >
              ×
            </button>
            <SmartCheckout
              order={currentOrder}
              onSuccess={(result) => {
                // Payment successful logic
                pushCallback({
                  status: 'success',
                  method: 'v7.0',
                  message: '支付成功！',
                })
                setShowCheckout(false)
                setCurrentOrder(null)
              }}
              onCancel={() => {
                setShowCheckout(false)
                setCurrentOrder(null)
              }}
            />
          </div>
        </div>
      )}
    </>
  )
}

/* --------------------------- Subcomponents --------------------------- */
function HomePage({
  recommended,
  routing,
  expanded,
  setExpanded,
  onPayNow,
  onOpenKYC,
  onOpenQuick,
  hasQuickPayAuth,
  kycStatus,
  onSelectOther,
  processing,
  message,
}: any) {
  return (
    <div>
      <section className="border rounded-xl p-4 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm text-slate-600">推荐支付方式</div>
            <div className="text-lg font-semibold mt-1 text-gray-900">{recommended?.label || '加载中...'}</div>
            <div className="text-xs text-slate-600 mt-1">
              {recommended?.eta} • 建议指数 {recommended?.score}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-slate-600">预计费用</div>
            <div className="text-lg font-semibold mt-1 text-gray-900">${recommended?.costUSD?.toFixed(2)}</div>
          </div>
        </div>
        <div className="mt-4 flex gap-3">
          <button
            disabled={processing}
            onClick={onPayNow}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium"
          >
            {processing ? '处理中...' : '立即支付'}
          </button>
          <button onClick={() => setExpanded((s: boolean) => !s)} className="px-3 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
            {expanded ? '收起其他方式' : '选择其他方式'}
          </button>
        </div>
      </section>

      {expanded && (
        <section className="mb-4">
          <div className="grid grid-cols-2 gap-3">
            {routing.map((m: any) => (
              <div key={m.id} className="border border-gray-200 rounded-lg p-3 flex flex-col justify-between bg-white">
                <div>
                  <div className="text-sm font-medium text-gray-900">{m.label}</div>
                  <div className="text-xs text-slate-600 mt-1">
                    {m.eta} • 建议 {m.score}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900">${m.costUSD.toFixed(2)}</div>
                  <button onClick={() => onSelectOther(m.id)} className="px-3 py-1 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50">
                    使用
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-4 p-4 bg-slate-50 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-900">快速支付（体验）</div>
            <div className="text-xs text-slate-600 mt-1">
              开启后，小额支付可一键完成，安全可随时关闭。
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onOpenKYC} className="px-3 py-1 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50">
              KYC 设置
            </button>
            <button
              onClick={onOpenQuick}
              className={`px-3 py-1 ${hasQuickPayAuth ? 'bg-green-100 text-green-800' : 'text-gray-700'} border border-gray-300 rounded text-sm hover:bg-gray-50`}
            >
              {hasQuickPayAuth ? '已启用' : '启用快速支付'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

function KYCPage({ onBack, onSubmit, status }: any) {
  const [form, setForm] = useState<{ name: string; id: string; selfie: string | null; idPhoto: string | null }>({ 
    name: '', 
    id: '', 
    selfie: null, 
    idPhoto: null 
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setLoading(true)
    await onSubmit(form)
    setLoading(false)
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">KYC 验证</h3>
        <button onClick={onBack} className="text-sm text-slate-600 hover:text-slate-800">
          返回
        </button>
      </div>
      <div className="space-y-4">
        <div>
          <label className="text-xs text-slate-700 font-medium">姓名</label>
          <input
            className="w-full mt-1 p-2 border border-gray-300 rounded text-gray-900 bg-white"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-slate-700 font-medium">证件号</label>
          <input
            className="w-full mt-1 p-2 border border-gray-300 rounded text-gray-900 bg-white"
            value={form.id}
            onChange={(e) => setForm({ ...form, id: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-slate-700 font-medium">上传证件照片（演示）</label>
          <div className="mt-1">
            <button
              className="px-3 py-1 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setForm({ ...form, idPhoto: 'uploaded' })}
            >
              模拟上传证件
            </button>
            <span className="text-xs text-slate-600 ml-2">{form.idPhoto ? '已上传' : '未上传'}</span>
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-700 font-medium">上传自拍（演示）</label>
          <div className="mt-1">
            <button
              className="px-3 py-1 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setForm({ ...form, selfie: 'uploaded' })}
            >
              模拟上传自拍
            </button>
            <span className="text-xs text-slate-600 ml-2">{form.selfie ? '已上传' : '未上传'}</span>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? '提交中...' : '提交验证'}
          </button>
          <button onClick={onBack} className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50">
            取消
          </button>
        </div>
        <div className="text-sm text-slate-600">注意：此为演示流，上传将不会发送到真实后端。</div>
      </div>
    </div>
  )
}

function QuickPayPage({ onBack, hasAuth, onEnable, message }: any) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">启用快速支付</h3>
        <button onClick={onBack} className="text-sm text-slate-600 hover:text-slate-800">
          返回
        </button>
      </div>
      <div className="p-4 border border-gray-200 rounded space-y-4 bg-white">
        <p className="text-sm text-slate-700">
          启用快速支付后，小额交易可在用户授权范围内一键完成，无需每次确认。你可随时在账户设置中关闭。
        </p>
        <div className="bg-slate-50 p-3 rounded border border-gray-200">
          <div className="text-xs text-slate-600">授权额度（演示）</div>
          <div className="mt-1 font-medium text-gray-900">每日最高：$50 • 有效期：30 天</div>
        </div>
        <div className="flex gap-3">
          {!hasAuth ? (
            <button onClick={onEnable} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
              在钱包中签名并启用
            </button>
          ) : (
            <div className="px-4 py-2 bg-green-50 border border-green-200 rounded text-green-700">已启用快速支付</div>
          )}
          {message && (
            <div className="mt-4 p-3 rounded bg-emerald-50 border border-emerald-100 text-emerald-800">
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FiatPaymentPage({
  onBack,
  amountUSD,
  kycStatus,
  rateLock,
  onLockRate,
  onPay,
  localSymbol,
}: any) {
  const optimalLocal = rateLock.priceLocal ? rateLock.priceLocal : 102.45
  const standardLocal = 108.0

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">法币支付</h3>
        <button onClick={onBack} className="text-sm text-slate-600 hover:text-slate-800">
          返回
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="border border-gray-200 rounded p-4 bg-white">
          <div className="text-sm text-slate-700 font-medium">最优价格（智能汇率）</div>
          <div className="text-xl font-semibold mt-2 text-gray-900">
            {localSymbol} {optimalLocal.toFixed(2)}
          </div>
          <div className="text-xs text-slate-600 mt-2">≈ ${amountUSD.toFixed(2)}</div>
          <div className="mt-3">
            {kycStatus === 'verified' ? (
              <div className="text-xs text-slate-700">汇率锁定中：{rateLock.sec}s</div>
            ) : (
              <div className="text-xs text-slate-600">需完成 KYC 才可锁定汇率并享受最优价格</div>
            )}
          </div>
          <div className="mt-4 flex gap-2">
            {kycStatus === 'verified' && !rateLock.locked && (
              <button className="px-3 py-1 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50" onClick={onLockRate}>
                锁定汇率
              </button>
            )}
            <button
              className="px-3 py-1 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700"
              onClick={() => onPay({ useOptimal: true })}
            >
              使用最优价格支付
            </button>
          </div>
        </div>
        <div className="border border-gray-200 rounded p-4 bg-white">
          <div className="text-sm text-slate-700 font-medium">标准支付（常规渠道）</div>
          <div className="text-xl font-semibold mt-2 text-gray-900">
            {localSymbol} {standardLocal.toFixed(2)}
          </div>
          <div className="text-xs text-slate-600 mt-2">≈ ${amountUSD.toFixed(2)}</div>
          <div className="mt-4">
            <button
              className="px-3 py-1 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => onPay({ useOptimal: false })}
            >
              使用标准支付
            </button>
          </div>
        </div>
      </div>
      <div className="mt-4 text-xs text-slate-600">
        提示：KYC 通过后，智能路由可以为你锁定更优汇率（演示模式）。
      </div>
    </div>
  )
}

function CryptoPaymentPage({ onBack, amountUSD, onPay, hasQuickPayAuth }: any) {
  const [chain, setChain] = useState('SOL')

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">数字货币支付</h3>
        <button onClick={onBack} className="text-sm text-slate-600 hover:text-slate-800">
          返回
        </button>
      </div>
      <div className="space-y-3">
        <div>
          <div className="text-sm text-slate-700 font-medium">选择链</div>
          <div className="mt-2 flex gap-2">
            {['SOL', 'ETH', 'BSC'].map((c) => (
              <button
                key={c}
                onClick={() => setChain(c)}
                className={`px-3 py-1 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 ${chain === c ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : ''}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="border border-gray-200 rounded p-4 bg-white">
          <div className="text-sm text-slate-700 font-medium">当前链：{chain}</div>
          <div className="text-xl font-semibold mt-2 text-gray-900">USDC 支付（智能最优）</div>
          <div className="text-xs text-slate-600 mt-1">≈ ${amountUSD.toFixed(2)}</div>
          <div className="mt-4 flex gap-2">
            <button
              className="px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700"
              onClick={() => onPay({ chain, useQuickIfSmall: true })}
            >
              立即用钱包支付
            </button>
            <button
              className="px-3 py-1 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
              onClick={() => {
                if (!hasQuickPayAuth) {
                  if (confirm('该金额较小，可启用快速支付获得一键体验。是否现在启用？')) {
                    onPay({ chain, useQuickIfSmall: true })
                  }
                } else {
                  onPay({ chain, useQuickIfSmall: true })
                }
              }}
            >
              一键支付（若开启快速支付则免签）
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

