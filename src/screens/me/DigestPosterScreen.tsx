/**
 * DigestPosterScreen — 全网机会日报「可转发竖版海报」（移动端）。
 *
 * 拉取后端公开端点 `GET {API_BASE}/aggregation/digest/today`（@Public，无需登录），
 * 把当日机会日报渲染为一张竖版长图海报，用 `react-native-view-shot` 截图为 PNG，
 * 再经 `expo-sharing` 调起系统分享面板——可直接分享到微信/微信群/朋友圈/任意 App。
 * 相比 web（受微信 WebView 限制），原生 app 的系统分享是一等公民、体验最顺。
 *
 * 海报内容：标题 + 日期 + 摘要 + 各分段 Top 3 条目（预测/空投/任务/技能工具/代币）+
 * shareUrl 二维码 + Agentrix 品牌。复用 ShareCardView 的 ViewShot + Sharing 范式。
 *
 * 数据契约（与后端 OpportunityDigestService 对齐）：
 *   { payload: { date, summary, shareUrl, sections: [{ title, items: [{title,subtitle,url,badge}] }] } }
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import ViewShot, { CaptureOptions } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useI18n } from '../../stores/i18nStore';
import { getApiConfig } from '../../services/api';

interface DigestItem {
  title: string;
  subtitle?: string;
  url?: string;
  badge?: string;
}
interface DigestSection {
  title: string;
  items: DigestItem[];
}
interface DigestPayload {
  date: string;
  summary?: string;
  shareUrl?: string;
  sections: DigestSection[];
}

const SITE_BASE = 'https://agentrix.top';

/** 每段海报展示的 Top 条目数。 */
const TOP_PER_SECTION = 3;

export function DigestPosterScreen() {
  const { t } = useI18n();
  const viewShotRef = useRef<ViewShot>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<DigestPayload | null>(null);
  const [capturing, setCapturing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = (getApiConfig().baseUrl || '').replace(/\/+$/, '');
      const res = await fetch(`${base}/aggregation/digest/today`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      const p: DigestPayload | undefined = data?.payload;
      if (!p || !Array.isArray(p.sections)) {
        throw new Error('digest payload malformed');
      }
      setPayload(p);
    } catch (e: any) {
      setError(e?.message || t({ en: 'Failed to load digest', zh: '日报加载失败' }));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const shareUrl = payload?.shareUrl || `${SITE_BASE}/digest/${payload?.date ?? 'today'}`;

  const captureAndShare = useCallback(async () => {
    if (!payload) return;
    try {
      setCapturing(true);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare && viewShotRef.current) {
        const opts: CaptureOptions = { format: 'png', quality: 1, result: 'tmpfile' };
        const uri: string = await (viewShotRef.current as any).capture(opts);
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: t({ en: 'Share Daily Digest', zh: '分享机会日报' }),
        });
      } else {
        await Share.share({
          message: `${t({ en: 'Daily Opportunity Digest', zh: '全网机会日报' })} ${payload.date}\n${shareUrl}`,
          url: shareUrl,
        });
      }
    } catch (err: any) {
      if (err?.message !== 'User did not share') {
        Alert.alert(
          t({ en: 'Share failed', zh: '分享失败' }),
          err?.message ?? t({ en: 'Unable to share', zh: '暂时无法分享' }),
        );
      }
    } finally {
      setCapturing(false);
    }
  }, [payload, shareUrl, t]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.dim}>{t({ en: 'Loading digest…', zh: '正在生成日报…' })}</Text>
      </View>
    );
  }

  if (error || !payload) {
    return (
      <View style={styles.center}>
        <Text style={styles.errText}>{error || t({ en: 'No digest', zh: '暂无日报' })}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={load} activeOpacity={0.8}>
          <Text style={styles.retryText}>{t({ en: 'Retry', zh: '重试' })}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const totalItems = payload.sections.reduce((n, s) => n + (s.items?.length || 0), 0);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
        {/* 截图源：竖版海报 */}
        <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1 }} style={styles.posterWrap}>
          <LinearGradient
            colors={['#0b1020', '#161d38']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.poster}
          >
            {/* 头部 */}
            <View style={styles.headerRow}>
              <View style={styles.logoBox}>
                <Text style={styles.logoText}>A</Text>
              </View>
              <Text style={styles.brand}>Agentrix</Text>
            </View>
            <Text style={styles.posterTitle}>{t({ en: 'Daily Opportunity Digest', zh: '全网机会日报' })}</Text>
            <Text style={styles.posterDate}>{payload.date}</Text>
            {payload.summary ? <Text style={styles.summary}>{payload.summary}</Text> : null}
            <View style={styles.metaRow}>
              <Text style={styles.metaChip}>
                {payload.sections.length} {t({ en: 'categories', zh: '品类' })}
              </Text>
              <Text style={styles.metaChip}>
                {totalItems} {t({ en: 'opportunities', zh: '条机会' })}
              </Text>
            </View>

            <View style={styles.divider} />

            {/* 分段 */}
            {payload.sections.map((section, si) => (
              <View key={`${section.title}-${si}`} style={styles.section}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                {section.items.slice(0, TOP_PER_SECTION).map((item, ii) => (
                  <View key={ii} style={styles.itemRow}>
                    <Text style={styles.itemIndex}>{ii + 1}</Text>
                    <View style={styles.itemBody}>
                      <Text style={styles.itemTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      {item.subtitle ? (
                        <Text style={styles.itemSub} numberOfLines={1}>
                          {item.subtitle}
                        </Text>
                      ) : null}
                    </View>
                    {item.badge ? <Text style={styles.itemBadge}>{item.badge}</Text> : null}
                  </View>
                ))}
              </View>
            ))}

            <View style={styles.divider} />

            {/* 底部：二维码 + 品牌 */}
            <View style={styles.qrRow}>
              <View style={styles.qrBox}>
                <QRCode value={shareUrl} size={84} backgroundColor="#ffffff" color="#0b1020" />
              </View>
              <View style={styles.qrCopy}>
                <Text style={styles.qrTitle}>{t({ en: 'Scan for full digest', zh: '扫码查看完整日报' })}</Text>
                <Text style={styles.qrUrl} numberOfLines={2}>
                  {shareUrl}
                </Text>
                <Text style={styles.qrBrand}>Powered by Agentrix · AI Agent Economy</Text>
              </View>
            </View>
          </LinearGradient>
        </ViewShot>

        <Text style={styles.hint}>
          {t({
            en: 'Tap below to share the poster to WeChat / any app.',
            zh: '点下方按钮把海报分享到微信 / 任意 App。',
          })}
        </Text>
      </ScrollView>

      {/* 分享按钮 */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.shareBtn}
          onPress={captureAndShare}
          disabled={capturing}
          activeOpacity={0.85}
        >
          {capturing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.shareBtnText}>
              📤 {t({ en: 'Share Poster', zh: '生成并分享海报' })}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#070b16' },
  scrollBody: { padding: 16, paddingBottom: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#070b16', gap: 12, padding: 24 },
  dim: { color: '#9aa3bd', fontSize: 14 },
  errText: { color: '#fca5a5', fontSize: 14, textAlign: 'center' },
  retryBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: '#6366f1' },
  retryText: { color: '#fff', fontWeight: '700' },

  posterWrap: { borderRadius: 24, overflow: 'hidden' },
  poster: { padding: 22 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  logoBox: { width: 34, height: 34, borderRadius: 9, backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#fff', fontWeight: '900', fontSize: 18 },
  brand: { color: '#c7cdef', fontSize: 16, fontWeight: '700' },
  posterTitle: { color: '#f8fbff', fontSize: 30, fontWeight: '900', marginTop: 10 },
  posterDate: { color: '#818cf8', fontSize: 18, fontWeight: '800', marginTop: 4 },
  summary: { color: '#9aa3bd', fontSize: 13, lineHeight: 20, marginTop: 12 },
  metaRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  metaChip: { color: '#cbd5e1', fontSize: 11, fontWeight: '700', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, overflow: 'hidden' },
  divider: { height: 1, backgroundColor: '#262e4d', marginVertical: 18 },
  section: { marginBottom: 16 },
  sectionTitle: { color: '#f1f5f9', fontSize: 17, fontWeight: '800', marginBottom: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12, marginBottom: 6 },
  itemIndex: { color: '#818cf8', fontWeight: '900', fontSize: 14, width: 16, textAlign: 'center' },
  itemBody: { flex: 1 },
  itemTitle: { color: '#f8fbff', fontSize: 14, fontWeight: '700' },
  itemSub: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  itemBadge: { color: '#a5b4fc', fontSize: 10, fontWeight: '800', backgroundColor: 'rgba(99,102,241,0.18)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  qrRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  qrBox: { backgroundColor: '#fff', padding: 8, borderRadius: 12 },
  qrCopy: { flex: 1 },
  qrTitle: { color: '#f8fbff', fontSize: 14, fontWeight: '800' },
  qrUrl: { color: '#94a3b8', fontSize: 11, marginTop: 4 },
  qrBrand: { color: '#818cf8', fontSize: 11, fontWeight: '700', marginTop: 8 },
  hint: { color: '#64748b', fontSize: 12, textAlign: 'center', marginTop: 16 },

  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#1e293b', backgroundColor: '#0b1020' },
  shareBtn: { backgroundColor: '#6366f1', borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  shareBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});

export default DigestPosterScreen;
