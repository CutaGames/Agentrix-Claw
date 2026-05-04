import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // 允许访问的公开路径
  const publicPaths = ['/', '/auth/login', '/features', '/use-cases', '/developers']

  // P0-W2-7 Web Console route partition: /console/** is the authenticated workspace
  // (separate from marketing pages at /, /pricing, etc.)
  if (request.nextUrl.pathname.startsWith('/console')) {
    // Auth check happens client-side (token in localStorage); middleware only
    // ensures the route is reachable. Future: server-side cookie check.
    return NextResponse.next()
  }

  // 检查是否是app路由
  if (request.nextUrl.pathname.startsWith('/app/')) {
    // 在客户端检查认证状态
    // 这里只做路径检查，实际认证在客户端进行
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/app/:path*', '/console/:path*'],
}


