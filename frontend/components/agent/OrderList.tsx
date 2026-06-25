import { useState, useEffect } from 'react';
import { apiClient } from '../../lib/api/client';
import { LogisticsTrackingPanel } from '../logistics/LogisticsTracking';

export interface Order {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'shipped' | 'completed' | 'cancelled';
  createdAt: string;
  metadata?: any;
}

interface OrderListProps {
  onOrderClick?: (order: Order) => void;
}

export function OrderList({ onOrderClick }: OrderListProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'paid' | 'shipped' | 'completed'>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showLogistics, setShowLogistics] = useState(false);

  useEffect(() => {
    loadOrders();
  }, [filter]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      // 实际应该调用订单API
      const data = await apiClient.get<Order[]>('/orders');
      setOrders(data || []);
    } catch (error) {
      console.error('加载订单失败:', error);
      // 使用模拟数据
      setOrders([
        {
          id: 'order_1',
          productId: 'prod_1',
          productName: '示例商品',
          quantity: 1,
          amount: 100,
          currency: 'CNY',
          status: 'paid',
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      paid: 'bg-blue-100 text-blue-800',
      shipped: 'bg-purple-100 text-purple-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusText = (status: string) => {
    const texts: Record<string, string> = {
      pending: '待支付',
      paid: '已支付',
      shipped: '已发货',
      completed: '已完成',
      cancelled: '已取消',
    };
    return texts[status] || status;
  };

  const filteredOrders = filter === 'all' 
    ? orders 
    : orders.filter(order => order.status === filter);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 筛选器 */}
      <div className="flex space-x-2 overflow-x-auto pb-2">
        {(['all', 'pending', 'paid', 'shipped', 'completed'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-lg whitespace-nowrap ${
              filter === status
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {status === 'all' ? '全部' : getStatusText(status)}
          </button>
        ))}
      </div>

      {/* 订单列表 */}
      <div className="space-y-3">
        {filteredOrders.map((order) => (
          <div
            key={order.id}
            onClick={() => onOrderClick?.(order)}
            className="bg-white border border-gray-200 rounded-lg p-4 cursor-pointer hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-semibold text-gray-900">{order.productName}</h3>
                <p className="text-sm text-gray-600">订单号: {order.id}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(order.status)}`}>
                {getStatusText(order.status)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>数量: {order.quantity}</span>
              <span className="text-lg font-bold text-gray-900">
                {order.currency} {order.amount.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between mt-3">
              <div className="text-xs text-gray-500">
                创建时间: {new Date(order.createdAt).toLocaleString('zh-CN')}
              </div>
              {(order.status === 'shipped' || order.status === 'paid') && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedOrder(order);
                    setShowLogistics(true);
                  }}
                  className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700"
                >
                  查看物流
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {filteredOrders.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <div className="text-4xl mb-2">📦</div>
          <div>暂无订单</div>
        </div>
      )}

      {/* 物流跟踪模态框 */}
      {showLogistics && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">物流跟踪 - {selectedOrder.productName}</h3>
              <button
                onClick={() => {
                  setShowLogistics(false);
                  setSelectedOrder(null);
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>
            <LogisticsTrackingPanel
              orderId={selectedOrder.id}
              onClose={() => {
                setShowLogistics(false);
                setSelectedOrder(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

