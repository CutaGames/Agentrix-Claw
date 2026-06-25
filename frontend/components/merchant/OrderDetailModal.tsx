import { Order } from '../../lib/api/order.api'

interface OrderDetailModalProps {
  order: Order | null
  onClose: () => void
  onShip?: (orderId: string) => void
  onRefund?: (orderId: string, reason?: string) => void
}

export function OrderDetailModal({ order, onClose, onShip, onRefund }: OrderDetailModalProps) {
  if (!order) return null

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800'
      case 'shipped': return 'bg-blue-100 text-blue-800'
      case 'paid': return 'bg-yellow-100 text-yellow-800'
      case 'pending': return 'bg-gray-100 text-gray-800'
      case 'cancelled': return 'bg-red-100 text-red-800'
      case 'refunded': return 'bg-purple-100 text-purple-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: '待支付',
      paid: '已支付',
      shipped: '已发货',
      completed: '已完成',
      cancelled: '已取消',
      refunded: '已退款',
    }
    return labels[status] || status
  }

  const items = order.metadata?.items || (order.productId ? [{
    productId: order.productId,
    quantity: 1,
    price: order.amount,
    name: order.metadata?.productName || '商品',
  }] : [])

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-900">订单详情</h2>
            <p className="text-sm text-gray-500 mt-1">订单号: {order.id}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none w-8 h-8 flex items-center justify-center"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* 订单状态 */}
          <div className="flex items-center justify-between">
            <div>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(order.status)}`}>
                {getStatusLabel(order.status)}
              </span>
            </div>
            <div className="text-sm text-gray-500">
              创建时间: {new Date(order.createdAt).toLocaleString('zh-CN')}
            </div>
          </div>

          {/* 商品信息 */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-3">商品信息</h3>
            <div className="space-y-3">
              {items.map((item: any, index: number) => (
                <div key={index} className="flex justify-between items-center">
                  <div>
                    <p className="font-medium text-gray-900">{item.name || `商品 ${item.productId}`}</p>
                    <p className="text-sm text-gray-500">数量: {item.quantity}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900">
                      {order.currency === 'CNY' ? '¥' : order.currency === 'USD' ? '$' : order.currency}
                      {(item.price * item.quantity).toLocaleString()}
                    </p>
                    <p className="text-sm text-gray-500">
                      单价: {order.currency === 'CNY' ? '¥' : order.currency === 'USD' ? '$' : order.currency}
                      {item.price.toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 金额信息 */}
          <div className="border-t border-gray-200 pt-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-600">商品总额</span>
              <span className="font-medium text-gray-900">
                {order.currency === 'CNY' ? '¥' : order.currency === 'USD' ? '$' : order.currency}
                {order.amount.toLocaleString()}
              </span>
            </div>
            {order.metadata?.platformTax && (
              <div className="flex justify-between items-center mb-2 text-sm text-gray-500">
                <span>平台税费</span>
                <span>
                  {order.currency === 'CNY' ? '¥' : order.currency === 'USD' ? '$' : order.currency}
                  {order.metadata.platformTax.toLocaleString()}
                </span>
              </div>
            )}
            {order.metadata?.merchantNetAmount && (
              <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                <span className="font-semibold text-gray-900">商户实收</span>
                <span className="font-bold text-lg text-blue-600">
                  {order.currency === 'CNY' ? '¥' : order.currency === 'USD' ? '$' : order.currency}
                  {order.metadata.merchantNetAmount.toLocaleString()}
                </span>
              </div>
            )}
          </div>

          {/* 客户信息 */}
          {order.metadata?.customerName && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-3">客户信息</h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-500">姓名:</span>
                  <span className="ml-2 text-gray-900">{order.metadata.customerName}</span>
                </div>
                {order.metadata.customerEmail && (
                  <div>
                    <span className="text-gray-500">邮箱:</span>
                    <span className="ml-2 text-gray-900">{order.metadata.customerEmail}</span>
                  </div>
                )}
                {order.metadata.customerPhone && (
                  <div>
                    <span className="text-gray-500">电话:</span>
                    <span className="ml-2 text-gray-900">{order.metadata.customerPhone}</span>
                  </div>
                )}
                {order.metadata.shippingAddress && (
                  <div>
                    <span className="text-gray-500">收货地址:</span>
                    <span className="ml-2 text-gray-900">{order.metadata.shippingAddress}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Agent信息 */}
          {(order.metadata?.agentId || order.metadata?.channel) && (
            <div className="bg-blue-50 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-3">Agent信息</h3>
              <div className="space-y-2 text-sm">
                {order.metadata?.agentId && (
                  <div>
                    <span className="text-blue-700">Agent ID:</span>
                    <span className="ml-2 text-blue-900">{order.metadata.agentId}</span>
                  </div>
                )}
                {order.metadata?.channel && (
                  <div>
                    <span className="text-blue-700">渠道:</span>
                    <span className="ml-2 text-blue-900">{order.metadata.channel}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 支付信息 */}
          {order.paymentMethod && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-3">支付信息</h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-500">支付方式:</span>
                  <span className="ml-2 text-gray-900">{order.paymentMethod}</span>
                </div>
                {order.transactionHash && (
                  <div>
                    <span className="text-gray-500">交易哈希:</span>
                    <span className="ml-2 text-gray-900 font-mono text-xs">{order.transactionHash}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex space-x-3 pt-4 border-t border-gray-200">
            {order.status === 'paid' && onShip && (
              <button
                onClick={() => onShip(order.id)}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                发货
              </button>
            )}
            {(order.status === 'paid' || order.status === 'shipped') && onRefund && (
              <button
                onClick={() => {
                  const reason = prompt('请输入退款原因:')
                  if (reason) {
                    onRefund(order.id, reason)
                  }
                }}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg font-semibold hover:bg-red-700 transition-colors"
              >
                退款
              </button>
            )}
            <button
              onClick={onClose}
              className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

