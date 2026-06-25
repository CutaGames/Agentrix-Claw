import { useState, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  Plus, 
  Package, 
  Settings, 
  MoreHorizontal, 
  ArrowUpDown, 
  Download,
  Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocalization } from '../../../../contexts/LocalizationContext';
import { ProductInfo } from '../../../../lib/api/product.api';

interface ProductListPanelProps {
  products: ProductInfo[];
  loading: boolean;
  onAddProduct: () => void;
  onEditProduct: (product: ProductInfo) => void;
  onImport?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function ProductListPanel({ 
  products, 
  loading, 
  onAddProduct, 
  onEditProduct,
  onImport 
}: ProductListPanelProps) {
  const { t } = useLocalization();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');

  // Filter and sort products
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           p.description?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = filterCategory === 'all' || p.category === filterCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, filterCategory]);

  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category).filter(Boolean));
    return ['all', ...Array.from(cats)];
  }, [products]);

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder={t({ zh: '搜索商品...', en: 'Search products...' })}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-900/50 border border-white/10 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 transition-all"
            />
          </div>
          <button className="p-2 bg-slate-900/50 border border-white/10 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <Filter size={18} />
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          {onImport && (
            <div className="relative">
              <input
                type="file"
                id="import-csv"
                className="hidden"
                accept=".csv"
                onChange={onImport}
              />
              <label
                htmlFor="import-csv"
                className="flex items-center gap-2 px-4 py-2 bg-slate-900/50 border border-white/10 hover:bg-slate-800 text-slate-300 rounded-xl text-sm font-medium cursor-pointer transition-colors"
              >
                <Upload size={16} />
                <span className="hidden sm:inline">{t({ zh: '导入', en: 'Import' })}</span>
              </label>
            </div>
          )}
          
          <button 
            onClick={onAddProduct}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-900/20 transition-all transform hover:-translate-y-0.5"
          >
            <Plus size={18} />
            <span>{t({ zh: '添加商品', en: 'Add Product' })}</span>
          </button>
        </div>
      </div>

      {/* Categories Tabs */}
      {categories.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat as string)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                filterCategory === cat 
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/20' 
                  : 'bg-slate-900/30 text-slate-400 border border-white/5 hover:bg-slate-800'
              }`}
            >
              {cat === 'all' ? t({ zh: '全部', en: 'All' }) : cat}
            </button>
          ))}
        </div>
      )}

      {/* Product List */}
      <div className="flex-1 bg-slate-900/50 border border-white/5 rounded-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-white/5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
          <div className="col-span-5 sm:col-span-4 flex items-center gap-2 cursor-pointer hover:text-slate-300">
            {t({ zh: '商品名称', en: 'Product' })} <ArrowUpDown size={12} />
          </div>
          <div className="col-span-3 sm:col-span-2 text-right cursor-pointer hover:text-slate-300">
            {t({ zh: '价格', en: 'Price' })} <ArrowUpDown size={12} />
          </div>
          <div className="col-span-2 hidden sm:block text-right">
            {t({ zh: '库存', en: 'Stock' })}
          </div>
          <div className="col-span-2 hidden sm:block text-center">
            {t({ zh: '类别', en: 'Category' })}
          </div>
          <div className="col-span-4 sm:col-span-2 text-right">
            {t({ zh: '操作', en: 'Actions' })}
          </div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 space-y-4">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-500 text-sm">{t({ zh: '加载中...', en: 'Loading products...' })}</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 space-y-4 text-center p-8">
              <div className="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center">
                <Package className="w-8 h-8 text-slate-600" />
              </div>
              <div>
                <h3 className="text-white font-medium mb-1">{t({ zh: '暂无商品', en: 'No products found' })}</h3>
                <p className="text-slate-500 text-sm max-w-xs mx-auto">
                  {searchQuery 
                    ? t({ zh: '尝试调整搜索关键词', en: 'Try adjusting your search terms' })
                    : t({ zh: '点击右上角按钮添加您的第一个商品', en: 'Click the button above to add your first product' })
                  }
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              <AnimatePresence initial={false}>
                {filteredProducts.map((product) => (
                  <motion.div
                    key={product.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-white/[0.02] transition-colors group"
                  >
                    {/* Name & Image */}
                    <div className="col-span-5 sm:col-span-4 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-slate-800 border border-white/5 overflow-hidden flex-shrink-0">
                        {product.metadata?.image ? (
                          <img src={product.metadata.image} alt={product.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-600">
                            <Package size={18} />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-medium text-white truncate group-hover:text-blue-400 transition-colors">
                          {product.name}
                        </h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase border ${
                            product.status === 'active' 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                              : 'bg-slate-700/50 text-slate-400 border-slate-600/50'
                          }`}>
                            {product.status}
                          </span>
                          <span className="text-[10px] text-slate-600 font-mono truncate hidden sm:inline">
                            #{product.id.slice(-6)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Price */}
                    <div className="col-span-3 sm:col-span-2 text-right">
                      <div className="text-sm font-mono text-white">
                        {product.price} <span className="text-slate-500 text-xs">{product.metadata?.currency || 'USD'}</span>
                      </div>
                    </div>

                    {/* Stock */}
                    <div className="col-span-2 hidden sm:block text-right">
                      <span className={`text-sm font-mono ${product.stock < 10 ? 'text-orange-400' : 'text-slate-400'}`}>
                        {product.stock}
                      </span>
                    </div>

                    {/* Category */}
                    <div className="col-span-2 hidden sm:block text-center">
                      <span className="text-xs text-slate-400 px-2 py-1 rounded-full bg-slate-800/50 border border-white/5">
                        {product.category || 'General'}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="col-span-4 sm:col-span-2 flex justify-end gap-2">
                      <button 
                        onClick={() => onEditProduct(product)}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                        title={t({ zh: '编辑', en: 'Edit' })}
                      >
                        <Settings size={16} />
                      </button>
                      <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors sm:hidden">
                        <MoreHorizontal size={16} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
