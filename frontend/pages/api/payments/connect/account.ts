import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const userId = (req as any).userId;
    const token = (req as any).token;
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

    // 从后端获取 Connect 账户信息
    const response = await fetch(`${API_BASE}/api/payments/connect/account`, {
      headers: {
        'Cookie': req.headers.cookie || '',
        'Authorization': token ? `Bearer ${token}` : '',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({ message: 'No Connect account found' });
      }
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to fetch Connect account');
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error: any) {
    console.error('获取 Connect 账户失败:', error);
    res.status(500).json({ 
      message: error.message || '获取账户信息失败' 
    });
  }
}

export default withAuth(handler);
