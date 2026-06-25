/**
 * Next.js API proxy for admin login.
 * Forwards POST /api/admin/auth/login → backend /api/admin/auth/login
 *
 * Using a server-side proxy eliminates:
 *  1. CORS issues (same-origin from browser's perspective)
 *  2. Mixed-content blocked requests (always server-to-server HTTPS)
 *  3. Environment variable misconfiguration in client-side builds
 */
import type { NextApiRequest, NextApiResponse } from 'next';

// Backend URL — always http://localhost:3001 on production server (same machine)
// NEVER use NEXT_PUBLIC_API_URL here: it contains /api suffix which would cause double /api/api/ paths
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/admin/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward X-Real-IP so backend can log actual client IP
        ...(req.headers['x-real-ip'] ? { 'X-Real-IP': req.headers['x-real-ip'] as string } : {}),
        ...(req.headers['x-forwarded-for'] ? { 'X-Forwarded-For': req.headers['x-forwarded-for'] as string } : {}),
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json().catch(() => ({ message: 'Invalid JSON from backend' }));
    return res.status(response.status).json(data);
  } catch (err: any) {
    console.error('[admin/auth/login proxy] Backend unreachable:', err.message);
    return res.status(503).json({
      message: 'Backend service unavailable. Please try again in a moment.',
      detail: err.message,
    });
  }
}
