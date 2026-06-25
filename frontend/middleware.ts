import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * R0-1 Auth middleware: gate /console/** and /app/** behind presence of the
 * HttpOnly `agentrix_token` cookie set by `/api/auth/cookie-set` after login.
 *
 * The cookie content is NOT cryptographically verified here (that's the
 * backend's job on every protected API call). This middleware only blocks the
 * "obviously unauthenticated" case to avoid loading the SPA shell + console
 * code for visitors with no session at all.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Public marketing routes pass through.
  const publicRoutes = ['/', '/auth/login', '/auth/callback', '/features', '/use-cases', '/developers', '/pricing', '/about']
  if (publicRoutes.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/console') || pathname.startsWith('/app/')) {
    const token = request.cookies.get('agentrix_token')?.value
    if (!token || token.length < 16) {
      const loginUrl = new URL('/auth/login', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/app/:path*', '/console/:path*'],
}


