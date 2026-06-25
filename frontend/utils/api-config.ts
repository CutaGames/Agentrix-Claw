/**
 * API Configuration Center
 * Used to manage backend API URLs for the frontend
 */

// Development API URL (localhost only — used in SSR and local dev)
const DEV_API_URL = 'http://localhost:3001';

// In the browser (client-side), always use empty string so fetch calls resolve to same-origin
// relative URLs (e.g. /api/admin/...) which Next.js API proxy routes handle server-side.
// This avoids CORS/DNS/network issues when calling api.agentrix.top directly from the browser.
export const API_BASE_URL = (typeof window !== 'undefined')
  ? ''  // browser: relative — proxied by pages/api/admin/[...path].ts
  : (process.env.BACKEND_URL || DEV_API_URL); // SSR / Node: direct backend call

// Export module paths
export const API_ENDPOINTS = {
  ADMIN_AUTH: '/api/admin/auth',
  ADMIN_STATS: '/api/admin/stats',
  DEVELOPERS: '/api/admin/developers',
  FUND_PATHS: '/api/admin/fund-paths',
  MARKETING: '/api/admin/marketing',
};
