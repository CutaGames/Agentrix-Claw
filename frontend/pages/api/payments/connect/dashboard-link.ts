import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const userId = (req as any).userId;
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

    // 调用后端创建 dashboard link
    const response = await fetch(`${API_BASE}/api/payments/connect/dashboard-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': req.headers.cookie || '',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to create dashboard link');
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error: any) {
    console.error('创建 dashboard link 失败:', error);
    res.status(500).json({ 
      message: error.message || '创建仪表板链接失败' 
    });
  }
}

export default withAuth(handler);
