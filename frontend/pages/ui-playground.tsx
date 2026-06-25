import React from 'react';
import Head from 'next/head';
import MarketplaceItemCard from '../components/marketplace/MarketplaceItemCard';
import { Navigation } from '../components/ui/Navigation';
import { Footer } from '../components/layout/Footer';
import { Shield, Zap, Package, MousePointer2, Plus, Users, Play, Star, TrendingUp, DollarSign, Database, UserCheck, BarChart3, Clock, Percent, ShoppingCart, Workflow, Wrench, ShieldCheck, FileText } from 'lucide-react';

const UIPlaygroundPage = () => {
  return (
    <div className="bg-slate-950 min-h-screen text-white">
      <Head>
        <title>Agentrix UI Playground - Persona Adaptive Cards</title>
      </Head>

      <Navigation />

      <main className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-16 space-y-4">
            <h1 className="text-5xl font-extrabold text-white tracking-tight">
              Agentrix <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">UI Laboratory</span>
            </h1>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto font-medium">
              展示基于画像 (Persona) 的自适应市场卡片设计。
              <br />
              同一协议底层，四种商业表现层。
            </p>
            <div className="mt-8 flex justify-center gap-6">
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <span className="text-sm font-bold text-slate-300">SLA Verified</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl">
                <Zap className="w-5 h-5 text-amber-400 fill-amber-400" />
                <span className="text-sm font-bold text-slate-300">X402 Instant</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl">
                <Package className="w-5 h-5 text-blue-400" />
                <span className="text-sm font-bold text-slate-300">UCP Delivery</span>
              </div>
            </div>
          </div>

          {/* Grid Scenarios */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            
            {/* Scenario 1: API Provider (Technical Logic) */}
            <div className="group space-y-6">
              <div className="flex items-center gap-3 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-400 font-bold text-xs uppercase tracking-widest w-fit">
                <Wrench className="w-4 h-4" />
                场景 A: API 厂商
              </div>
              <MarketplaceItemCard
                id="api-1"
                name="DeepSeek-R1-Turbo"
                displayName="DeepSeek R1 Turbo API"
                description="高性能推理接口，支持长文本逻辑分析，极速响应，开发者首选。"
                layer="logic"
                persona="api_provider"
                pricingType="per_call"
                price={0.002}
                rating={4.9}
                callCount={125000}
                commissionRate={15}
                supportsInstant={true}
                slaGuarantee={true}
                performanceMetric="45ms avg"
              />
              <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800/50">
                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">设计要点</h4>
                <ul className="text-xs text-slate-400 space-y-1">
                  <li>• 突出 Latency/Reliability 指标</li>
                  <li>• 侧重“集成”与“试用”动作</li>
                  <li>• 蓝调主视觉，传达技术感</li>
                </ul>
              </div>
            </div>

            {/* Scenario 2: Merchant (Physical Resource) */}
            <div className="group space-y-6">
              <div className="flex items-center gap-3 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 font-bold text-xs uppercase tracking-widest w-fit">
                <ShoppingCart className="w-4 h-4" />
                场景 B: 实物商
              </div>
              <MarketplaceItemCard
                id="item-1"
                name="CoffeeExpress-Dark"
                displayName="精品深度烘焙咖啡豆 (500g)"
                description="埃塞俄比亚原产，Agentrix 物流直接送达，支持 X402 瞬时支付。"
                layer="resource"
                persona="merchant"
                imageUrl="https://images.unsplash.com/photo-1559056199-641a0ac8b55e?q=80&w=400&auto=format&fit=crop"
                pricingType="per_call"
                price={24.99}
                rating={4.8}
                callCount={1200}
                supportsDelivery={true}
                supportsInstant={true}
                performanceMetric="24h Ship"
              />
              <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800/50">
                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">设计要点</h4>
                <ul className="text-xs text-slate-400 space-y-1">
                  <li>• 电商化大图，吸引视觉注意</li>
                  <li>• 突出物流履约 (UCP) 图标</li>
                  <li>• 绿调主视觉，传达安全与交付</li>
                </ul>
              </div>
            </div>

            {/* Scenario 3: Data Provider (Information Resource) */}
            <div className="group space-y-6">
              <div className="flex items-center gap-3 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400 font-bold text-xs uppercase tracking-widest w-fit">
                <Database className="w-4 h-4" />
                场景 C: 数据提供方
              </div>
              <MarketplaceItemCard
                id="data-1"
                name="Crypto-Realtime-Feed"
                displayName="全网加密货币实时行情流"
                description="覆盖 50+ 交易所，毫秒级推送，每秒 2000+ 数据点，适合量化 Agent。"
                layer="infra"
                persona="data_provider"
                pricingType="subscription"
                price={99}
                rating={4.7}
                callCount={8900}
                commissionRate={10}
                supportsInstant={true}
              />
              <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800/50">
                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">设计要点</h4>
                <ul className="text-xs text-slate-400 space-y-1">
                  <li>• 代码片段/数据样本即时预览</li>
                  <li>• 订阅制标识突出</li>
                  <li>• 金色调，传达金融与价值</li>
                </ul>
              </div>
            </div>

            {/* Scenario 4: Expert (Service Resource) */}
            <div className="group space-y-6">
              <div className="flex items-center gap-3 px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-lg text-purple-400 font-bold text-xs uppercase tracking-widest w-fit">
                <UserCheck className="w-4 h-4" />
                场景 D: 行业专家
              </div>
              <MarketplaceItemCard
                id="expert-1"
                name="Web3-Legal-Consultant"
                displayName="Web3 合规法律咨询"
                description="前顶级律所合伙人，专注于 Agent 经济合规性分析。1对1 视频咨询。"
                layer="resource"
                persona="expert"
                imageUrl="https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=400&auto=format&fit=crop"
                pricingType="per_call"
                price={150}
                rating={5.0}
                callCount={45}
                slaGuarantee={true}
              />
              <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800/50">
                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">设计要点</h4>
                <ul className="text-xs text-slate-400 space-y-1">
                  <li>• 人格化展示，强调专家属性</li>
                  <li>• CTA 替换为“预约专家”</li>
                  <li>• 紫色调，传达专业与睿智</li>
                </ul>
              </div>
            </div>

          </div>

          {/* Integration Tech Info */}
          <div className="mt-32 p-12 bg-gradient-to-br from-slate-900 to-slate-950 rounded-3xl border border-slate-800 shadow-3xl text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <Workflow className="w-64 h-64" />
            </div>
            
            <div className="relative z-10">
              <h2 className="text-3xl font-bold mb-6 italic">Built for Agentic Commerce</h2>
              <p className="text-slate-400 max-w-3xl mx-auto text-lg mb-10 leading-relaxed">
                这些卡片不仅仅是 UI。每个卡片背后都绑定了 **ASP 协议定义**。
                当 LLM (如 Gemini/Claude) 扫描这些能力时，它们看到的不是 UI，而是可以精确调用的参数。
                <br />
                <span className="text-white font-bold">这是人类可见，Agent 可用的“全球第一套商业化 AI 技能卡片”。</span>
              </p>
              
              <div className="inline-flex items-center gap-3 px-6 py-3 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-md">
                <div className="flex -space-x-3">
                  <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">G</div>
                  <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold">C</div>
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold">O</div>
                </div>
                <span className="text-sm font-medium text-slate-300">多模态 Agent 已原生支持</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default UIPlaygroundPage;
