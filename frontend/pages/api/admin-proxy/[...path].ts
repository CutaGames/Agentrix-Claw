/**
 * Next.js catch-all proxy for admin API calls.
 * 
 * Route: /api/admin-proxy/[...path] → backend /api/[...path]
 * 
 * Why: Browser-to-api.agentrix.top may have CORS/DNS/GFW issues.
 * Server-side proxy routes all admin traffic through the same agentrix.top domain.
 */
import type { NextApiRequest, NextApiResponse } from 'next';

// NEVER fall back to NEXT_PUBLIC_API_URL — it has /api suffix causing double /api/ paths
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { path } = req.query;
  const pathStr = Array.isArray(path) ? path.join('/') : path || '';
  
  // Build target URL: /api/admin-proxy/users?... → http://localhost:3001/api/admin/users?...
  const targetUrl = `${BACKEND_URL}/api/${pathStr}${req.url?.includes('?') ? '?' + req.url.split('?')[1] : ''}`;

  try {
    // Forward auth token from client
    const authHeader = req.headers['authorization'];
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (authHeader) headers['Authorization'] = authHeader as string;
    if (req.headers['x-real-ip']) headers['X-Real-IP'] = req.headers['x-real-ip'] as string;

    const fetchOptions: RequestInit = {
      method: req.method,
      headers,
    };

    // Forward body for non-GET methods
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, fetchOptions);
    const data: unknown = await response.json().catch((): null => null);

    // Forward status and response
    res.status(response.status).json(data ?? { message: 'No response body' });
  } catch (err: any) {
    console.error(`[admin-proxy] ${req.method} /${pathStr} → ${BACKEND_URL} failed:`, err.message);
    res.status(503).json({
      message: 'Admin backend unavailable. Please try again.',
      detail: err.message,
    });
  }
}
