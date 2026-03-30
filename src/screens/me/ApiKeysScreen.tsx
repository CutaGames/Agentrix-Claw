import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, Alert,
  ScrollView, ActivityIndicator, Modal, FlatList,
} from 'react-native';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { apiFetch } from '../../services/api';

// ─── Types (mirrors backend catalog) ────────────────────────────

interface ModelDef {
  id: string;
  label: string;
  contextWindow: number;
  costTier: 'free' | 'low' | 'medium' | 'high';
  capabilities: string[];
  multimodal: boolean;
  inputPrice?: string;
  outputPrice?: string;
  positioning?: string;
  freeApi?: boolean;
  freeNote?: string;
  premiumMultiplier?: number;
}

interface ProviderDef {
  id: string;
  name: string;
  icon: string;
  region: 'international' | 'china';
  currency: string;
  billingType?: 'subscription' | 'api-key';
  requiredFields: string[];
  optionalFields: string[];
  placeholder: Record<string, string>;
  credentialLabel?: string;
  baseUrl?: string;
  models: ModelDef[];
}

interface SavedConfig {
  id: string;
  providerId: string;
  selectedModel: string;
  baseUrl?: string;
  region?: string;
  isActive: boolean;
  isDefault: boolean;
  lastTestedAt?: string;
  lastTestResult?: string;
  apiKeyPrefix?: string;
}

// ─── Per-provider form state ────────────────────────────────────

interface ProviderForm {
  apiKey: string;
  secretKey: string;
  baseUrl: string;
  region: string;
  selectedModel: string;
}

const COST_BADGE: Record<string, { label: string; color: string }> = {
  free: { label: '🆓 Free', color: '#22c55e' },
  low: { label: '$', color: '#3b82f6' },
  medium: { label: '$$', color: '#f59e0b' },
  high: { label: '$$$', color: '#ef4444' },
};

const formatCtx = (n: number) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1)}M`;
  return `${(n / 1000).toFixed(0)}K`;
};

// ─── Component ──────────────────────────────────────────────────

export function ApiKeysScreen() {
  const { t } = useI18n();

  const [catalog, setCatalog] = useState<ProviderDef[]>([]);
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, ProviderForm>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  // Model picker modal
  const [modelPickerProvider, setModelPickerProvider] = useState<ProviderDef | null>(null);

  // ─── Load catalog + user configs ──────

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [cat, configs] = await Promise.all([
        apiFetch<ProviderDef[]>('/ai-providers/catalog'),
        apiFetch<SavedConfig[]>('/ai-providers/configs'),
      ]);
      setCatalog(cat);
      setSavedConfigs(configs);

      // Pre-populate forms from saved configs
      const initForms: Record<string, ProviderForm> = {};
      for (const p of cat) {
        const saved = configs.find(c => c.providerId === p.id);
        initForms[p.id] = {
          apiKey: '',
          secretKey: '',
          baseUrl: saved?.baseUrl || p.baseUrl || '',
          region: saved?.region || '',
          selectedModel: saved?.selectedModel || p.models[0]?.id || '',
        };
      }
      setForms(initForms);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load providers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Helpers ──────

  const updateForm = (providerId: string, patch: Partial<ProviderForm>) => {
    setForms(prev => ({ ...prev, [providerId]: { ...prev[providerId], ...patch } }));
  };

  const getSaved = (providerId: string) => savedConfigs.find(c => c.providerId === providerId);
  const configuredCount = savedConfigs.length;
  const defaultConfig = savedConfigs.find(c => c.isDefault);
  const defaultProvider = defaultConfig ? catalog.find(p => p.id === defaultConfig.providerId) : null;

  // ─── Set default provider ──────

  const handleSetDefault = async (providerId: string) => {
    try {
      await apiFetch('/ai-providers/default', {
        method: 'POST',
        body: JSON.stringify({ providerId }),
      });
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  // ─── Test connectivity ──────

  const handleTest = async (provider: ProviderDef) => {
    const form = forms[provider.id];
    const credentialLabel = provider.credentialLabel || 'API Key';
    if (!form?.apiKey && !getSaved(provider.id)) {
      Alert.alert(t({ en: 'Missing', zh: '缺少信息' }), t({ en: `Please enter a ${credentialLabel} first`, zh: `请先输入${credentialLabel}` }));
      return;
    }
    setTesting(provider.id);
    try {
      const res = await apiFetch<{ success: boolean; latencyMs?: number; error?: string }>('/ai-providers/test', {
        method: 'POST',
        body: JSON.stringify({
          providerId: provider.id,
          apiKey: form.apiKey || '__saved__',
          secretKey: form.secretKey || undefined,
          baseUrl: form.baseUrl || undefined,
          region: form.region || undefined,
          model: form.selectedModel,
        }),
      });
      if (res.success) {
        Alert.alert('✅ ' + t({ en: 'Connected', zh: '连接成功' }),
          t({ en: `Latency: ${res.latencyMs}ms`, zh: `延迟: ${res.latencyMs}ms` }));
      } else {
        Alert.alert('❌ ' + t({ en: 'Failed', zh: '连接失败' }), res.error || 'Unknown error');
      }
    } catch (err: any) {
      Alert.alert('❌ Error', err.message);
    } finally {
      setTesting(null);
    }
  };

  // ─── Save config ──────

  const handleSave = async (provider: ProviderDef) => {
    const form = forms[provider.id];
    const credentialLabel = provider.credentialLabel || 'API Key';
    if (!form.apiKey && !getSaved(provider.id)) {
      Alert.alert(t({ en: 'Missing', zh: '缺少信息' }), t({ en: `Please enter a ${credentialLabel}`, zh: `请先输入${credentialLabel}` }));
      return;
    }
    for (const field of provider.requiredFields) {
      if (field === 'apiKey' && !form.apiKey && !getSaved(provider.id)) {
        Alert.alert(t({ en: 'Missing', zh: '缺少信息' }), `${field} is required`);
        return;
      }
      if (field === 'secretKey' && !form.secretKey && !getSaved(provider.id)) {
        Alert.alert(t({ en: 'Missing', zh: '缺少信息' }), `${field} is required`);
        return;
      }
      if (field === 'region' && !form.region) {
        Alert.alert(t({ en: 'Missing', zh: '缺少信息' }), `${field} is required`);
        return;
      }
    }
    setSaving(provider.id);
    try {
      await apiFetch('/ai-providers/configs', {
        method: 'POST',
        body: JSON.stringify({
          providerId: provider.id,
          apiKey: form.apiKey || '__saved__',
          secretKey: form.secretKey || undefined,
          baseUrl: form.baseUrl || undefined,
          region: form.region || undefined,
          selectedModel: form.selectedModel,
        }),
      });
      Alert.alert('✅', t({ en: 'Provider saved!', zh: '厂商配置已保存！' }));
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(null);
    }
  };

  // ─── Delete config ──────

  const handleDelete = (provider: ProviderDef) => {
    Alert.alert(
      t({ en: 'Remove Provider', zh: '移除厂商' }),
      t({ en: `Remove ${provider.name} configuration?`, zh: `确定移除 ${provider.name}？` }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        {
          text: t({ en: 'Remove', zh: '移除' }), style: 'destructive',
          onPress: async () => {
            try {
              await apiFetch(`/ai-providers/configs/${provider.id}`, { method: 'DELETE' });
              await loadData();
            } catch (err: any) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ],
    );
  };

  // ─── Model picker ──────

  const getModelLabel = (providerId: string) => {
    const p = catalog.find(c => c.id === providerId);
    const modelId = forms[providerId]?.selectedModel;
    const m = p?.models.find(mm => mm.id === modelId);
    return m?.label || modelId || '—';
  };

  // ─── Render provider card ──────

  const renderProvider = (provider: ProviderDef) => {
    const saved = getSaved(provider.id);
    const isExpanded = expandedId === provider.id;
    const form = forms[provider.id];
    const isDefault = saved?.isDefault === true;
    const selectedModel = provider.models.find(m => m.id === form?.selectedModel);

    return (
      <View key={provider.id} style={[styles.card, saved && styles.cardActive, isDefault && styles.cardDefault]}>
        {/* Header row */}
        <TouchableOpacity
          style={styles.cardHeader}
          onPress={() => setExpandedId(isExpanded ? null : provider.id)}
          activeOpacity={0.7}
        >
          <Text style={styles.providerIcon}>{provider.icon}</Text>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.providerName}>{provider.name}</Text>
              {isDefault && <Text style={styles.defaultBadge}>⭐ {t({ en: 'Default', zh: '默认' })}</Text>}
            </View>
            {saved && (
              <Text style={styles.keyHint}>
                {t({ en: 'Key: ', zh: '密钥: ' })}{saved.apiKeyPrefix || '••••'}
                {saved.lastTestResult === 'success' ? '  ✅' : ''}
                {selectedModel ? `  ·  ${selectedModel.label}` : ''}
              </Text>
            )}
            {!saved && provider.models.some(m => m.freeApi) && (
              <Text style={styles.freeBadge}>
                🆓 {t({ en: 'Free API available', zh: '有免费API' })}
              </Text>
            )}
          </View>
          <Text style={styles.chevron}>{isExpanded ? '▾' : '▸'}</Text>
        </TouchableOpacity>

        {/* Expanded form */}
        {isExpanded && form && (
          <View style={styles.cardBody}>
            {/* API Key */}
            <Text style={styles.fieldLabel}>{provider.credentialLabel || 'API Key'} *</Text>
            <TextInput
              style={styles.input}
              placeholder={saved ? `${saved.apiKeyPrefix || '••••'}  (leave blank to keep)` : provider.placeholder.apiKey || 'Enter API key'}
              placeholderTextColor={colors.textMuted}
              value={form.apiKey}
              onChangeText={v => updateForm(provider.id, { apiKey: v })}
              secureTextEntry
              autoCapitalize="none"
            />

            {(provider.id === 'bedrock' || provider.id === 'bedrock-cn') && (
              <Text style={styles.fieldHint}>
                {t({
                  en: 'Use AWS IAM Access Key ID + Secret Access Key + Region. Do not paste a Bedrock API Key or Bearer token here.',
                  zh: '这里必须填写 AWS IAM Access Key ID、Secret Access Key 和 Region，不要填写 Bedrock API Key 或 Bearer token。',
                })}
              </Text>
            )}

            {provider.id === 'copilot-subscription' && (
              <View style={styles.tokenGuide}>
                <Text style={styles.tokenGuideTitle}>
                  {t({ en: '🔑 How to get your Copilot Token', zh: '🔑 如何获取 Copilot Token' })}
                </Text>
                <Text style={styles.tokenGuideStep}>
                  {t({
                    en: '① Open VS Code → Press Ctrl+Shift+P → Type "GitHub Copilot: Sign In" → Complete GitHub login in the browser',
                    zh: '① 打开 VS Code → 按 Ctrl+Shift+P → 输入 "GitHub Copilot: Sign In" → 在浏览器中完成 GitHub 登录',
                  })}
                </Text>
                <Text style={styles.tokenGuideStep}>
                  {t({
                    en: '② After login, press Ctrl+Shift+P → "Developer: Open Runtime Status" → Find "GitHub Copilot" section → Copy the token value',
                    zh: '② 登录成功后，按 Ctrl+Shift+P → 搜索 "Developer: Open Runtime Status" → 找到 "GitHub Copilot" 部分 → 复制 token 值',
                  })}
                </Text>
                <Text style={styles.tokenGuideStep}>
                  {t({
                    en: '③ Alternative: Use an OpenClaw-compatible relay service. Enter your relay URL in the Base URL field below, and use the relay\'s access token.',
                    zh: '③ 或者：使用 OpenClaw 兼容的中继服务。在下方 Base URL 中填入中继地址，Token 填写中继服务的 access token。',
                  })}
                </Text>
                <Text style={[styles.tokenGuideStep, { color: colors.textMuted, marginTop: 4 }]}>
                  {t({
                    en: '💡 Copilot Pro/Business/Enterprise subscribers get free access to 20+ models including GPT-5, Claude 4.6, Gemini 3.',
                    zh: '💡 Copilot Pro/Business/Enterprise 订阅用户可免费使用 20+ 模型，包括 GPT-5、Claude 4.6、Gemini 3。',
                  })}
                </Text>
              </View>
            )}

            {provider.id === 'chatgpt-subscription' && (
              <View style={styles.tokenGuide}>
                <Text style={styles.tokenGuideTitle}>
                  {t({ en: '🔑 How to get your ChatGPT Token', zh: '🔑 如何获取 ChatGPT Token' })}
                </Text>
                <Text style={styles.tokenGuideStep}>
                  {t({
                    en: '① Log in to chat.openai.com in your browser',
                    zh: '① 在浏览器中登录 chat.openai.com',
                  })}
                </Text>
                <Text style={styles.tokenGuideStep}>
                  {t({
                    en: '② Press F12 → Application tab → Cookies → Find "__Secure-next-auth.session-token" → Copy the value',
                    zh: '② 按 F12 → Application 标签 → Cookies → 找到 "__Secure-next-auth.session-token" → 复制值',
                  })}
                </Text>
                <Text style={styles.tokenGuideStep}>
                  {t({
                    en: '③ Alternative: Use an OpenAI-compatible relay. Enter your relay URL in Base URL and use the relay\'s access token.',
                    zh: '③ 或者：使用 OpenAI 兼容的中继。在 Base URL 中填入中继地址，token 填写中继的 access token。',
                  })}
                </Text>
                <Text style={[styles.tokenGuideStep, { color: colors.textMuted, marginTop: 4 }]}>
                  {t({
                    en: '💡 ChatGPT Plus/Pro subscribers get access to GPT-4o, GPT-5, o3 and more.',
                    zh: '💡 ChatGPT Plus/Pro 订阅用户可使用 GPT-4o、GPT-5、o3 等模型。',
                  })}
                </Text>
              </View>
            )}

            {/* Secret Key (Bedrock, Baidu) */}
            {provider.requiredFields.includes('secretKey') && (
              <>
                <Text style={styles.fieldLabel}>Secret Key *</Text>
                <TextInput
                  style={styles.input}
                  placeholder={saved ? '(leave blank to keep)' : provider.placeholder.secretKey || 'Enter secret key'}
                  placeholderTextColor={colors.textMuted}
                  value={form.secretKey}
                  onChangeText={v => updateForm(provider.id, { secretKey: v })}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </>
            )}

            {/* Region (Bedrock) */}
            {provider.requiredFields.includes('region') && (
              <>
                <Text style={styles.fieldLabel}>Region *</Text>
                <TextInput
                  style={styles.input}
                  placeholder={provider.placeholder.region || 'us-east-1'}
                  placeholderTextColor={colors.textMuted}
                  value={form.region}
                  onChangeText={v => updateForm(provider.id, { region: v })}
                  autoCapitalize="none"
                />
              </>
            )}

            {/* Base URL (optional override) */}
            {provider.optionalFields.includes('baseUrl') && (
              <>
                <Text style={styles.fieldLabel}>Base URL ({t({ en: 'optional', zh: '可选' })})</Text>
                <TextInput
                  style={styles.input}
                  placeholder={provider.baseUrl || 'https://...'}
                  placeholderTextColor={colors.textMuted}
                  value={form.baseUrl}
                  onChangeText={v => updateForm(provider.id, { baseUrl: v })}
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </>
            )}

            {/* Model selector */}
            <Text style={styles.fieldLabel}>{t({ en: 'Model', zh: '模型' })}</Text>
            <TouchableOpacity
              style={styles.modelSelector}
              onPress={() => setModelPickerProvider(provider)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.modelSelectorText}>{getModelLabel(provider.id)}</Text>
                {selectedModel?.positioning && (
                  <Text style={styles.modelSelectorSub}>{selectedModel.positioning}</Text>
                )}
              </View>
              <Text style={styles.chevronSmall}>▸</Text>
            </TouchableOpacity>

            {/* Action buttons */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.btn, styles.btnTest]}
                onPress={() => handleTest(provider)}
                disabled={testing === provider.id}
              >
                {testing === provider.id
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.btnText}>{t({ en: '🔌 Test', zh: '🔌 测试' })}</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, styles.btnSave]}
                onPress={() => handleSave(provider)}
                disabled={saving === provider.id}
              >
                {saving === provider.id
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.btnText}>{t({ en: '💾 Save', zh: '💾 保存' })}</Text>}
              </TouchableOpacity>

              {saved && (
                <TouchableOpacity
                  style={[styles.btn, styles.btnDelete]}
                  onPress={() => handleDelete(provider)}
                >
                  <Text style={styles.btnText}>{t({ en: '🗑', zh: '🗑' })}</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Set as default / Default indicator */}
            {saved && !isDefault && (
              <TouchableOpacity
                style={styles.setDefaultBtn}
                onPress={() => handleSetDefault(provider.id)}
              >
                <Text style={styles.setDefaultText}>
                  ⭐ {t({ en: 'Set as Default for All Agents', zh: '设为所有 Agent 的默认' })}
                </Text>
              </TouchableOpacity>
            )}
            {isDefault && (
              <View style={styles.defaultIndicator}>
                <Text style={styles.defaultIndicatorText}>
                  ⭐ {t({ en: 'Default provider — used by all agents unless overridden per-agent', zh: '默认厂商 — 所有 Agent 使用此API，除非单独配置' })}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  // ─── Main render ──────

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const subProviders = catalog.filter(p => p.billingType === 'subscription');
  const apiIntlProviders = catalog.filter(p => p.billingType !== 'subscription' && p.region === 'international');
  const apiChinaProviders = catalog.filter(p => p.billingType !== 'subscription' && p.region === 'china');

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t({ en: 'AI Provider Management', zh: 'AI 厂商管理' })}</Text>
        <Text style={styles.desc}>
          {t({
            en: 'Configure API providers and subscription relays here. The default provider applies to all agents; override per-agent in Agent Permissions.',
            zh: '在这里统一配置 AI 厂商与订阅中继。默认厂商适用于所有 Agent；可在 Agent 权限中为不同 Agent 单独覆盖。',
          })}
        </Text>

        {/* Summary card */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLine}>
            📊 {t({ en: `${configuredCount} provider(s) configured`, zh: `已配置 ${configuredCount} 个厂商` })}
          </Text>
          <Text style={[styles.summaryLine, { color: colors.textMuted }]}> 
            {t({ en: 'Subscriptions (ChatGPT, Copilot, CN savings plans) and API-key providers all managed here.', zh: '订阅直连（ChatGPT / Copilot / 国内节省计划）与 API 按量厂商统一管理。' })}
          </Text>
          {defaultProvider ? (
            <Text style={styles.summaryLine}>
              ⭐ {t({ en: 'Default: ', zh: '默认: ' })}{defaultProvider.icon} {defaultProvider.name}
              {defaultConfig ? ` · ${catalog.find(p => p.id === defaultConfig.providerId)?.models.find(m => m.id === defaultConfig.selectedModel)?.label || defaultConfig.selectedModel}` : ''}
            </Text>
          ) : (
            <Text style={[styles.summaryLine, { color: colors.textMuted }]}>
              {t({ en: '💡 Save a provider to set a default for all agents', zh: '💡 保存一个厂商即可设为所有 Agent 的默认' })}
            </Text>
          )}
        </View>

        {/* Subscription providers — flat monthly fee */}
        {subProviders.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>{t({ en: '🔄 Subscription (monthly plan)', zh: '🔄 订阅直连（包月/包年）' })}</Text>
            <Text style={styles.sectionHint}>
              {t({
                en: 'Flat monthly fee or resource package — not charged per token. Includes ChatGPT, Copilot Pro+, and CN savings plans (Volcengine, Bailian, MiniMax, DeepSeek, Zhipu).',
                zh: '包月/资源包，不按 token 计量。包含 ChatGPT、Copilot Pro+、以及国内节省计划（火山引擎、百炼、MiniMax、DeepSeek、智谱）。',
              })}
            </Text>
            {subProviders.map(renderProvider)}
          </>
        )}

        {/* API Key providers — pay-per-use, international */}
        <Text style={styles.sectionTitle}>{t({ en: '🌍 API Key — International', zh: '🔑 API Key 按量 — 国际厂商' })}</Text>
        <Text style={styles.sectionHint}>
          {t({
            en: 'Pay-per-token. Get an API key from the provider and pay based on usage.',
            zh: '按 token 量计费。向厂商申请 API Key，按实际使用量扣费。',
          })}
        </Text>
        {apiIntlProviders.map(renderProvider)}

        {/* API Key providers — pay-per-use, China */}
        <Text style={styles.sectionTitle}>{t({ en: '🇨🇳 API Key — China', zh: '🔑 API Key 按量 — 国内厂商' })}</Text>
        {apiChinaProviders.map(renderProvider)}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Model picker modal */}
      <Modal visible={!!modelPickerProvider} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {t({ en: 'Select Model', zh: '选择模型' })}
                {modelPickerProvider ? ` — ${modelPickerProvider.name}` : ''}
              </Text>
              <TouchableOpacity onPress={() => setModelPickerProvider(null)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            {modelPickerProvider && (
              <Text style={styles.modalCurrencyHint}>
                {t({ en: 'Prices per million tokens', zh: '价格为每百万 token' })}
                {modelPickerProvider.currency === 'CNY' ? ' (¥ CNY)' : ' ($ USD)'}
              </Text>
            )}
            <FlatList
              data={modelPickerProvider?.models || []}
              keyExtractor={m => m.id}
              renderItem={({ item: m }) => {
                const badge = COST_BADGE[m.costTier];
                const isSelected = forms[modelPickerProvider!.id]?.selectedModel === m.id;
                return (
                  <TouchableOpacity
                    style={[styles.modelRow, isSelected && styles.modelRowSelected]}
                    onPress={() => {
                      updateForm(modelPickerProvider!.id, { selectedModel: m.id });
                      setModelPickerProvider(null);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}>
                        <Text style={[styles.modelLabel, isSelected && { color: colors.primary }]}>
                          {m.label}
                        </Text>
                        {m.freeApi && (
                          <View style={[styles.freeBadgePill, { marginLeft: 6 }]}>
                            <Text style={styles.freeBadgePillText}>🆓 {m.freeNote || 'Free'}</Text>
                          </View>
                        )}
                      </View>
                      {/* Pricing */}
                      {m.inputPrice || m.outputPrice ? (
                        <Text style={styles.modelPricing}>
                          📥 {m.inputPrice}  📤 {m.outputPrice}
                        </Text>
                      ) : m.premiumMultiplier != null && m.premiumMultiplier === 0 ? (
                        <Text style={[styles.modelPricing, { color: '#22c55e' }]}>
                          🎫 {t({ en: '0x — no premium request used', zh: '0x — 不消耗高级请求额度' })}
                        </Text>
                      ) : m.premiumMultiplier != null && m.premiumMultiplier > 0 ? (
                        <Text style={[styles.modelPricing, { color: m.premiumMultiplier >= 3 ? '#ef4444' : '#f59e0b' }]}>
                          🎫 {m.premiumMultiplier}x {t({ en: 'premium request', zh: '高级请求额度' })}
                        </Text>
                      ) : m.costTier === 'free' ? (
                        <Text style={[styles.modelPricing, { color: '#22c55e' }]}>
                          {t({ en: 'Free', zh: '免费' })}
                        </Text>
                      ) : null}
                      {/* Positioning & context */}
                      <Text style={styles.modelCaps}>
                        {formatCtx(m.contextWindow)} ctx
                        {m.multimodal ? '  ·  🖼 多模态' : ''}
                        {m.positioning ? `  ·  ${m.positioning}` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <View style={[styles.costBadge, { backgroundColor: badge.color + '22' }]}>
                        <Text style={[styles.costBadgeText, { color: badge.color }]}>{badge.label}</Text>
                      </View>
                      {isSelected && <Text style={{ marginTop: 4, color: colors.primary, fontWeight: '700' }}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 },
  desc: { fontSize: 13, color: colors.textSecondary, marginBottom: 16, lineHeight: 19 },

  // Summary
  summaryCard: {
    backgroundColor: colors.bgSecondary, borderRadius: 12,
    padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  summaryLine: { fontSize: 13, color: colors.textPrimary, marginBottom: 4, lineHeight: 20 },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginTop: 16, marginBottom: 4 },
  sectionHint: { fontSize: 12, color: colors.textMuted, marginBottom: 10, lineHeight: 17 },

  // Card
  card: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, marginBottom: 10, overflow: 'hidden',
  },
  cardActive: { borderColor: colors.primary, borderWidth: 1.5 },
  cardDefault: { borderColor: '#f59e0b', borderWidth: 2 },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
  },
  providerIcon: { fontSize: 24 },
  providerName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  keyHint: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  defaultBadge: { fontSize: 11, color: '#f59e0b', fontWeight: '600', marginLeft: 8 },
  freeBadge: { fontSize: 11, color: '#22c55e', marginTop: 2 },
  chevron: { fontSize: 14, color: colors.textMuted },

  // Card body
  cardBody: { paddingHorizontal: 14, paddingBottom: 14 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginTop: 10, marginBottom: 4 },
  fieldHint: { fontSize: 12, color: colors.textMuted, lineHeight: 18, marginBottom: 2 },
  input: {
    backgroundColor: colors.bgPrimary,
    borderWidth: 1, borderColor: colors.border, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    color: colors.textPrimary, fontSize: 14,
  },

  // Model selector
  modelSelector: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.bgPrimary,
    borderWidth: 1, borderColor: colors.border, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 11,
  },
  modelSelectorText: { fontSize: 14, color: colors.textPrimary },
  modelSelectorSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  chevronSmall: { fontSize: 12, color: colors.textMuted },

  // Action row
  actionRow: { flexDirection: 'row', marginTop: 14, gap: 8 },
  btn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  btnTest: { backgroundColor: '#6366f1' },
  btnSave: { backgroundColor: colors.primary },
  btnDelete: { backgroundColor: '#ef4444', flex: 0.4 },
  btnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  // Default
  setDefaultBtn: {
    marginTop: 10, paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 8, borderWidth: 1, borderColor: '#f59e0b',
    alignItems: 'center',
  },
  setDefaultText: { fontSize: 13, color: '#f59e0b', fontWeight: '600' },
  defaultIndicator: {
    marginTop: 10, paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 8, backgroundColor: '#f59e0b15',
  },
  defaultIndicatorText: { fontSize: 12, color: '#f59e0b', lineHeight: 18 },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.bgPrimary,
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    maxHeight: '75%', paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  modalClose: { fontSize: 18, color: colors.textMuted, padding: 4 },
  modalCurrencyHint: { fontSize: 11, color: colors.textMuted, paddingHorizontal: 16, paddingTop: 8 },

  // Model row
  modelRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  modelRowSelected: { backgroundColor: colors.primary + '10' },
  modelLabel: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  modelPricing: { fontSize: 12, color: colors.textSecondary, marginBottom: 2 },
  modelCaps: { fontSize: 11, color: colors.textMuted },
  costBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  costBadgeText: { fontSize: 11, fontWeight: '700' },
  freeBadgePill: { backgroundColor: '#22c55e18', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  freeBadgePillText: { fontSize: 10, color: '#22c55e', fontWeight: '600' },

  // Token acquisition guide
  tokenGuide: {
    backgroundColor: '#6366f110', borderRadius: 10, padding: 12,
    marginTop: 8, borderWidth: 1, borderColor: '#6366f130',
  },
  tokenGuideTitle: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  tokenGuideStep: { fontSize: 12, color: colors.textSecondary, lineHeight: 20, marginBottom: 4 },
});
