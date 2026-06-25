import { useState, useEffect } from 'react';
import { logisticsApi, LogisticsTracking } from '../../lib/api/logistics.api';
import { useToast } from '../../contexts/ToastContext';

interface LogisticsTrackingProps {
  orderId: string;
  onClose?: () => void;
}

export function LogisticsTrackingPanel({ orderId, onClose }: LogisticsTrackingProps) {
  const { error } = useToast();
  const [tracking, setTracking] = useState<LogisticsTracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    loadTracking();
  }, [orderId]);

  useEffect(() => {
    if (!autoRefresh || !tracking) return;

    const interval = setInterval(() => {
      loadTracking();
    }, 30000); // 每30秒自动刷新

    return () => clearInterval(interval);
  }, [autoRefresh, tracking]);

  const loadTracking = async () => {
    try {
      setLoading(true);
      const data = await logisticsApi.getTracking(orderId);
      setTracking(data);
    } catch (err: any) {
      error(err.message || '加载物流信息失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAutoUpdate = async () => {
    try {
      setLoading(true);
      const data = await logisticsApi.autoUpdate(orderId);
      if (data) {
        setTracking(data);
      }
    } catch (err: any) {
      error(err.message || '自动更新失败');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: LogisticsTracking['status']) => {
    const colors: Record<LogisticsTracking['status'], string> = {
      pending: 'bg-gray-100 text-gray-800',
      packed: 'bg-blue-100 text-blue-800',
      shipped: 'bg-purple-100 text-purple-800',
      in_transit: 'bg-yellow-100 text-yellow-800',
      delivered: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusText = (status: LogisticsTracking['status']) => {
    const texts: Record<LogisticsTracking['status'], string> = {
      pending: '待发货',
      packed: '已打包',
      shipped: '已发货',
      in_transit: '运输中',
      delivered: '已送达',
      failed: '配送失败',
    };
    return texts[status] || status;
  };

  if (loading && !tracking) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!tracking) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>暂无物流信息</p>
        <button
          onClick={handleAutoUpdate}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
        >
          自动更新物流信息
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 状态卡片 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">物流跟踪</h3>
          <div className="flex items-center space-x-3">
            <label className="flex items-center space-x-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span>自动刷新</span>
            </label>
            <button
              onClick={handleAutoUpdate}
              className="px-3 py-1 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
            >
              刷新
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className={`px-4 py-2 rounded-lg font-semibold ${getStatusColor(tracking.status)}`}>
            {getStatusText(tracking.status)}
          </div>
          {tracking.trackingNumber && (
            <div className="flex-1">
              <div className="text-sm text-gray-600">物流单号</div>
              <div className="font-mono font-semibold text-gray-900">{tracking.trackingNumber}</div>
            </div>
          )}
          {tracking.carrier && (
            <div>
              <div className="text-sm text-gray-600">承运商</div>
              <div className="font-semibold text-gray-900">{tracking.carrier}</div>
            </div>
          )}
        </div>

        {tracking.estimatedDelivery && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <div className="text-sm text-gray-600">预计送达时间</div>
            <div className="font-semibold text-blue-900">
              {new Date(tracking.estimatedDelivery).toLocaleString('zh-CN')}
            </div>
          </div>
        )}

        {tracking.currentLocation && (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600">当前位置</div>
            <div className="font-semibold text-gray-900">{tracking.currentLocation}</div>
          </div>
        )}
      </div>

      {/* 物流事件时间线 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h4 className="text-lg font-bold text-gray-900 mb-4">物流轨迹</h4>
        {tracking.events.length === 0 ? (
          <div className="text-center py-8 text-gray-500">暂无物流轨迹</div>
        ) : (
          <div className="space-y-4">
            {tracking.events.map((event, index) => (
              <div key={index} className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      index === 0 ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  ></div>
                  {index < tracking.events.length - 1 && (
                    <div className="w-px h-12 bg-gray-300 ml-1.5"></div>
                  )}
                </div>
                <div className="flex-1 pb-4">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-gray-900">{event.description}</div>
                    <div className="text-sm text-gray-500">
                      {new Date(event.timestamp).toLocaleString('zh-CN')}
                    </div>
                  </div>
                  {event.location && (
                    <div className="text-sm text-gray-600 mt-1">📍 {event.location}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

