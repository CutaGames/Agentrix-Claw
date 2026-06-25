import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-08-16',
});

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { orderId, amount, currency = 'usd', metadata = {} } = req.body;
    const userId = (req as any).userId;

    if (!orderId || !amount) {
      return res.status(400).json({ message: '缺少必要参数' });
    }

    // 创建 PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount, // 已经是分为单位
      currency: currency.toLowerCase(),
      metadata: {
        userId,
        orderId,
        source: 'smart_checkout',
        ...metadata,
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error: any) {
    console.error('创建 PaymentIntent 失败:', error);
    res.status(500).json({ 
      message: error.message || '创建支付意向失败' 
    });
  }
}

export default withAuth(handler);
