import { NextApiRequest, NextApiResponse } from 'next';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || process.env.BACKEND_URL || 'http://localhost:3001/api';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { 
      amount, 
      currency = 'usd', 
      orderId,
      merchantId,
      agentId,
      description,
      skillLayerType,
    } = req.body;

    if (!amount) {
      return res.status(400).json({ message: 'Amount is required' });
    }

    // 调用后端 API 创建 PaymentIntent (使用公开端点)
    const response = await fetch(`${BACKEND_URL}/payments/stripe/create-intent-public`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 转发 authorization header
        ...(req.headers.authorization ? { 'Authorization': req.headers.authorization } : {}),
      },
      body: JSON.stringify({
        amount,
        currency,
        orderId,
        merchantId,
        agentId,
        description,
        skillLayerType,
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('Backend create-intent failed:', data);
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error: any) {
    console.error('Failed to create PaymentIntent:', error);
    return res.status(500).json({ 
      message: error.message || 'Failed to create payment intent',
    });
  }
}
