import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const userId = (req as any).userId;
    const token = (req as any).token;
    const { returnUrl, refreshUrl } = req.body;
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

    // 调用后端创建 onboarding link
    const response = await fetch(`${API_BASE}/api/payments/connect/onboarding`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': req.headers.cookie || '',
        'Authorization': token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify({
        returnUrl,
        refreshUrl,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to create onboarding link');
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error: any) {
    console.error('创建 onboarding link 失败:', error);
    res.status(500).json({ 
      message: error.message || '创建入驻链接失败' 
    });
  }
}

export default withAuth(handler);
