import { useState, useEffect } from 'react';
import { 
  Store, 
  RefreshCw, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Settings, 
  ExternalLink,
  ShoppingBag,
  Globe,
  Database,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Connection {
  id: string;
  platform: 'shopify' | 'woocommerce' | 'magento' | 'bigcommerce' | 'custom';
  storeName: string;
  storeUrl?: string;
  status: 'active' | 'inactive' | 'error' | 'syncing';
  isActive: boolean;
  lastSyncAt?: string;
  lastSyncStatus?: string;
  syncConfig: {
    autoSync: boolean;
    syncInterval: number;
    syncInventory: boolean;
    syncPrices: boolean;
    syncImages: boolean;
  };
  stats: {
    totalProducts: number;
    syncedProducts: number;
    failedProducts: number;
  };
  createdAt: string;
}

interface SyncResult {
  success: boolean;
  imported: number;
  updated: number;
  failed: number;
  errors: string[];
}

const platformConfig = {
  shopify: {
    name: 'Shopify',
    icon: ShoppingBag,
    color: 'bg-[#95BF47]',
    textColor: 'text-[#95BF47]',
    description: 'Connect your Shopify store to sync products and inventory automatically.',
    fields: ['apiKey', 'apiSecret', 'storeDomain'],
  },
  woocommerce: {
    name: 'WooCommerce',
    icon: Store,
    color: 'bg-[#96588a]',
    textColor: 'text-[#96588a]',
    description: 'Sync products from your WordPress WooCommerce store.',
    fields: ['consumerKey', 'consumerSecret', 'storeUrl'],
  },
  magento: {
    name: 'Magento',
    icon: Store,
    color: 'bg-[#f46f25]',
    textColor: 'text-[#f46f25]',
    description: 'Enterprise integration for Adobe Commerce (Magento).',
    fields: ['accessToken', 'storeUrl'],
  },
  bigcommerce: {
    name: 'BigCommerce',
    icon: Globe,
    color: 'bg-[#121118]',
    textColor: 'text-[#121118]',
    description: 'Seamless integration with BigCommerce storefronts.',
    fields: ['accessToken', 'storeHash', 'clientId'],
  },
  custom: {
    name: 'Custom API',
    icon: Database,
    color: 'bg-slate-600',
    textColor: 'text-slate-600',
    description: 'Connect any platform using our standard REST API.',
    fields: ['apiEndpoint', 'apiKey'],
  },
};

export function EcommerceSyncPanel() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<keyof typeof platformConfig | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  const [formData, setFormData] = useState<Record<string, string>>({
    storeName: '',
    storeUrl: '',
    apiKey: '',
    apiSecret: '',
    consumerKey: '',
    consumerSecret: '',
    accessToken: '',
    storeHash: '',
    clientId: '',
    apiEndpoint: '',
  });

  const apiBaseUrl = typeof window !== 'undefined'
    ? (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://localhost:3001/api'
      : 'https://api.agentrix.top/api')
    : 'http://localhost:3001/api';

  const getToken = () => localStorage.getItem('access_token') || localStorage.getItem('token');

  useEffect(() => {
    fetchConnections();
  }, []);

  const fetchConnections = async () => {
    try {
      setLoading(true);
      const token = getToken();
      
      // Mock data for demo/dev environment or if no token
      if (process.env.NODE_ENV === 'development' || !token) {
         setConnections([
           {
             id: '1',
             platform: 'shopify',
             storeName: 'My Fashion Store',
             storeUrl: 'https://fashion-demo.myshopify.com',
             status: 'active',
             isActive: true,
             lastSyncAt: new Date().toISOString(),
             syncConfig: { autoSync: true, syncInterval: 60, syncInventory: true, syncPrices: true, syncImages: true },
             stats: { totalProducts: 120, syncedProducts: 120, failedProducts: 0 },
             createdAt: new Date().toISOString()
           },
           {
             id: '2',
             platform: 'woocommerce',
             storeName: 'Gadget Shop',
             storeUrl: 'https://gadgets.example.com',
             status: 'error',
             isActive: false,
             lastSyncAt: new Date(Date.now() - 86400000).toISOString(),
             syncConfig: { autoSync: false, syncInterval: 60, syncInventory: true, syncPrices: true, syncImages: false },
             stats: { totalProducts: 45, syncedProducts: 40, failedProducts: 5 },
             createdAt: new Date().toISOString()
           }
         ]);
         setLoading(false);
         return;
      }

      const response = await fetch(`${apiBaseUrl}/ecommerce/connections`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch connections');

      const data = await response.json();
      setConnections(data.data || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateConnection = async () => {
    if (!selectedPlatform) return;

    try {
      const token = getToken();
      const credentials: Record<string, string> = {};
      
      platformConfig[selectedPlatform].fields.forEach(field => {
        if (formData[field]) credentials[field] = formData[field];
      });

      // Mock creation
      if ((process.env.NODE_ENV === 'development' || !token)) {
        setConnections([...connections, {
          id: Date.now().toString(),
          platform: selectedPlatform,
          storeName: formData.storeName,
          storeUrl: formData.storeUrl,
          status: 'active',
          isActive: true,
          lastSyncAt: new Date().toISOString(),
          syncConfig: { autoSync: true, syncInterval: 60, syncInventory: true, syncPrices: true, syncImages: true },
          stats: { totalProducts: 0, syncedProducts: 0, failedProducts: 0 },
          createdAt: new Date().toISOString()
        }]);
        setShowAddModal(false);
        resetForm();
        return;
      }

      const response = await fetch(`${apiBaseUrl}/ecommerce/connections`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          platform: selectedPlatform,
          storeName: formData.storeName,
          storeUrl: formData.storeUrl,
          credentials,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create connection');
      }

      setShowAddModal(false);
      resetForm();
      fetchConnections();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const resetForm = () => {
    setSelectedPlatform(null);
    setFormData({
      storeName: '',
      storeUrl: '',
      apiKey: '',
      apiSecret: '',
      consumerKey: '',
      consumerSecret: '',
      accessToken: '',
      storeHash: '',
      clientId: '',
      apiEndpoint: '',
    });
  };

  const handleSync = async (connectionId: string) => {
    try {
      setSyncingId(connectionId);
      setSyncResult(null);
      const token = getToken();

      // Mock sync
      if ((process.env.NODE_ENV === 'development' || !token)) {
        await new Promise(r => setTimeout(r, 2000));
        setSyncResult({ success: true, imported: 5, updated: 2, failed: 0, errors: [] });
        setSyncingId(null);
        return;
      }

      const response = await fetch(`${apiBaseUrl}/ecommerce/connections/${connectionId}/sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Sync failed');

      const data = await response.json();
      setSyncResult(data.data);
      fetchConnections();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSyncingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      active: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
      inactive: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
      error: 'bg-red-500/10 text-red-500 border-red-500/20',
      syncing: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    };
    const style = styles[status as keyof typeof styles] || styles.inactive;
    const label = status === 'active' ? 'Connected' : status === 'syncing' ? 'Syncing...' : status.charAt(0).toUpperCase() + status.slice(1);
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${style}`}>
        {status === 'active' && <CheckCircle2 className="w-3 h-3 mr-1" />}
        {status === 'error' && <AlertCircle className="w-3 h-3 mr-1" />}
        {status === 'syncing' && <RefreshCw className="w-3 h-3 mr-1 animate-spin" />}
        {label}
      </span>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">E-commerce Sync</h2>
          <p className="text-slate-400 text-sm mt-1">Connect your existing stores and sync products to the Agent Economy.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm hover:shadow-md text-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Store
        </button>
      </div>

      {/* Sync Result Alert */}
      <AnimatePresence>
        {syncResult && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`mb-6 p-4 rounded-xl border ${syncResult.success ? 'bg-emerald-900/20 border-emerald-800' : 'bg-red-900/20 border-red-800'}`}
          >
            <div className="flex justify-between items-start">
              <div className="flex gap-3">
                {syncResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-400 mt-0.5" />
                )}
                <div>
                  <h3 className={`font-medium ${syncResult.success ? 'text-emerald-300' : 'text-red-300'}`}>
                    {syncResult.success ? 'Sync Completed' : 'Sync Failed'}
                  </h3>
                  <div className="mt-1 text-sm text-slate-400">
                    Imported: {syncResult.imported} • Updated: {syncResult.updated} • Failed: {syncResult.failed}
                  </div>
                </div>
              </div>
              <button onClick={() => setSyncResult(null)} className="text-slate-400 hover:text-slate-200">
                <span className="sr-only">Dismiss</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-2">
        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[1, 2].map(i => (
              <div key={i} className="h-48 bg-slate-800/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : connections.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center py-12 bg-slate-900/50 rounded-2xl border border-dashed border-slate-800">
            <div className="w-16 h-16 bg-blue-900/20 text-blue-500 rounded-full flex items-center justify-center mb-4">
              <Store className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold text-white">No stores connected</h3>
            <p className="text-slate-400 max-w-sm text-center mt-2 mb-8">
              Connect your e-commerce platform to automatically sync products, inventory, and orders with Agentrix.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-lg hover:shadow-blue-500/25"
            >
              Connect First Store
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {connections.map((conn) => {
              const PlatformIcon = platformConfig[conn.platform]?.icon || Store;
              const platformColor = platformConfig[conn.platform]?.textColor || 'text-slate-400';
              
              return (
                <motion.div
                  key={conn.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-slate-900/50 rounded-2xl border border-white/5 overflow-hidden hover:border-blue-500/30 transition-all group"
                >
                  <div className="p-5">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center ${platformColor}`}>
                          <PlatformIcon className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors">
                            {conn.storeName}
                          </h3>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span>{platformConfig[conn.platform]?.name}</span>
                            {conn.storeUrl && (
                              <a href={conn.storeUrl} target="_blank" rel="noreferrer" className="hover:text-blue-400">
                                <ExternalLink className="w-3 h-3 inline ml-1" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                      {getStatusBadge(conn.status)}
                    </div>

                    <div className="grid grid-cols-3 gap-2 py-4 border-t border-b border-white/5 mb-4">
                      <div className="text-center">
                        <div className="text-lg font-bold text-white">{conn.stats.totalProducts}</div>
                        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Products</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-emerald-400">{conn.stats.syncedProducts}</div>
                        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Synced</div>
                      </div>
                      <div className="text-center">
                        <div className={`text-lg font-bold ${conn.stats.failedProducts > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                          {conn.stats.failedProducts}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Failed</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 mb-4">
                      <div className="flex items-center gap-1">
                        <RefreshCw className="w-3 h-3" />
                        {conn.syncConfig.autoSync ? `Auto (${conn.syncConfig.syncInterval}m)` : 'Manual'}
                      </div>
                      {conn.lastSyncAt && (
                        <span>Last: {new Date(conn.lastSyncAt).toLocaleDateString()}</span>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSync(conn.id)}
                        disabled={syncingId === conn.id || !conn.isActive}
                        className="flex-1 px-3 py-2 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${syncingId === conn.id ? 'animate-spin' : ''}`} />
                        {syncingId === conn.id ? 'Syncing' : 'Sync Now'}
                      </button>
                      <button className="px-3 py-2 bg-slate-800 text-slate-400 hover:bg-slate-700 rounded-lg transition-colors">
                        <Settings className="w-4 h-4" />
                      </button>
                      <button className="px-3 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Connection Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-white/10"
            >
              <div className="p-6 border-b border-white/10 flex justify-between items-center">
                <h3 className="text-xl font-bold text-white">
                  {selectedPlatform ? `Connect ${platformConfig[selectedPlatform].name}` : 'Select Platform'}
                </h3>
                <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                  <span className="sr-only">Close</span>
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="p-6 max-h-[70vh] overflow-y-auto">
                {!selectedPlatform ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {Object.entries(platformConfig).map(([key, config]) => (
                      <button
                        key={key}
                        onClick={() => setSelectedPlatform(key as any)}
                        className="flex items-start gap-4 p-4 rounded-xl border border-white/5 bg-white/5 hover:border-blue-500/50 hover:bg-blue-500/10 transition-all text-left group"
                      >
                        <div className={`w-12 h-12 rounded-lg ${config.color} flex items-center justify-center text-white shrink-0 group-hover:scale-110 transition-transform`}>
                          <config.icon className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-white">{config.name}</h4>
                          <p className="text-xs text-slate-400 mt-1">{config.description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <button 
                      onClick={() => setSelectedPlatform(null)}
                      className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1 mb-4"
                    >
                      <ArrowRight className="w-4 h-4 rotate-180" /> Back to platforms
                    </button>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Store Name</label>
                        <input
                          type="text"
                          value={formData.storeName}
                          onChange={e => setFormData({...formData, storeName: e.target.value})}
                          className="w-full px-4 py-2 rounded-lg border border-white/10 bg-slate-800 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                          placeholder="e.g. My Fashion Store"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Store URL</label>
                        <input
                          type="text"
                          value={formData.storeUrl}
                          onChange={e => setFormData({...formData, storeUrl: e.target.value})}
                          className="w-full px-4 py-2 rounded-lg border border-white/10 bg-slate-800 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                          placeholder="https://..."
                        />
                      </div>
                      
                      <div className="border-t border-white/10 my-4 pt-4">
                        <h4 className="text-sm font-semibold text-white mb-3">API Credentials</h4>
                        {platformConfig[selectedPlatform].fields.map(field => (
                          <div key={field} className="mb-3">
                            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
                              {field.replace(/([A-Z])/g, ' $1').trim()}
                            </label>
                            <input
                              type="text"
                              value={formData[field] || ''}
                              onChange={e => setFormData({...formData, [field]: e.target.value})}
                              className="w-full px-4 py-2 rounded-lg border border-white/10 bg-slate-800 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                      <button
                        onClick={() => setShowAddModal(false)}
                        className="px-4 py-2 text-slate-400 hover:bg-white/5 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleCreateConnection}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-lg shadow-blue-500/20 transition-all"
                      >
                        Connect Store
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
