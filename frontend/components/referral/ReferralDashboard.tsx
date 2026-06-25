import { useState, useEffect } from 'react';
import { referralApi, MerchantReferral, ReferralStats, ReferralCommission } from '../../lib/api/referral.api';
import { useToast } from '../../contexts/ToastContext';

export function ReferralDashboard() {
  const { success, error } = useToast();
  const [referrals, setReferrals] = useState<MerchantReferral[]>([]);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [pendingCommissions, setPendingCommissions] = useState<ReferralCommission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReferral, setSelectedReferral] = useState<MerchantReferral | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [referralsData, statsData, commissionsData] = await Promise.all([
        referralApi.getMyReferrals(),
        referralApi.getReferralStats(),
        referralApi.getPendingCommissions(),
      ]);
      setReferrals(referralsData);
      setStats(statsData);
      setPendingCommissions(commissionsData);
    } catch (err: any) {
      error(err.message || '加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateReferral = async (formData: {
    merchantId: string;
    merchantName?: string;
    merchantEmail?: string;
  }) => {
    try {
      await referralApi.createReferral(formData);
      success('推广关系创建成功，等待审核');
      setShowCreateModal(false);
      loadData();
    } catch (err: any) {
      error(err.message || '创建推广关系失败');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <div className="text-sm text-gray-600 mb-1">总推广数</div>
            <div className="text-2xl font-bold text-gray-900">{stats.totalReferrals}</div>
          </div>
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <div className="text-sm text-gray-600 mb-1">活跃推广</div>
            <div className="text-2xl font-bold text-green-600">{stats.activeReferrals}</div>
          </div>
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <div className="text-sm text-gray-600 mb-1">累计分成</div>
            <div className="text-2xl font-bold text-blue-600">
              ${stats.totalCommissionEarned.toFixed(2)}
            </div>
          </div>
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <div className="text-sm text-gray-600 mb-1">待结算</div>
            <div className="text-2xl font-bold text-orange-600">
              ${stats.pendingCommissions.toFixed(2)}
            </div>
          </div>
        </div>
      )}

      {/* 操作栏 */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">我的推广关系</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          + 创建推广关系
        </button>
      </div>

      {/* 推广关系列表 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {referrals.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>暂无推广关系</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 text-blue-600 hover:text-blue-700 font-semibold"
            >
              立即创建
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {referrals.map((referral) => (
              <div
                key={referral.id}
                className="p-6 hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => setSelectedReferral(referral)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <h3 className="font-semibold text-gray-900">
                        {referral.merchantName || referral.merchantId}
                      </h3>
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          referral.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : referral.status === 'approved'
                            ? 'bg-blue-100 text-blue-800'
                            : referral.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {referral.status === 'active'
                          ? '活跃'
                          : referral.status === 'approved'
                          ? '已通过'
                          : referral.status === 'pending'
                          ? '待审核'
                          : '已拒绝'}
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-gray-600">
                      {referral.merchantEmail && <div>邮箱: {referral.merchantEmail}</div>}
                      <div className="mt-1">
                        分成比例: {(referral.commissionRate * 100).toFixed(2)}%
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-600">累计GMV</div>
                    <div className="text-lg font-bold text-gray-900">
                      ${referral.totalMerchantGMV.toFixed(2)}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">累计分成</div>
                    <div className="text-lg font-bold text-blue-600">
                      ${referral.totalCommissionEarned.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 待结算分成 */}
      {pendingCommissions.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">待结算分成</h3>
          <div className="space-y-3">
            {pendingCommissions.slice(0, 5).map((commission) => (
              <div
                key={commission.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div>
                  <div className="text-sm text-gray-600">支付金额</div>
                  <div className="font-semibold text-gray-900">
                    ${commission.paymentAmount.toFixed(2)} {commission.currency}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-600">分成金额</div>
                  <div className="font-semibold text-blue-600">
                    ${commission.commissionAmount.toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 创建推广关系模态框 */}
      {showCreateModal && (
        <CreateReferralModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateReferral}
        />
      )}

      {/* 推广关系详情模态框 */}
      {selectedReferral && (
        <ReferralDetailModal
          referral={selectedReferral}
          onClose={() => setSelectedReferral(null)}
        />
      )}
    </div>
  );
}

function CreateReferralModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (data: { merchantId: string; merchantName?: string; merchantEmail?: string }) => void;
}) {
  const [form, setForm] = useState({
    merchantId: '',
    merchantName: '',
    merchantEmail: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.merchantId.trim()) return;
    onSubmit(form);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">创建推广关系</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              商户ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.merchantId}
              onChange={(e) => setForm({ ...form, merchantId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">商户名称</label>
            <input
              type="text"
              value={form.merchantName}
              onChange={(e) => setForm({ ...form, merchantName: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">商户邮箱</label>
            <input
              type="email"
              value={form.merchantEmail}
              onChange={(e) => setForm({ ...form, merchantEmail: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="flex space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
            >
              创建
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReferralDetailModal({
  referral,
  onClose,
}: {
  referral: MerchantReferral;
  onClose: () => void;
}) {
  const [commissions, setCommissions] = useState<ReferralCommission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCommissions();
  }, [referral.id]);

  const loadCommissions = async () => {
    try {
      setLoading(true);
      const data = await referralApi.getReferralCommissions(referral.id);
      setCommissions(data);
    } catch (err) {
      console.error('加载分成记录失败:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-gray-900">推广关系详情</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="space-y-6">
          {/* 基本信息 */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 mb-3">基本信息</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">商户名称:</span>
                <span className="ml-2 font-medium">{referral.merchantName || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-600">商户ID:</span>
                <span className="ml-2 font-medium">{referral.merchantId}</span>
              </div>
              <div>
                <span className="text-gray-600">状态:</span>
                <span className="ml-2 font-medium">{referral.status}</span>
              </div>
              <div>
                <span className="text-gray-600">分成比例:</span>
                <span className="ml-2 font-medium">{(referral.commissionRate * 100).toFixed(2)}%</span>
              </div>
            </div>
          </div>

          {/* 分成记录 */}
          <div>
            <h4 className="font-semibold text-gray-900 mb-3">分成记录</h4>
            {loading ? (
              <div className="text-center py-8">加载中...</div>
            ) : commissions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">暂无分成记录</div>
            ) : (
              <div className="space-y-2">
                {commissions.map((commission) => (
                  <div
                    key={commission.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <div className="text-sm text-gray-600">
                        {new Date(commission.createdAt).toLocaleDateString()}
                      </div>
                      <div className="font-semibold text-gray-900">
                        ${commission.paymentAmount.toFixed(2)} {commission.currency}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-600">分成</div>
                      <div className="font-semibold text-blue-600">
                        ${commission.commissionAmount.toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

