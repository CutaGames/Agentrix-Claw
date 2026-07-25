/**
 * EventsCenterScreen — 活动中心(P1-⑥)。
 *
 * 把跨游戏的「技能对赛奖池」(arena tournaments)与「赛事预测」(prediction markets)
 * 聚合到一个可发现的入口:看到正在进行的活动 → 一键报名/去预测。给"世界在运转、有奖可拿"
 * 的体感,承载赛季/限时活动(themed time-boxed tournaments)。
 */
import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useI18n } from '../../stores/i18nStore';
import { useColors, useThemedStyles, type Palette } from '../../theme/useTheme';
import {
  listTournaments, joinTournament, listPredictions,
  type ArenaTournament, type PredictionMarket,
} from '../../services/worldEngagementApi';

export default function EventsCenterScreen() {
  const { t } = useI18n();
  const c = useColors();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<any>();

  const [tours, setTours] = useState<ArenaTournament[]>([]);
  const [markets, setMarkets] = useState<PredictionMarket[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      listTournaments().then((r) => r.items ?? []).catch(() => []),
      listPredictions(undefined, 'open').then((r) => r.items ?? []).catch(() => []),
    ]).then(([ts, ms]) => {
      setTours(ts.filter((x) => x.status === 'open'));
      setMarkets(ms);
    }).finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onJoin = useCallback((tm: ArenaTournament) => {
    Alert.alert(
      t({ en: 'Join tournament', zh: '报名对赛' }),
      t({ en: `Entry ${tm.entryFeeAxp} AXP. Top scorers split the pool.`, zh: `报名费 ${tm.entryFeeAxp} AXP,高分瓜分奖池。` }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        {
          text: t({ en: 'Join', zh: '报名' }),
          onPress: () => joinTournament(tm.id)
            .then(() => { load(); Alert.alert(t({ en: 'Joined!', zh: '报名成功!' }), t({ en: 'Play the game — your best score counts.', zh: '去玩这个游戏,你的最高分参与排名!' })); })
            .catch((e: any) => Alert.alert(t({ en: 'Failed', zh: '报名失败' }), e?.message ?? '')),
        },
      ],
    );
  }, [load, t]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🎟️ {t({ en: 'Events', zh: '活动中心' })}</Text>
        <Text style={styles.subtitle}>{t({ en: 'Tournaments & predictions · win AXP', zh: '对赛奖池 & 赛事预测 · 赢 AXP' })}</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={c.accent} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionTitle}>🏆 {t({ en: 'Skill tournaments', zh: '技能对赛奖池' })}</Text>
          {tours.length === 0 ? (
            <Text style={styles.dim}>{t({ en: 'No open tournaments. Check back soon!', zh: '暂无进行中的对赛,敬请期待!' })}</Text>
          ) : tours.map((tm) => (
            <View key={tm.id} style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>{tm.title}</Text>
                <Text style={styles.cardMeta}>💰 {t({ en: 'pool', zh: '奖池' })} {tm.prizePool} · {t({ en: 'fee', zh: '报名' })} {tm.entryFeeAxp} AXP</Text>
              </View>
              {tm.joined ? (
                <Text style={styles.joined}>✓ {t({ en: 'Joined', zh: '已报名' })}</Text>
              ) : (
                <TouchableOpacity style={styles.joinBtn} onPress={() => onJoin(tm)}>
                  <Text style={styles.joinText}>{t({ en: 'Join', zh: '报名' })}</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}

          <Text style={[styles.sectionTitle, { marginTop: 18 }]}>🔮 {t({ en: 'Predictions', zh: '赛事预测' })}</Text>
          {markets.length === 0 ? (
            <Text style={styles.dim}>{t({ en: 'No open markets.', zh: '暂无开放的预测。' })}</Text>
          ) : markets.map((m) => (
            <TouchableOpacity key={m.id} style={styles.card} onPress={() => navigation.navigate('PredictionMarket')}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>{m.title}</Text>
                <Text style={styles.cardMeta}>💰 {t({ en: 'pool', zh: '彩池' })} {m.totalPool} AXP · {m.options.length} {t({ en: 'options', zh: '选项' })}</Text>
              </View>
              <Text style={styles.go}>{t({ en: 'Predict', zh: '去预测' })} ›</Text>
            </TouchableOpacity>
          ))}
          <Text style={styles.legal}>{t({ en: 'Skill-based pools & pooled predictions. AXP are utility points. May be region-limited.', zh: '技能奖池 & 平分彩池。AXP 为实用积分。部分地区可能不可用。' })}</Text>
        </ScrollView>
      )}
    </View>
  );
}

function makeStyles(c: Palette) { return ({
  container: { flex: 1, backgroundColor: c.bgPrimary },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  title: { color: c.textPrimary, fontSize: 22, fontWeight: '800' },
  subtitle: { color: c.textMuted, fontSize: 13, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, paddingBottom: 60 },
  sectionTitle: { color: c.textPrimary, fontSize: 15, fontWeight: '800', marginBottom: 10 },
  dim: { color: c.textMuted, fontSize: 13, paddingVertical: 12 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.bgCard, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: c.border, marginBottom: 10 },
  cardTitle: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
  cardMeta: { color: c.textMuted, fontSize: 12, marginTop: 4 },
  joinBtn: { backgroundColor: c.accent, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  joinText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  joined: { color: c.success, fontSize: 12, fontWeight: '700' },
  go: { color: c.accent, fontSize: 13, fontWeight: '800' },
  legal: { color: c.textMuted, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 14 },
}); }
