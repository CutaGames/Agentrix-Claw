
import React, { useState } from 'react';
import { useLocalization } from '../../contexts/LocalizationContext';
import { useUser } from '../../contexts/UserContext';
import { useToast } from '../../contexts/ToastContext';
import { X, Briefcase, Zap, CheckCircle2, ArrowRight, ShieldCheck, Rocket } from 'lucide-react';

interface RegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'merchant' | 'developer';
  onSuccess: () => void;
}

export const RegistrationModal: React.FC<RegistrationModalProps> = ({ isOpen, onClose, type, onSuccess }) => {
  const { t } = useLocalization();
  const { registerRole } = useUser();
  const { success, error: showError } = useToast();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    website: '',
    description: '',
    agreement: false
  });

  if (!isOpen) return null;

  const handleRegister = async () => {
    if (!formData.agreement) {
      showError(t({ zh: '请先同意条款', en: 'Please agree to the terms' }));
      return;
    }

    try {
      setLoading(true);
      await registerRole(type === 'merchant' ? 'merchant' : 'developer', {
        name: formData.name,
        website: formData.website,
        description: formData.description
      });
      success(t({ 
        zh: type === 'merchant' ? '商户注册成功！' : '开发者注册成功！', 
        en: type === 'merchant' ? 'Merchant registered successfully!' : 'Developer registered successfully!' 
      }));
      onSuccess();
      onClose();
    } catch (err: any) {
      showError(err.message || t({ zh: '注册失败', en: 'Registration failed' }));
    } finally {
      setLoading(false);
    }
  };

  const content = {
    merchant: {
      title: t({ zh: '注册成为商户', en: 'Register as Merchant' }),
      description: t({ zh: '开启您的 AI 电商之旅，管理商品、订单与收益。', en: 'Start your AI commerce journey, manage products, orders, and revenue.' }),
      icon: Briefcase,
      color: 'blue',
      features: [
        { title: t({ zh: '统一支付', en: 'Unified Payment' }), desc: t({ zh: '支持 100+ 虚拟币及法定货币支付。', en: 'Support 100+ crypto and fiat payments.' }) },
        { title: t({ zh: '智能营销', en: 'Smart Marketing' }), desc: t({ zh: 'AI 自动为您的商品生成推广技能。', en: 'AI auto-generates promotion skills for your products.' }) },
        { title: t({ zh: '分账体系', en: 'Revenue Sharing' }), desc: t({ zh: '完善的供应链分账与推广分佣。', en: 'Advanced supply chain and referral sharing.' }) }
      ]
    },
    developer: {
      title: t({ zh: '注册成为开发者', en: 'Register as Developer' }),
      description: t({ zh: '构建下一代 AI 技能与 Agent，触达全球用户。', en: 'Build next-gen AI skills and agents for global users.' }),
      icon: Zap,
      color: 'purple',
      features: [
        { title: t({ zh: '技能工厂', en: 'Skill Factory' }), desc: t({ zh: '快速将 API/MCP 转换为 AI 技能。', en: 'Convert API/MCP to AI skills instantly.' }) },
        { title: t({ zh: 'SDK 集成', en: 'SDK Integration' }), desc: t({ zh: '完善的多语言 SDK 与开发者工具。', en: 'Full SDKs and developer toolkits.' }) },
        { title: t({ zh: '生态流量', en: 'Ecosystem Traffic' }), desc: t({ zh: '接入 Agentrix 庞大的 AI 算力与用户。', en: 'Tap into massive AI compute and users.' }) }
      ]
    }
  }[type];

  const Icon = content.icon;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in scale-in-95 duration-200">
        {/* Header */}
        <div className={`relative h-32 bg-${content.color}-600/20 flex items-center justify-center`}>
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white"
          >
            <X size={20} />
          </button>
          <div className={`w-16 h-16 rounded-2xl bg-${content.color}-500/20 border border-${content.color}-500/30 flex items-center justify-center text-${content.color}-400`}>
            <Icon size={32} />
          </div>
        </div>

        <div className="p-6">
          {step === 1 ? (
            <div className="space-y-6">
              <div className="text-center">
                <h3 className="text-xl font-bold text-white mb-2">{content.title}</h3>
                <p className="text-slate-400 text-sm px-4">{content.description}</p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {content.features.map((f, i) => (
                  <div key={i} className="flex gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
                    <div className={`text-${content.color}-400 mt-0.5`}>
                      <CheckCircle2 size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-200">{f.title}</div>
                      <div className="text-xs text-slate-500">{f.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setStep(2)}
                className={`w-full py-3 rounded-xl bg-${content.color}-600 hover:bg-${content.color}-500 text-white font-bold flex items-center justify-center gap-2 transition-all group`}
              >
                <span>{t({ zh: '立即开启', en: 'Get Started' })}</span>
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 px-1">
                  {type === 'merchant' ? t({ zh: '商户名称', en: 'Merchant Name' }) : t({ zh: '开发者名称', en: 'Developer Name' })}
                </label>
                <input
                  type="text"
                  placeholder={type === 'merchant' ? 'Global Store' : 'Tech Wizard'}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all outline-none"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 px-1">
                  {t({ zh: '网站/社交主页 (可选)', en: 'Website / Social Repo (Optional)' })}
                </label>
                <input
                  type="text"
                  placeholder="https://..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all outline-none"
                  value={formData.website}
                  onChange={e => setFormData({ ...formData, website: e.target.value })}
                />
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/30 border border-slate-700/50 mt-4">
                <input
                  id="agreement"
                  type="checkbox"
                  className="mt-1 w-4 h-4 rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-offset-slate-900"
                  checked={formData.agreement}
                  onChange={e => setFormData({ ...formData, agreement: e.target.checked })}
                />
                <label htmlFor="agreement" className="text-xs text-slate-400 leading-relaxed cursor-pointer select-none">
                  {t({ 
                    zh: '我同意遵守 Agentrix 生态协议，并承诺提供真实合法的服务内容与商品信息。我了解平台可能会对违规行为进行审核与限制。',
                    en: 'I agree to comply with the Agentrix Ecosystem Protocol and promise to provide authentic and legal content. I understand the platform may audit and restrict violating behavior.'
                  })}
                </label>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-all"
                >
                  {t({ zh: '上一步', en: 'Back' })}
                </button>
                <button
                  onClick={handleRegister}
                  disabled={loading || !formData.name || !formData.agreement}
                  className={`flex-[2] py-3 rounded-xl bg-${content.color}-600 hover:bg-${content.color}-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold flex items-center justify-center gap-2 transition-all`}
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <span>{t({ zh: '完成注册', en: 'Complete' })}</span>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
        
        <div className="px-6 py-4 bg-slate-950/50 text-center border-t border-slate-800/50">
          <div className="flex items-center justify-center gap-2 text-[10px] text-slate-500 uppercase tracking-widest font-bold">
            <ShieldCheck size={12} />
            <span>Secure Ecosystem Integration</span>
          </div>
        </div>
      </div>
    </div>
  );
};
