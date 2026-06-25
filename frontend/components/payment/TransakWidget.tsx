import React, { useEffect, useState, useRef } from 'react';
import { paymentApi } from '@/lib/api/payment.api';

interface TransakWidgetProps {
  apiKey?: string;
  environment?: 'STAGING' | 'PRODUCTION';
  amount?: number;
  fiatCurrency?: string;
  cryptoCurrency?: string;
  network?: string;
  walletAddress?: string;
  orderId: string;
  userId?: string;
  email?: string;
  directPayment?: boolean;
  onSuccess?: (data: any) => void;
  onError?: (error: any) => void;
  onEvent?: (eventType: string, data?: any) => void;
  onClose?: () => void;
}

export const TransakWidget: React.FC<TransakWidgetProps> = ({
  amount,
  fiatCurrency,
  cryptoCurrency = 'USDC',
  network = 'bsc',
  walletAddress,
  orderId,
  email,
  onSuccess,
  onError,
  onEvent,
  onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [widgetUrl, setWidgetUrl] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const createSession = async () => {
      if (!amount || !walletAddress) {
        setError('Missing required parameters (amount or walletAddress)');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // 使用正确的 Create Session API
        // amount 应该是合约需要收到的 USDC 金额（商品价格）
        // Transak 会基于此计算用户需要支付的法币金额（包含 fee）
        const result = await paymentApi.createTransakSession({
          amount: amount,
          fiatCurrency: fiatCurrency || 'USD',
          cryptoCurrency: cryptoCurrency,
          network: network,
          walletAddress: walletAddress,
          orderId: orderId,
          email: email,
          hideMenu: true,
          disableWalletAddressForm: true,
          disableFiatAmountEditing: true, // 锁定金额不可编辑
          isKYCRequired: true,
        });

        if (result?.widgetUrl) {
          setWidgetUrl(result.widgetUrl);
          console.log('✅ Transak Session created:', result.sessionId);
          onEvent?.('TRANSAK_SESSION_CREATED', { sessionId: result.sessionId });
        } else {
          throw new Error('No widget URL returned from API');
        }
      } catch (err: any) {
        console.error('Failed to create Transak session:', err);
        const message = err?.message || 'Failed to initialize payment';
        setError(message);
        onError?.({ message, fallbackToRedirect: false });
      } finally {
        setLoading(false);
      }
    };

    createSession();
  }, [amount, fiatCurrency, cryptoCurrency, network, walletAddress, orderId, email]);

  // 监听来自 Transak iframe 的消息
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // 验证消息来源
      if (!event.origin.includes('transak.com')) return;

      const { event_id: eventId, data } = event.data || {};
      if (!eventId) return;

      console.log('📨 Transak iframe message:', eventId, data);
      onEvent?.(eventId, data);

      // 处理成功和失败事件
      if (eventId === 'TRANSAK_ORDER_SUCCESSFUL') {
        onSuccess?.(data);
      } else if (eventId === 'TRANSAK_ORDER_FAILED') {
        onError?.({ message: data?.message || 'Payment failed', ...data });
      } else if (eventId === 'TRANSAK_WIDGET_CLOSE') {
        onClose?.();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onSuccess, onError, onEvent, onClose]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto mb-2" />
          <p className="text-sm text-slate-500">正在初始化支付...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <div className="text-red-500 mb-2">⚠️</div>
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      {widgetUrl && (
        <iframe
          ref={iframeRef}
          src={widgetUrl}
          className="w-full h-full border-0"
          allow="camera;microphone;fullscreen;payment"
          title="Transak Payment Widget"
        />
      )}
    </div>
  );
};

export default TransakWidget;

