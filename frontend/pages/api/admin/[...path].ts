/**
 * Next.js catch-all proxy for all /api/admin/* requests.
 *
 * This lets browser code call relative URLs like /api/admin/invitation/generate
 * instead of https://api.agentrix.top/api/admin/... which has CORS/network issues.
 *
 * Next.js route precedence: specific routes (e.g. pages/api/admin/auth/login.ts)
 * always win over this catch-all, so no conflict with existing specific routes.
 */
import type { NextApiRequest, NextApiResponse } from 'next';

// NEVER fall back to NEXT_PUBLIC_API_URL — it has /api suffix causing double /api/ paths
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { path } = req.query;
  const pathStr = Array.isArray(path) ? path.join('/') : path || '';

  // Reconstruct query string (exclude the 'path' param used by Next.js catch-all)
  const url = new URL(req.url || '', 'http://localhost');
  url.searchParams.delete('path'); // not a real query param
  const qs = url.search; // "?page=1&limit=20" or ""

  const targetUrl = `${BACKEND_URL}/api/admin/${pathStr}${qs}`;

  const authHeader = req.headers['authorization'];
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (authHeader) headers['Authorization'] = authHeader as string;

  const fetchOptions: RequestInit = {
    method: req.method,
    headers,
  };

  if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
    fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }

  try {
    const response = await fetch(targetUrl, fetchOptions);
    const data: unknown = await response.json().catch((): null => null);
    res.status(response.status).json(data ?? { message: 'No response body' });
  } catch (err: any) {
    console.error(`[admin-proxy] ${req.method} /admin/${pathStr} failed:`, err.message);
    res.status(503).json({ message: 'Admin backend unavailable.', detail: err.message });
  }
}
