import { useRouter } from 'next/router'
import { useUser } from '../../contexts/UserContext'
import { useEffect, useState, useRef } from 'react'

export function Hero({ onGetStarted }: { onGetStarted: () => void }) {
  const router = useRouter()
  const { isAuthenticated } = useUser()
  const [activePaymentMethod, setActivePaymentMethod] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number>()

  const paymentMethods = [
    { name: 'Passkey', icon: '🔐', color: 'from-purple-500 to-purple-600' },
    { name: 'Wallet', icon: '👛', color: 'from-blue-500 to-blue-600' },
    { name: '多链路由', icon: '🌐', color: 'from-green-500 to-green-600' },
    { name: 'X402 协议', icon: '⚡', color: 'from-yellow-500 to-orange-500' },
  ]

  // 支付路径自动切换
  useEffect(() => {
    const interval = setInterval(() => {
      setActivePaymentMethod((prev) => (prev + 1) % paymentMethods.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  // 粒子动画
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight

    const particles: Array<{
      x: number
      y: number
      vx: number
      vy: number
      radius: number
      opacity: number
    }> = []

    // 创建粒子
    for (let i = 0; i < 50; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        radius: Math.random() * 2 + 1,
        opacity: Math.random() * 0.5 + 0.2,
      })
    }

    // AI Agent节点位置
    const agentNodes = [
      { x: canvas.width * 0.3, y: canvas.height * 0.3 },
      { x: canvas.width * 0.7, y: canvas.height * 0.4 },
      { x: canvas.width * 0.5, y: canvas.height * 0.6 },
      { x: canvas.width * 0.2, y: canvas.height * 0.7 },
      { x: canvas.width * 0.8, y: canvas.height * 0.7 },
    ]

    let time = 0

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      time += 0.02

      // 绘制连接线
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.1)'
      ctx.lineWidth = 1
      for (let i = 0; i < agentNodes.length; i++) {
        for (let j = i + 1; j < agentNodes.length; j++) {
          const dx = agentNodes[i].x - agentNodes[j].x
          const dy = agentNodes[i].y - agentNodes[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 200) {
            ctx.beginPath()
            ctx.moveTo(agentNodes[i].x, agentNodes[i].y)
            ctx.lineTo(agentNodes[j].x, agentNodes[j].y)
            ctx.stroke()
          }
        }
      }

      // 绘制AI Agent节点（呼吸动画）
      agentNodes.forEach((node, index) => {
        const pulse = Math.sin(time * 2 + index) * 0.3 + 1
        const radius = 8 * pulse
        const opacity = (Math.sin(time * 2 + index) * 0.3 + 0.7) * 0.6

        // 外圈光晕
        const gradient = ctx.createRadialGradient(
          node.x,
          node.y,
          0,
          node.x,
          node.y,
          radius * 3
        )
        gradient.addColorStop(0, `rgba(99, 102, 241, ${opacity})`)
        gradient.addColorStop(1, 'rgba(99, 102, 241, 0)')
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(node.x, node.y, radius * 3, 0, Math.PI * 2)
        ctx.fill()

        // 节点
        ctx.fillStyle = `rgba(99, 102, 241, ${opacity + 0.4})`
        ctx.beginPath()
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2)
        ctx.fill()
      })

      // 绘制粒子
      particles.forEach((particle) => {
        particle.x += particle.vx
        particle.y += particle.vy

        if (particle.x < 0 || particle.x > canvas.width) particle.vx *= -1
        if (particle.y < 0 || particle.y > canvas.height) particle.vy *= -1

        ctx.fillStyle = `rgba(99, 102, 241, ${particle.opacity})`
        ctx.beginPath()
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2)
        ctx.fill()
      })

      // 光流动画：从左侧"对话"到右侧"交易成功"
      const lightProgress = (time % 2) / 2 // 0 to 1, 1秒循环
      const startX = canvas.width * 0.1
      const endX = canvas.width * 0.9
      const currentX = startX + (endX - startX) * lightProgress
      const currentY = canvas.height * 0.5

      // 光流轨迹
      const gradient = ctx.createLinearGradient(startX, currentY, currentX, currentY)
      gradient.addColorStop(0, 'rgba(99, 102, 241, 0)')
      gradient.addColorStop(0.5, 'rgba(99, 102, 241, 0.8)')
      gradient.addColorStop(1, 'rgba(99, 102, 241, 0)')
      ctx.strokeStyle = gradient
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(startX, currentY)
      ctx.lineTo(currentX, currentY)
      ctx.stroke()

      // 光流点
      ctx.fillStyle = 'rgba(99, 102, 241, 1)'
      ctx.beginPath()
      ctx.arc(currentX, currentY, 6, 0, Math.PI * 2)
      ctx.fill()

      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animate()

    const handleResize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  const handleGetStarted = () => {
    if (isAuthenticated) {
      router.push('/app/user')
    } else {
      onGetStarted()
    }
  }


  return (
    <section className="relative bg-white text-gray-900 overflow-hidden min-h-screen flex items-center">
      {/* 背景装饰 */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-0 w-96 h-96 bg-blue-100 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-100 rounded-full blur-3xl"></div>
      </div>

      <div className="container mx-auto px-6 py-20 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* 左侧 - 文字内容 */}
          <div className="space-y-8">
            {/* 主标题 */}
            <div className="space-y-4">
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold leading-tight text-gray-900">
                <span className="block">打造你的 AI 商业操作系统</span>
                <span className="block">一键唤醒专属 Agent 即刻开赚</span>
              </h1>

              {/* 副标题 */}
              <p className="text-xl md:text-2xl text-gray-600 leading-relaxed">
                支付、Agent、Marketplace、联盟激励一次打包，<br />
                让个人用户、团队与品牌几分钟内构建自动化商业闭环。
              </p>
            </div>

            {/* 核心能力标签 */}
            <div className="flex flex-wrap gap-3">
              <div className="px-4 py-2 rounded-lg bg-gray-100 border border-gray-200 text-gray-700">
                <span className="text-lg mr-2">🤖</span>
                <span className="font-medium">AX Agent</span>
              </div>
              <div className="px-4 py-2 rounded-lg bg-gray-100 border border-gray-200 text-gray-700">
                <span className="text-lg mr-2">💳</span>
                <span className="font-medium">智能支付</span>
              </div>
              <div className="px-4 py-2 rounded-lg bg-gray-100 border border-gray-200 text-gray-700">
                <span className="text-lg mr-2">🌐</span>
                <span className="font-medium">AI Marketplace</span>
              </div>
              <div className="px-4 py-2 rounded-lg bg-gray-100 border border-gray-200 text-gray-700">
                <span className="text-lg mr-2">⚡</span>
                <span className="font-medium">Auto-Earn</span>
              </div>
            </div>

            {/* 按钮组 */}
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => router.push('/agent-enhanced')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-lg font-semibold text-lg transition-all transform hover:scale-105 shadow-lg hover:shadow-xl flex items-center justify-center"
              >
                <span className="mr-2">🤖</span>
                立即体验 AX Agent
              </button>
              <button
                onClick={() => router.push('/developers')}
                className="border-2 border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white px-8 py-4 rounded-lg font-semibold text-lg transition-all transform hover:scale-105"
              >
                查看文档
              </button>
              <button
                onClick={onGetStarted}
                className="bg-white/10 backdrop-blur border-2 border-white/50 text-white hover:bg-white/20 px-8 py-4 rounded-lg font-semibold text-lg transition-all transform hover:scale-105"
              >
                登录
              </button>
            </div>

          </div>

          {/* 右侧 - 动态视觉 */}
          <div className="relative">
            <div className="relative w-full h-[500px] lg:h-[600px]">
              {/* Canvas 粒子动画 */}
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full"
                style={{ background: 'transparent' }}
              />

              {/* 对话图标（左侧） */}
              <div className="absolute left-0 top-1/2 transform -translate-y-1/2 -translate-x-4">
                <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-6 shadow-2xl">
                  <div className="text-4xl mb-2">💬</div>
                  <div className="text-sm font-semibold">对话</div>
                </div>
              </div>

              {/* 交易成功图标（右侧） */}
              <div className="absolute right-0 top-1/2 transform -translate-y-1/2 translate-x-4">
                <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-6 shadow-2xl animate-pulse">
                  <div className="text-4xl mb-2">✅</div>
                  <div className="text-sm font-semibold">交易成功</div>
                </div>
              </div>

              {/* 中心支付网络可视化 */}
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                <div className="bg-gray-800/50 backdrop-blur-lg rounded-3xl p-8 border border-gray-700/50 shadow-2xl">
                  <div className="text-center">
                    <div className="text-5xl mb-4">⚡</div>
                    <div className="text-xl font-bold mb-2">Agentrix</div>
                    <div className="text-sm text-gray-400">支付中间层</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
