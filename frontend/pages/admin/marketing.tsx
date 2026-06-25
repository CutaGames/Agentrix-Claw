import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { 
  Activity, 
  ArrowLeft, 
  BarChart3, 
  PieChart, 
  Target, 
  Zap,
  RefreshCw,
  Calendar
} from 'lucide-react';
import { API_BASE_URL } from '../../utils/api-config';

export default function MarketingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) {
      router.replace('/admin/login');
      return;
    }
    fetchMarketingData(token);
  }, [router]);

  const fetchMarketingData = async (token: string) => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/admin/marketing`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch marketing data');
      const result = await response.json();
      setData(result);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-8 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push('/admin')}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h2 className="text-xl font-semibold text-gray-800">Marketing Analytics</h2>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-white transition-colors">
            <Calendar className="w-4 h-4" />
            Last 30 Days
          </button>
          <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-indigo-700 transition-colors">
            <Zap className="w-4 h-4" />
            Generate Report
          </button>
        </div>
      </header>

      <main className="p-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-600" />
                Conversion Funnel
              </h3>
              <button className="text-xs text-gray-400 hover:text-indigo-600">Details</button>
            </div>
            <div className="space-y-6">
              <FunnelStep label="Website Visits" value="45,200" percentage={100} color="bg-indigo-500" />
              <FunnelStep label="Signups" value="8,400" percentage={18.5} color="bg-blue-500" />
              <FunnelStep label="Active Agents" value="2,100" percentage={4.6} color="bg-purple-500" />
              <FunnelStep label="Paid Users" value="420" percentage={0.9} color="bg-green-500" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <PieChart className="w-5 h-5 text-indigo-600" />
                Traffic Sources
              </h3>
              <button className="text-xs text-gray-400 hover:text-indigo-600">Details</button>
            </div>
            <div className="flex flex-col gap-4">
              <SourceItem label="Direct" value="42%" color="bg-indigo-500" />
              <SourceItem label="Social Media" value="28%" color="bg-blue-500" />
              <SourceItem label="Referral" value="18%" color="bg-purple-500" />
              <SourceItem label="Search" value="12%" color="bg-green-500" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <Target className="w-5 h-5 text-indigo-600" />
              Campaign Performance
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 font-medium">Campaign Name</th>
                  <th className="px-6 py-4 font-medium">Reach</th>
                  <th className="px-6 py-4 font-medium">CTR</th>
                  <th className="px-6 py-4 font-medium">Conversions</th>
                  <th className="px-6 py-4 font-medium">ROI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                <tr className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">Winter Launch 2024</td>
                  <td className="px-6 py-4 text-gray-600">124,000</td>
                  <td className="px-6 py-4 text-gray-600">3.2%</td>
                  <td className="px-6 py-4 text-gray-600">1,240</td>
                  <td className="px-6 py-4 text-green-600 font-medium">240%</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">Developer Outreach</td>
                  <td className="px-6 py-4 text-gray-600">45,000</td>
                  <td className="px-6 py-4 text-gray-600">5.8%</td>
                  <td className="px-6 py-4 text-gray-600">850</td>
                  <td className="px-6 py-4 text-green-600 font-medium">180%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

function FunnelStep({ label, value, percentage, color }: any) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold text-gray-900">{value} ({percentage}%)</span>
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${percentage}%` }}></div>
      </div>
    </div>
  );
}

function SourceItem({ label, value, color }: any) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-3 h-3 rounded-full ${color}`}></div>
      <span className="text-sm text-gray-600 flex-1">{label}</span>
      <span className="text-sm font-semibold text-gray-900">{value}</span>
    </div>
  );
}
