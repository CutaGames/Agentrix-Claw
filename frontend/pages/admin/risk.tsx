import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { API_BASE_URL } from '../../utils/api-config';

interface RiskAssessment {
  id: string;
  riskScore: number;
  riskLevel: string;
  decision: string;
  createdAt: string;
  payment?: {
    id: string;
    amount: number;
  };
  user?: {
    email: string;
  };
}

interface RiskOrder {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
  user?: {
    email: string;
  };
}

export default function AdminRisk() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'assessments' | 'orders' | 'users'>('assessments');
  const [assessments, setAssessments] = useState<RiskAssessment[]>([]);
  const [orders, setOrders] = useState<RiskOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetchStats();
    if (activeTab === 'assessments') {
      fetchAssessments();
    } else if (activeTab === 'orders') {
      fetchRiskOrders();
    }
  }, [activeTab]);

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`${API_BASE_URL}/api/admin/risk/statistics`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch risk stats:', error);
    }
  };

  const fetchAssessments = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`${API_BASE_URL}/api/admin/risk/assessments?limit=20`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setAssessments(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch assessments:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRiskOrders = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`${API_BASE_URL}/api/admin/risk/orders?limit=20`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setOrders(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch risk orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'high':
        return 'bg-red-100 text-red-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getDecisionColor = (decision: string) => {
    switch (decision) {
      case 'reject':
        return 'bg-red-100 text-red-800';
      case 'review':
        return 'bg-yellow-100 text-yellow-800';
      case 'approve':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <>
      <Head>
        <title>Risk Management - Agentrix Admin</title>
      </Head>
      <div className="min-h-screen bg-gray-50">
        <div className="ml-64 p-8">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-gray-900">Risk Management</h2>
            <p className="text-gray-600 mt-2">Risk monitoring and handling</p>
          </div>

          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-sm text-gray-600">Total Risk Assessments</div>
                <div className="text-3xl font-bold text-gray-900 mt-2">{stats.total || 0}</div>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-sm text-gray-600">High Risk Count</div>
                <div className="text-3xl font-bold text-red-600 mt-2">{stats.highRiskCount || 0}</div>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-sm text-gray-600">Pending Review</div>
                <div className="text-3xl font-bold text-yellow-600 mt-2">
                  {stats.byDecision?.review || 0}
                </div>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-sm text-gray-600">Rejected</div>
                <div className="text-3xl font-bold text-red-600 mt-2">
                  {stats.byDecision?.reject || 0}
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="mb-6 border-b border-gray-200">
            <nav className="flex space-x-8">
              <button
                onClick={() => setActiveTab('assessments')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'assessments'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Risk Assessments
              </button>
              <button
                onClick={() => setActiveTab('orders')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'orders'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Risk Orders
              </button>
              <button
                onClick={() => setActiveTab('users')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'users'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Risk Users
              </button>
            </nav>
          </div>

          {/* Content */}
          {loading ? (
            <div className="text-center py-12">Loading...</div>
          ) : activeTab === 'assessments' ? (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Risk Score
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Risk Level
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Decision
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Time
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {assessments.map((assessment) => (
                    <tr key={assessment.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {assessment.id.slice(0, 8)}...
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {assessment.user?.email || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {assessment.riskScore}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${getRiskLevelColor(
                            assessment.riskLevel
                          )}`}
                        >
                          {assessment.riskLevel}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${getDecisionColor(
                            assessment.decision
                          )}`}
                        >
                          {assessment.decision}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(assessment.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : activeTab === 'orders' ? (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Order ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Time
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {order.id.slice(0, 8)}...
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {order.user?.email || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${order.amount}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                          {order.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(order.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              Risk user list coming soon...
            </div>
          )}
        </div>
      </div>
    </>
  );
}

