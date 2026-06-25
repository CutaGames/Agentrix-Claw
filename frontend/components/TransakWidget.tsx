import React, { useEffect, useState } from 'react';
import { RefreshCw, AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react';

interface TransakWidgetProps {
  orderId: string;
  onSuccess?: (data: any) => void;
  onClose?: () => void;
}

const TransakWidget: React.FC<TransakWidgetProps> = ({ orderId, onSuccess, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<any>(null);

  useEffect(() => {
    const fetchSession = async () => {
      try {
        setLoading(true);
        const response = await fetch(`https://api.agentrix.top/api/payment/transak/session/${orderId}`, {
          method: 'POST',
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.message || 'Failed to create payment session');
        }

        const data = await response.json();
        setSessionData(data);
      } catch (err: any) {
        console.error('Transak session error:', err);
        setError(err.message || 'Connection error, please try again');
      } finally {
        setLoading(false);
      }
    };

    if (orderId) {
      fetchSession();
    }
  }, [orderId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl shadow-sm border border-gray-100">
        <RefreshCw className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
        <p className="text-gray-600 font-medium">Initializing Secure Payment...</p>
        <p className="text-gray-400 text-sm mt-2">Connecting to Transak Gateway</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 bg-white rounded-2xl shadow-sm border border-red-100 text-center">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">Payment Initialization Failed</h3>
        <p className="text-gray-600 mb-6">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100">
      <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-white" />
          </div>
          <span className="text-white font-bold">Secure Checkout</span>
        </div>
        <button 
          onClick={onClose}
          className="text-white/80 hover:text-white text-sm font-medium"
        >
          Cancel
        </button>
      </div>

      <div className="p-1">
        {sessionData?.url ? (
          <iframe
            src={sessionData.url}
            className="w-full h-[650px] border-0"
            allow="camera;microphone;fullscreen;payment"
          ></iframe>
        ) : (
          <div className="p-12 text-center">
            <p className="text-gray-500">Invalid session URL received.</p>
          </div>
        )}
      </div>

      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center text-xs text-gray-400">
        <div className="flex items-center gap-1">
          <ShieldCheck className="w-3 h-3" />
          PCI-DSS Compliant
        </div>
        <div className="flex items-center gap-1">
          Powered by Transak
          <ExternalLink className="w-3 h-3" />
        </div>
      </div>
    </div>
  );
};

function ShieldCheck({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

export default TransakWidget;
