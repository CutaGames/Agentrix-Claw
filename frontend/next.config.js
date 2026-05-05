const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // 后端文件已在 tsconfig.json 中排除，Next.js 不会检查它们
  // 允许构建时显示警告但不阻止构建
  eslint: {
    // 在构建时忽略 ESLint 警告，只显示错误
    ignoreDuringBuilds: false,
  },
  typescript: {
    // 在构建时忽略 TypeScript 错误（不推荐，但可以临时使用）
    ignoreBuildErrors: false,
  },
  // API 代理到后端服务
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl.replace(/\/$/, '')}/api/:path*`,
      },
    ];
  },
  // v3 marketing 重构：旧 marketing 入口下线，301 到 /legacy/<slug> 占位说明
  async redirects() {
    return [
      { source: '/claw', destination: '/legacy/claw', permanent: true },
      { source: '/predict', destination: '/legacy/predict', permanent: true },
      { source: '/ax-payment', destination: '/legacy/ax-payment', permanent: true },
      { source: '/payment-demo', destination: '/legacy/payment-demo', permanent: true },
      { source: '/alliance', destination: '/legacy/alliance', permanent: true },
    ];
  },
  // 允许加载 Transak SDK 的外部脚本
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://global.transak.com https://staging-global.transak.com https://global-stg.transak.com",
              "style-src 'self' 'unsafe-inline' https://global.transak.com https://staging-global.transak.com https://global-stg.transak.com",
              "img-src 'self' data: https: blob:",
              "font-src 'self' data: https:",
              // 允许连接到本地开发服务器、生产服务器和 Transak API
              "connect-src 'self' http://localhost:3001 http://127.0.0.1:3001 https://api.agentrix.top https://api.agentrix.io https://global.transak.com https://staging-global.transak.com https://global-stg.transak.com https://api.transak.com https://api-staging.transak.com",
              "frame-src 'self' https://global.transak.com https://staging-global.transak.com https://global-stg.transak.com",
            ].join('; '),
          },
        ],
      },
    ];
  },
}

module.exports = nextConfig
