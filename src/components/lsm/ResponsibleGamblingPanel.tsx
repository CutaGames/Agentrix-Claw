// LSM 责任博彩面板（移动端）— 与网页端 /lsm/responsible-gambling 对齐。
// 自限额度（即时收紧/延迟放宽）+ 自我排除 + 冷静期。后端 LSM_RG_ENABLED 灰度；
// 关闭时为观察态（仍可预设，正式启用即时生效）。AXP/USDC 分开表述（合规）。
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { lsmApi, rgErrorText, LsmRgStatus, LsmAsset, LsmLimitType } from '../../services/lsm.api';

const LIMIT_LABELS: Record<string, { zh: string; en: string }> = {
  bet_amount_daily: { zh: '每日投注额上限', en: 'Daily stake cap' },
  bet_count_daily: { zh: '每日投注笔数上限', en: 'Daily bet count cap' },
  loss_daily: { zh: '每日净损失上限', en: 'Daily net-loss cap' },
  loss_weekly: { zh: '每周净损失上限', en: 'Weekly net-loss cap' },
  deposit_daily: { zh: '每日存款上限', en: 'Daily deposit cap' },
  deposit_weekly: { zh: '每周存款上限', en: 'Weekly deposit cap' },
};

const COOL_OFF = [
  { secs: 3600, zh: '1 小时', en: '1h' },
  { secs: 86400, zh: '24 小时', en: '24h' },
];
const EXCLUDE = [
  { secs: 7 * 86400, zh: '7 天', en: '7d' },
  { secs: 30 * 86400, zh: '30 天', en: '30d' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  asset?: LsmAsset;
}

export function ResponsibleGamblingPanel({ visible, onClose, asset = 'AXP' }: Props) {
  const { language } = useI18n();
  const zh = language === 'zh';
  const tr = (en: string, z: string) => (zh ? z : en);

  const [status, setStatus] = useState<LsmRgStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await lsmApi.rgStatus(asset));
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [asset]);

  useEffect(() => {
    if (visible) refresh();
  }, [visible, refresh]);

  const saveLimit = async (limitType: LsmLimitType) => {
    const value = Number(drafts[limitType]);
    if (!Number.isInteger(value) || value < 0) {
      Alert.alert(tr('Invalid value', '数值无效'), tr('Enter a non-negative integer', '请输入非负整数'));
      return;
    }
    setBusy(true);
    try {
      setStatus(await lsmApi.rgSetLimit({ asset, limitType, value }));
      Alert.alert(tr('Saved', '已保存'), tr('Loosening applies after the cooldown.', '放宽将在冷却期后生效。'));
    } catch (e: any) {
      Alert.alert(tr('Failed', '失败'), rgErrorText(e) || (e?.message ?? ''));
    } finally {
      setBusy(false);
    }
  };

  const doCoolOff = async (secs: number) => {
    setBusy(true);
    try {
      await lsmApi.rgCoolOff(secs);
      await refresh();
      Alert.alert(tr('Cool-off on', '冷静期已开启'), tr('Auto-resumes when it expires.', '到期自动恢复。'));
    } catch (e: any) {
      Alert.alert(tr('Failed', '失败'), rgErrorText(e) || (e?.message ?? ''));
    } finally {
      setBusy(false);
    }
  };

  const doExclude = (secs?: number, permanent?: boolean) => {
    const label = permanent
      ? tr('permanent self-exclusion (manual lift only)', '永久自我排除（仅人工/合规解除）')
      : tr('self-exclusion', '自我排除');
    Alert.alert(
      tr('Confirm', '确认'),
      tr(`Enable ${label}? You cannot bet or deposit during it.`, `确认开启${label}？期间无法下注或入金。`),
      [
        { text: tr('Cancel', '取消'), style: 'cancel' },
        {
          text: tr('Confirm', '确认'),
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await lsmApi.rgSelfExclude({ durationSecs: secs, permanent });
              await refresh();
            } catch (e: any) {
              Alert.alert(tr('Failed', '失败'), rgErrorText(e) || (e?.message ?? ''));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const fmtTime = (ms: number) => new Date(ms).toLocaleString();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{tr('Responsible Gambling', '责任博彩')}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.close}>{tr('Close', '关闭')}</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
          ) : (
            <ScrollView style={{ maxHeight: 520 }}>
              {status && !status.enabled && (
                <Text style={styles.hint}>
                  {tr(
                    'RG gate is in observe mode (testnet). You can preset limits; they apply once enabled.',
                    '责任博彩当前为观察态（测试网）。可预设限额，正式启用后即时生效。',
                  )}
                </Text>
              )}

              {status && (status.selfExcludedUntil || status.coolOffUntil) && (
                <View style={styles.statusBox}>
                  {status.selfExcludedUntil && (
                    <Text style={styles.statusExcl}>
                      {tr('Self-excluded: ', '自我排除中：')}
                      {status.selfExcludedUntil === 'permanent'
                        ? tr('permanent', '永久（仅人工解除）')
                        : fmtTime(status.selfExcludedUntil as number)}
                    </Text>
                  )}
                  {status.coolOffUntil && (
                    <Text style={styles.statusCool}>
                      {tr('Cool-off until ', '冷静期至 ')}
                      {fmtTime(status.coolOffUntil)}
                    </Text>
                  )}
                </View>
              )}

              {/* 自限额度 */}
              <Text style={styles.section}>{tr(`Self limits (${asset})`, `自限额度（${asset}）`)}</Text>
              <Text style={styles.sub}>
                {tr(
                  'Lowering applies immediately; raising/removing takes effect after a cooldown (default 24h).',
                  '调低立即生效；调高/移除在冷却期（默认 24h）后生效。',
                )}
              </Text>
              {status &&
                Object.entries(status.limits).map(([type, v]) => (
                  <View key={type} style={styles.limitRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.limitLabel}>{tr(LIMIT_LABELS[type]?.en || type, LIMIT_LABELS[type]?.zh || type)}</Text>
                      <Text style={styles.limitUsed}>
                        {tr('used', '已用')} {v.used}
                        {v.limit != null ? ` / ${v.limit}` : tr(' / none', ' / 未设')}
                      </Text>
                    </View>
                    <TextInput
                      style={styles.input}
                      keyboardType="number-pad"
                      placeholder={v.limit != null ? String(v.limit) : tr('cap', '上限')}
                      placeholderTextColor={colors.textSecondary}
                      value={drafts[type] ?? ''}
                      onChangeText={(txt) => setDrafts((d) => ({ ...d, [type]: txt }))}
                    />
                    <TouchableOpacity
                      style={styles.saveBtn}
                      disabled={busy}
                      onPress={() => saveLimit(type as LsmLimitType)}
                    >
                      <Text style={styles.saveBtnTxt}>{tr('Save', '保存')}</Text>
                    </TouchableOpacity>
                  </View>
                ))}

              {/* 冷静期 */}
              <Text style={styles.section}>{tr('Cool-off', '冷静期')}</Text>
              <View style={styles.btnRow}>
                {COOL_OFF.map((o) => (
                  <TouchableOpacity key={o.secs} style={styles.chip} disabled={busy} onPress={() => doCoolOff(o.secs)}>
                    <Text style={styles.chipTxt}>{tr(o.en, o.zh)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* 自我排除 */}
              <Text style={styles.section}>{tr('Self-exclusion', '自我排除')}</Text>
              <Text style={styles.sub}>
                {tr(
                  'No betting or deposits during it. Permanent exclusion can only be lifted via support.',
                  '期间无法下注或入金。永久排除仅可经人工/合规解除。',
                )}
              </Text>
              <View style={styles.btnRow}>
                {EXCLUDE.map((o) => (
                  <TouchableOpacity key={o.secs} style={styles.chip} disabled={busy} onPress={() => doExclude(o.secs)}>
                    <Text style={styles.chipTxt}>{tr(o.en, o.zh)}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={[styles.chip, styles.chipDanger]} disabled={busy} onPress={() => doExclude(undefined, true)}>
                  <Text style={[styles.chipTxt, { color: '#f87171' }]}>{tr('Permanent', '永久')}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  close: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  hint: { color: colors.textSecondary, fontSize: 12, marginBottom: 10 },
  statusBox: { backgroundColor: colors.card, borderRadius: 10, padding: 10, marginBottom: 10 },
  statusExcl: { color: '#f87171', fontSize: 13 },
  statusCool: { color: '#f59e0b', fontSize: 13, marginTop: 2 },
  section: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 14, marginBottom: 4 },
  sub: { color: colors.textSecondary, fontSize: 11, marginBottom: 8 },
  limitRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  limitLabel: { color: colors.text, fontSize: 13 },
  limitUsed: { color: colors.textSecondary, fontSize: 11, marginTop: 1 },
  input: {
    width: 88,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: colors.text,
  },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  saveBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  chipDanger: { borderColor: 'rgba(248,113,113,0.4)' },
  chipTxt: { color: colors.text, fontSize: 13 },
});
