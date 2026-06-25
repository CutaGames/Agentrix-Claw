import React, { useState } from 'react';
import { 
  CheckCircle2, 
  Circle, 
  Play, 
  ArrowRight, 
  FileText, 
  ShieldCheck, 
  Zap, 
  Package, 
  Globe,
  Settings,
  Terminal,
  ChevronDown,
  ChevronUp,
  Shield
} from 'lucide-react';

interface Task {
  id: string;
  title: string;
  desc: string;
  status: 'pending' | 'in_progress' | 'completed';
  actionLabel?: string;
  onAction?: () => void;
}

interface TaskPanelProps {
  type: 'merchant' | 'developer' | 'personal';
  tasks?: Task[];
  onComplete?: () => void;
}

export const TaskPanel: React.FC<TaskPanelProps> = ({ type, tasks: propsTasks, onComplete }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const defaultMerchantTasks: Task[] = [
    { id: 'm1', title: '创建商户 & 绑定 AX ID', desc: '完成商户基本信息录入与链上身份初始化', status: 'completed' },
    { id: 'm2', title: '上传/导入 Catalog', desc: '添加至少 1 个商品，支持 AI 搜索识别', status: 'in_progress', actionLabel: '管理商品' },
    { id: 'm3', title: '配置 Fulfillment', desc: '设置交付规则与 Webhook 签名校验', status: 'pending' },
    { id: 'm4', title: '开通支付方式', desc: '启用 AX Checkout 及其 Fallback 模式', status: 'pending' },
    { id: 'm5', title: '沙盒 E2E 测试', desc: '执行模拟订单并自动生成审计 Receipts', status: 'pending' },
    { id: 'm6', title: '发布到 Marketplace', desc: '完成分润模板配置并正式上线', status: 'pending' },
  ];

  const defaultDeveloperTasks: Task[] = [
    { id: 'd1', title: '创建 Skill (commerce-min)', desc: '使用标准模板定义技能 Spec', status: 'completed' },
    { id: 'd2', title: '校验 Spec & Policy', desc: '运行 Schema 校验与合规性检查', status: 'in_progress', actionLabel: '立即校验' },
    { id: 'd3', title: '一键 Build Packs', desc: '同步生成 OpenAI Actions 与 Claude MCP', status: 'pending' },
    { id: 'd4', title: '一键 Test (E2E)', desc: '模拟 AI 调用并验证 Webhook 回调', status: 'pending' },
    { id: 'd5', title: '发布到 Marketplace', desc: '配置定价与分润权限', status: 'pending' },
    { id: 'd6', title: '分发连接器', desc: '选择目标生态并生成安装包', status: 'pending' },
  ];

  const defaultPersonalTasks: Task[] = [
    { id: 'p1', title: '选择 Agent/Skill', desc: '在商店或库中挑选需要授权的 Agent', status: 'in_progress', actionLabel: '去选择' },
    { id: 'p2', title: '设置授权 Mandate', desc: '配置限额、范围、有效期及使用频率', status: 'pending' },
    { id: 'p3', title: '模拟一次购买', desc: '在沙盒中执行 Agent 触发的支付流', status: 'pending' },
    { id: 'p4', title: '审计 Receipt', desc: '查看并验证人类可读的行为回执', status: 'pending' },
    { id: 'p5', title: '管理/撤销授权', desc: '随时调整或一键终止 Agent 权限', status: 'pending' },
  ];

  const tasks = propsTasks || (type === 'merchant' ? defaultMerchantTasks : type === 'developer' ? defaultDeveloperTasks : defaultPersonalTasks);
  const progress = Math.round((tasks.filter(t => t.status === 'completed').length / tasks.length) * 100);

  const panelTitle = {
    merchant: 'Merchant Go-live Checklist',
    developer: 'Skill Build → Test → Publish',
    personal: 'Authorize Agent for Purchases'
  }[type];

  const panelColor = {
    merchant: 'bg-blue-500',
    developer: 'bg-purple-500',
    personal: 'bg-cyan-500'
  }[type];


  return (
    <div className={`fixed bottom-6 right-6 w-96 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 z-50 ${isExpanded ? '' : 'h-14'}`}>
      {/* Header */}
      <div 
        className="px-5 py-4 bg-white/5 border-b border-white/5 flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full animate-pulse ${type === 'merchant' ? 'bg-blue-500' : type === 'developer' ? 'bg-purple-500' : 'bg-cyan-500'}`} />
          <h3 className="font-bold text-white text-sm">
            {panelTitle}
          </h3>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-xs font-mono text-slate-400">{progress}%</span>
          {isExpanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </div>
      </div>

      {isExpanded && (
        <>
          {/* Progress Bar */}
          <div className="w-full h-1 bg-slate-800">
            <div 
              className={`h-full transition-all duration-500 ${
                type === 'merchant' ? 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 
                type === 'developer' ? 'bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]' : 
                'bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>


          {/* Task List */}
          <div className="p-4 max-h-[60vh] overflow-y-auto space-y-3 scrollbar-hide">
            {tasks.map((task, idx) => (
              <div 
                key={task.id} 
                className={`p-4 rounded-xl border transition-all ${
                  task.status === 'in_progress' 
                    ? 'bg-white/5 border-white/20 ring-1 ring-white/10 shadow-lg' 
                    : 'bg-transparent border-white/5'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="mt-1">
                    {task.status === 'completed' ? (
                      <CheckCircle2 size={18} className="text-emerald-500" />
                    ) : task.status === 'in_progress' ? (
                      <div className="w-4.5 h-4.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Circle size={18} className="text-slate-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className={`text-sm font-bold ${task.status === 'pending' ? 'text-slate-500' : 'text-white'}`}>
                      {task.title}
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                      {task.desc}
                    </p>
                    
                    {task.status === 'in_progress' && (
                      <button 
                        onClick={task.onAction}
                        className="mt-3 w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-2"
                      >
                        <Play size={12} fill="currentColor" />
                        {task.actionLabel}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="p-4 bg-white/5 border-t border-white/5 flex items-center justify-between">
            <div className="flex -space-x-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-6 h-6 rounded-full border border-slate-900 bg-slate-800 flex items-center justify-center">
                  <Shield size={10} className="text-slate-400" />
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 font-medium">
              Verified by Agentrix Audit Chain
            </p>
          </div>
        </>
      )}
    </div>
  );
};
