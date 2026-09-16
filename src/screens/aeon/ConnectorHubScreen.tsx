/**
 * ConnectorHubScreen — 连接器/插件库(目录 + 一键装 + 鉴权向导 + 派 agent 办事)。
 *
 * 三件套:
 *   1. 目录:精选连接器卡片(分类),显示状态(可用/即将上线)、是否已安装。
 *   2. 一键装 + 鉴权向导:免鉴权直接装;需 key/token 的弹表单收集后装。
 *   3. 派 agent 办事(玩法 A):live 的"现实"连接器(加密行情/天气)可"派 agent 去办" →
 *      调 /errand → 办成发 AXP + 写世界新闻,结果弹出"赚得 N AXP"。
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  TextInput, Modal, Alert, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { colors } from '../../theme/colors';
import {
  listConnectors, installConnector, uninstallConnector, runConnectorErrand,
  getOAuthAuthorizeUrl, listInstalledConnectors,
} from '../../services/connectorApi';
import type { ConnectorCatalogItem } from '../../../shared/types/connector';
import { themedStyles } from '../../theme/useTheme';

const CATEGORY_LABEL: Record<string, string> = {
  info: '资讯', finance: '金融', travel: '出行', food: '餐饮',
  shopping: '购物', productivity: '生产力', dev: '开发', social: '社交',
};
const AUTH_LABEL: Record<string, string> = {
  none: '免鉴权', api_key: '需 API Key', bearer: '需 Token', oauth: '需 OAuth 授权',
};

/** OAuth 回跳后轮询安装态的尝试次数与间隔(回跳→后端落库通常瞬时,留少量重试容错)。 */
const OAUTH_INSTALL_POLL_ATTEMPTS = 4;
const OAUTH_INSTALL_POLL_DELAY_MS = 1_200;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export default function ConnectorHubScreen() {
  const navigation = useNavigation<any>();
  const [items, setItems] = useState<ConnectorCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  // 鉴权向导
  const [wizard, setWizard] = useState<ConnectorCatalogItem | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [token, setToken] = useState('');

  // 派 agent 办事(查询参数)
  const [errand, setErrand] = useState<ConnectorCatalogItem | null>(null);
  const [errandArg, setErrandArg] = useState('');

  const load = useCallback(async () => {
    try {
      setItems(await listConnectors());
    } catch (e: any) {
      Alert.alert('加载失败', e?.message ?? '请稍后再试');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const doInstall = useCallback(async (c: ConnectorCatalogItem, creds?: { apiKey?: string; token?: string }) => {
    setBusy(true);
    try {
      const r = await installConnector({ connectorId: c.id, credentials: creds });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setWizard(null);
      setApiKey('');
      setToken('');
      await load();
      Alert.alert('已安装', r.message + (r.tools?.length ? `\n新增可调工具:${r.tools.join(', ')}` : ''));
    } catch (e: any) {
      Alert.alert('安装失败', e?.message ?? '请重试');
    } finally {
      setBusy(false);
    }
  }, [load]);

  /**
   * OAuth 连接器(google-calendar / gmail 等)按需授权安装(2026-06 从首跑主线下放到此处)。
   * 流程:取授权 URL → WebBrowser 打开 provider 授权页 → 回跳后端 `oauth/callback`(后端校验
   * state 并落库)→ 浏览器会话结束后轮询 `/connectors/installed`,该连接器出现即视为授权成功
   * (取消/失败则不出现)。后端未配置 provider 凭据 / 不支持 OAuth 时抛描述性错误 → 提示用户。
   *
   * 注意:连接器 OAuth 的 returnUrl 用独立 deep link `connectors/oauth`,与登录 OAuth 的
   * `auth/callback` 解耦——后者会被路由到 AuthCallbackScreen,二者绝不共用回跳屏。
   */
  const doOAuthInstall = useCallback(async (c: ConnectorCatalogItem) => {
    setBusy(true);
    try {
      const { url } = await getOAuthAuthorizeUrl(c.id);
      const returnUrl = Linking.createURL('connectors/oauth');
      try {
        await WebBrowser.openAuthSessionAsync(url, returnUrl, { showInRecents: true });
      } catch {
        /* 打开/关闭浏览器异常不致命:仍以轮询安装态判定结果。 */
      }
      // 浏览器会话结束后轮询「我已安装」:出现该连接器即授权成功。
      let installed = false;
      for (let i = 0; i < OAUTH_INSTALL_POLL_ATTEMPTS; i++) {
        try {
          const list = await listInstalledConnectors();
          if (list.some((x) => x.id === c.id)) { installed = true; break; }
        } catch {
          /* 轮询瞬时失败:重试 */
        }
        if (i < OAUTH_INSTALL_POLL_ATTEMPTS - 1) await sleep(OAUTH_INSTALL_POLL_DELAY_MS);
      }
      if (installed) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await load();
        Alert.alert('已连接', `「${c.name}」已授权连接,你的 agent 现在可以用它办事了。`);
      } else {
        Alert.alert('授权未完成', '没有检测到授权完成,你可以重试。如果刚刚取消了授权,可再点一次「连接」。');
      }
    } catch (e: any) {
      Alert.alert('暂时无法连接', e?.message ?? '稍后再试,或在桌面端完成 Google 授权。');
    } finally {
      setBusy(false);
    }
  }, [load]);

  const onInstallPress = useCallback((c: ConnectorCatalogItem) => {
    if (c.status === 'coming_soon') {
      Alert.alert('即将上线', `「${c.name}」即将上线,敬请期待。`);
      return;
    }
    if (c.authKind === 'none') {
      void doInstall(c);
    } else if (c.authKind === 'oauth') {
      void doOAuthInstall(c);
    } else {
      // 需要 key/token → 打开鉴权向导
      setApiKey('');
      setToken('');
      setWizard(c);
    }
  }, [doInstall, doOAuthInstall]);

  const onUninstall = useCallback((c: ConnectorCatalogItem) => {
    Alert.alert('卸载', `卸载「${c.name}」?`, [
      { text: '取消', style: 'cancel' },
      {
        text: '卸载', style: 'destructive', onPress: async () => {
          setBusy(true);
          try { await uninstallConnector(c.id); await load(); } catch (e: any) { Alert.alert('卸载失败', e?.message ?? ''); } finally { setBusy(false); }
        },
      },
    ]);
  }, [load]);

  const submitWizard = useCallback(() => {
    if (!wizard) return;
    if (wizard.authKind === 'api_key' && !apiKey.trim()) { Alert.alert('请输入 API Key'); return; }
    if (wizard.authKind === 'bearer' && !token.trim()) { Alert.alert('请输入 Token'); return; }
    void doInstall(wizard, { apiKey: apiKey.trim() || undefined, token: token.trim() || undefined });
  }, [wizard, apiKey, token, doInstall]);

  const onErrandPress = useCallback((c: ConnectorCatalogItem) => {
    setErrandArg('');
    setErrand(c);
  }, []);

  const submitErrand = useCallback(async () => {
    if (!errand) return;
    const arg = errandArg.trim();
    // 按连接器类型组装参数:crypto→coin,weather→city。
    const args: Record<string, unknown> =
      errand.id === 'crypto-price' ? { coin: arg || 'bitcoin' } :
      errand.id === 'weather' ? { city: arg || 'Beijing' } : {};
    setBusy(true);
    try {
      const r = await runConnectorErrand(errand.id, args);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setErrand(null);
      Alert.alert('办成了!', `${r.summary}${r.bridged ? `\n钱包余额:${r.balance} AXP` : ''}`);
    } catch (e: any) {
      Alert.alert('办事失败', e?.message ?? '请重试');
    } finally {
      setBusy(false);
    }
  }, [errand, errandArg]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></View>;
  }

  // 按分类分组
  const grouped: Record<string, ConnectorCatalogItem[]> = {};
  for (const c of items) {
    (grouped[c.category] ??= []).push(c);
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.accent} />}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}><Text style={styles.backText}>‹ 返回</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>🔌 连接器</Text>
        <View style={{ minWidth: 56 }} />
      </View>
      <Text style={styles.intro}>装上连接器,让你的 agent 能办更多真事。⚡ live 的可"派 agent 去办",办成赚 AXP。</Text>

      {Object.entries(grouped).map(([cat, list]) => (
        <View key={cat}>
          <Text style={styles.catHeader}>{CATEGORY_LABEL[cat] ?? cat}</Text>
          {list.map((c) => (
            <View key={c.id} style={styles.card}>
              <Text style={styles.cardIcon}>{c.icon}</Text>
              <View style={{ flex: 1 }}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardName}>{c.name}</Text>
                  {c.status === 'live' ? <Text style={styles.liveTag}>● live</Text> : <Text style={styles.soonTag}>即将上线</Text>}
                  {c.installed ? <Text style={styles.installedTag}>已装</Text> : null}
                </View>
                <Text style={styles.cardDesc} numberOfLines={2}>{c.description}</Text>
                <Text style={styles.cardMeta}>{AUTH_LABEL[c.authKind]}{c.rewardAxp ? ` · 办成 +${c.rewardAxp} AXP` : ''}{c.chinaAvailable ? ' · 国内可用' : ''}</Text>
                <View style={styles.cardActions}>
                  {c.installed ? (
                    <TouchableOpacity style={styles.ghostBtn} onPress={() => onUninstall(c)} disabled={busy}><Text style={styles.ghostBtnText}>卸载</Text></TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={[styles.primaryBtn, c.status === 'coming_soon' && styles.disabledBtn]} onPress={() => onInstallPress(c)} disabled={busy}><Text style={styles.primaryBtnText}>{c.status === 'coming_soon' ? '预告' : '安装'}</Text></TouchableOpacity>
                  )}
                  {c.status === 'live' && c.reality && (c.id === 'crypto-price' || c.id === 'weather') ? (
                    <TouchableOpacity style={styles.errandBtn} onPress={() => onErrandPress(c)} disabled={busy}><Text style={styles.errandBtnText}>🏃 派 agent 去办</Text></TouchableOpacity>
                  ) : null}
                </View>
              </View>
            </View>
          ))}
        </View>
      ))}

      {/* 鉴权向导 */}
      <Modal visible={wizard != null} transparent animationType="slide" onRequestClose={() => setWizard(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>连接「{wizard?.name}」</Text>
            <Text style={styles.modalSub}>{wizard?.authKind === 'api_key' ? '输入该服务的 API Key:' : '输入 Bearer Token:'}</Text>
            {wizard?.authKind === 'api_key' ? (
              <TextInput style={styles.input} placeholder="API Key" placeholderTextColor={colors.textMuted} value={apiKey} onChangeText={setApiKey} autoCapitalize="none" secureTextEntry />
            ) : (
              <TextInput style={styles.input} placeholder="Bearer Token" placeholderTextColor={colors.textMuted} value={token} onChangeText={setToken} autoCapitalize="none" secureTextEntry />
            )}
            <Text style={styles.modalHint}>凭据仅用于你的 agent 调用该服务。</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setWizard(null)}><Text style={styles.cancelText}>取消</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, busy && { opacity: 0.5 }]} onPress={submitWizard} disabled={busy}><Text style={styles.confirmText}>{busy ? '安装中…' : '安装'}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 派 agent 办事 */}
      <Modal visible={errand != null} transparent animationType="slide" onRequestClose={() => setErrand(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>🏃 派 agent 去办「{errand?.name}」</Text>
            <Text style={styles.modalSub}>
              {errand?.id === 'crypto-price' ? '查哪个币?(如 bitcoin / ethereum / solana)' :
               errand?.id === 'weather' ? '查哪个城市?(如 Beijing / Shanghai / Tokyo)' : '参数:'}
            </Text>
            <TextInput style={styles.input} placeholder={errand?.id === 'crypto-price' ? 'bitcoin' : 'Beijing'} placeholderTextColor={colors.textMuted} value={errandArg} onChangeText={setErrandArg} autoCapitalize="none" />
            <Text style={styles.modalHint}>办成后你的 agent 会在永曜城赚得 {errand?.rewardAxp ?? 10} AXP,并在世界动态留下一条新闻。</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setErrand(null)}><Text style={styles.cancelText}>取消</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, busy && { opacity: 0.5 }]} onPress={submitErrand} disabled={busy}><Text style={styles.confirmText}>{busy ? '办理中…' : '派去办'}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  center: { flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 8 },
  back: { minWidth: 56 }, backText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  headerTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  intro: { color: colors.textMuted, fontSize: 12, paddingHorizontal: 16, marginBottom: 8, lineHeight: 18 },
  catHeader: { color: colors.textSecondary, fontSize: 13, fontWeight: '700', paddingHorizontal: 16, marginTop: 14, marginBottom: 6 },
  card: { flexDirection: 'row', gap: 12, backgroundColor: colors.bgCard, borderRadius: 14, padding: 14, marginHorizontal: 16, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  cardIcon: { fontSize: 30 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  cardName: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  liveTag: { color: '#ff5a5f', fontSize: 11, fontWeight: '700' },
  soonTag: { color: colors.textMuted, fontSize: 11 },
  installedTag: { color: colors.accent, fontSize: 11, fontWeight: '700' },
  cardDesc: { color: colors.textSecondary, fontSize: 13, marginTop: 4, lineHeight: 18 },
  cardMeta: { color: colors.textMuted, fontSize: 11, marginTop: 6 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  primaryBtn: { backgroundColor: colors.accent, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 7 },
  primaryBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  disabledBtn: { backgroundColor: colors.bgSecondary },
  ghostBtn: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 7, borderWidth: 1, borderColor: colors.border },
  ghostBtnText: { color: colors.textMuted, fontSize: 13 },
  errandBtn: { backgroundColor: '#140e2e', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(167,139,250,0.5)' },
  errandBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.bgSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  modalTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '800', marginBottom: 12 },
  modalSub: { color: colors.textSecondary, fontSize: 13, marginBottom: 8 },
  modalHint: { color: colors.textMuted, fontSize: 11, marginTop: 8, lineHeight: 16 },
  input: { backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, borderWidth: 1, borderColor: colors.border },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center' },
  cancelText: { color: colors.textMuted, fontSize: 14 },
  confirmBtn: { flex: 1, paddingVertical: 13, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center' },
  confirmText: { color: '#fff', fontSize: 14, fontWeight: '700' },
}));
