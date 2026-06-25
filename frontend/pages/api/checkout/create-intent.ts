/**
 * API: Create Payment Intent for Guest Checkout
 * 
 * POST /api/checkout/create-intent
 * Proxies to backend to create Stripe PaymentIntent for guest users
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.agentrix.top';

interface CreateIntentRequest {
  productId: string;
  quantity: number;
  email: string;
  guestSessionId?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { productId, quantity, email, guestSessionId } = req.body as CreateIntentRequest;

    // Validate required fields
    if (!productId || !email) {
      return res.status(400).json({ error: 'Missing required fields: productId, email' });
    }

    // Proxy to backend API which handles Stripe
    const backendRes = await fetch(`${API_BASE_URL}/api/payment/guest-intent`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        productId,
        quantity: quantity || 1,
        email,
        guestSessionId,
        source: 'agent_checkout',
      }),
    });

    if (!backendRes.ok) {
      const errorData = await backendRes.json().catch(() => ({}));
      return res.status(backendRes.status).json({ 
        error: errorData.message || 'Failed to create payment intent' 
      });
    }

    const data = await backendRes.json();

    return res.status(200).json({
      clientSecret: data.clientSecret,
      paymentIntentId: data.paymentIntentId,
    });
  } catch (error: any) {
    console.error('Create intent error:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to create payment intent' 
    });
  }
}
