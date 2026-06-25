/**
 * SkillFilters Component
 * 
 * V2.0: Skill 搜索过滤器组件
 */

import React from 'react';
import { 
  Search, 
  Filter, 
  X, 
  Zap, 
  Package, 
  Code, 
  Layers,
  ChevronDown,
} from 'lucide-react';

export type SkillLayer = 'infra' | 'resource' | 'logic' | 'composite';
export type SkillSource = 'native' | 'imported' | 'converted';
export type SkillResourceType = 'physical' | 'service' | 'digital' | 'data' | 'logic';

export interface FilterState {
  query: string;
  layers: SkillLayer[];
  categories: string[];
  resourceTypes: SkillResourceType[];
  sources: SkillSource[];
  priceRange: { min?: number; max?: number };
  rating?: number;
  humanAccessible?: boolean;
  sortBy: 'callCount' | 'rating' | 'createdAt' | 'name';
  sortOrder: 'ASC' | 'DESC';
}

export interface SkillFiltersProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  categories?: Array<{ category: string; count: number }>;
  facets?: {
    layers?: Array<{ value: SkillLayer; count: number }>;
    sources?: Array<{ value: SkillSource; count: number }>;
    resourceTypes?: Array<{ value: SkillResourceType; count: number }>;
  };
  showAdvanced?: boolean;
}

const layerOptions: Array<{ value: SkillLayer; label: string; icon: React.ReactNode }> = [
  { value: 'infra', label: 'Infrastructure', icon: <Zap className="w-4 h-4" /> },
  { value: 'resource', label: 'Resources', icon: <Package className="w-4 h-4" /> },
  { value: 'logic', label: 'Logic', icon: <Code className="w-4 h-4" /> },
  { value: 'composite', label: 'Composite', icon: <Layers className="w-4 h-4" /> },
];

const sourceOptions: Array<{ value: SkillSource; label: string; color: string }> = [
  { value: 'native', label: 'Native', color: 'bg-emerald-500' },
  { value: 'imported', label: 'Imported', color: 'bg-sky-500' },
  { value: 'converted', label: 'Products', color: 'bg-amber-500' },
];

const sortOptions = [
  { value: 'callCount', label: 'Most Popular' },
  { value: 'rating', label: 'Highest Rated' },
  { value: 'createdAt', label: 'Newest' },
  { value: 'name', label: 'Name' },
];

export const SkillFilters: React.FC<SkillFiltersProps> = ({
  filters,
  onFilterChange,
  categories = [],
  facets,
  showAdvanced = true,
}) => {
  const [isAdvancedOpen, setIsAdvancedOpen] = React.useState(false);

  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    onFilterChange({ ...filters, [key]: value });
  };

  const toggleArrayFilter = <T extends string>(
    key: 'layers' | 'categories' | 'resourceTypes' | 'sources',
    value: T
  ) => {
    const current = filters[key] as T[];
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    updateFilter(key, updated as any);
  };

  const clearFilters = () => {
    onFilterChange({
      query: '',
      layers: [],
      categories: [],
      resourceTypes: [],
      sources: [],
      priceRange: {},
      rating: undefined,
      humanAccessible: undefined,
      sortBy: 'callCount',
      sortOrder: 'DESC',
    });
  };

  const hasActiveFilters = 
    filters.query ||
    filters.layers.length > 0 ||
    filters.categories.length > 0 ||
    filters.resourceTypes.length > 0 ||
    filters.sources.length > 0 ||
    filters.priceRange.min !== undefined ||
    filters.priceRange.max !== undefined ||
    filters.rating !== undefined;

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          value={filters.query}
          onChange={(e) => updateFilter('query', e.target.value)}
          placeholder="Search skills, products, services..."
          className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {filters.query && (
          <button
            onClick={() => updateFilter('query', '')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded-full"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        )}
      </div>

      {/* Layer Filters */}
      <div className="flex flex-wrap gap-2">
        {layerOptions.map((option) => {
          const isActive = filters.layers.includes(option.value);
          const count = facets?.layers?.find((f) => f.value === option.value)?.count;
          return (
            <button
              key={option.value}
              onClick={() => toggleArrayFilter('layers', option.value)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                isActive
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {option.icon}
              <span className="text-sm font-medium">{option.label}</span>
              {count !== undefined && (
                <span className={`text-xs ${isActive ? 'text-blue-500' : 'text-slate-400'}`}>
                  ({count})
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Source Filters */}
      <div className="flex flex-wrap gap-2">
        {sourceOptions.map((option) => {
          const isActive = filters.sources.includes(option.value);
          const count = facets?.sources?.find((f) => f.value === option.value)?.count;
          return (
            <button
              key={option.value}
              onClick={() => toggleArrayFilter('sources', option.value)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${
                isActive
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${option.color}`} />
              <span className="text-sm">{option.label}</span>
              {count !== undefined && (
                <span className={`text-xs ${isActive ? 'text-slate-300' : 'text-slate-400'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Sort & Advanced Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">Sort by:</span>
          <select
            value={filters.sortBy}
            onChange={(e) => updateFilter('sortBy', e.target.value as FilterState['sortBy'])}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => updateFilter('sortOrder', filters.sortOrder === 'ASC' ? 'DESC' : 'ASC')}
            className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-sm hover:bg-slate-50"
          >
            {filters.sortOrder === 'ASC' ? '↑' : '↓'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
              Clear filters
            </button>
          )}
          {showAdvanced && (
            <button
              onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800 bg-slate-100 rounded-lg"
            >
              <Filter className="w-4 h-4" />
              Advanced
              <ChevronDown className={`w-4 h-4 transition-transform ${isAdvancedOpen ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Advanced Filters */}
      {showAdvanced && isAdvancedOpen && (
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
          {/* Categories */}
          {categories.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Categories</label>
              <div className="flex flex-wrap gap-2">
                {categories.slice(0, 10).map((cat) => {
                  const isActive = filters.categories.includes(cat.category);
                  return (
                    <button
                      key={cat.category}
                      onClick={() => toggleArrayFilter('categories', cat.category)}
                      className={`px-3 py-1 rounded-full text-sm transition-all ${
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {cat.category} ({cat.count})
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Price Range */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Price Range</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder="Min"
                value={filters.priceRange.min ?? ''}
                onChange={(e) => updateFilter('priceRange', {
                  ...filters.priceRange,
                  min: e.target.value ? Number(e.target.value) : undefined,
                })}
                className="w-24 px-3 py-1.5 border border-slate-200 rounded-lg text-sm"
              />
              <span className="text-slate-400">-</span>
              <input
                type="number"
                placeholder="Max"
                value={filters.priceRange.max ?? ''}
                onChange={(e) => updateFilter('priceRange', {
                  ...filters.priceRange,
                  max: e.target.value ? Number(e.target.value) : undefined,
                })}
                className="w-24 px-3 py-1.5 border border-slate-200 rounded-lg text-sm"
              />
              <span className="text-sm text-slate-500">USD</span>
            </div>
          </div>

          {/* Rating */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Minimum Rating</label>
            <div className="flex items-center gap-2">
              {[4, 3, 2, 1].map((r) => (
                <button
                  key={r}
                  onClick={() => updateFilter('rating', filters.rating === r ? undefined : r)}
                  className={`px-3 py-1 rounded-lg text-sm transition-all ${
                    filters.rating === r
                      ? 'bg-amber-100 text-amber-700 border border-amber-300'
                      : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {r}+ ⭐
                </button>
              ))}
            </div>
          </div>

          {/* Human Accessible */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="humanAccessible"
              checked={filters.humanAccessible === true}
              onChange={(e) => updateFilter('humanAccessible', e.target.checked ? true : undefined)}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="humanAccessible" className="text-sm text-slate-700">
              Only show human-accessible skills
            </label>
          </div>
        </div>
      )}
    </div>
  );
};

export default SkillFilters;
