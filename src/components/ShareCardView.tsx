/**
 * Viral Share Card — generates a shareable image with QR code.
 * Uses react-native-view-shot to capture the card as a PNG,
 * then expo-sharing to show the native share sheet.
 */
import React, { useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, Share,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import ViewShot, { CaptureOptions } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { useI18n } from '../stores/i18nStore';

export interface ShareCardProps {
  shareUrl: string;
  title?: string;
  subtitle?: string;
  /** Emoji / icon to show in header */
  headerEmoji?: string;
  userName?: string;
  categoryLabel?: string;
  priceLabel?: string;
  statsLabel?: string;
  description?: string;
  tags?: string[];
  ctaLabel?: string;
  accentFrom?: string;
  accentTo?: string;
  /** Called when share is initiated */
  onShare?: () => void;
}

export function ShareCardView({
  shareUrl,
  title = 'Agentrix-Claw',
  subtitle = 'Your AI Agent, Powered by OpenClaw',
  headerEmoji = '🦀',
  userName,
  categoryLabel,
  priceLabel,
  statsLabel,
  description,
  tags,
  ctaLabel,
  accentFrom = '#5B8CFF',
  accentTo = '#7C3AED',
  onShare,
}: ShareCardProps) {
  const { t } = useI18n();
  const viewShotRef = useRef<ViewShot>(null);
  const [capturing, setCapturing] = useState(false);
  const [copied, setCopied] = useState(false);
  const visibleTags = (tags ?? []).filter(Boolean).slice(0, 3);
  const resolvedCta = ctaLabel ?? t({ en: 'Scan to view details', zh: '扫码查看详情' });

  const captureAndShare = useCallback(async () => {
    try {
      setCapturing(true);
      onShare?.();

      const canShare = await Sharing.isAvailableAsync();
      if (canShare && viewShotRef.current) {
        const opts: CaptureOptions = { format: 'png', quality: 1, result: 'tmpfile' };
        const uri: string = await (viewShotRef.current as any).capture(opts);
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: t({ en: 'Share Poster', zh: '分享海报' }) });
      } else {
        // Fallback: text share
        await Share.share({ message: `${title}\n${subtitle}\n${shareUrl}`, url: shareUrl });
      }
    } catch (err: any) {
      if (err?.message !== 'User did not share') {
        Alert.alert(t({ en: 'Share failed', zh: '分享失败' }), err?.message ?? t({ en: 'Unable to share', zh: '暂时无法分享' }));
      }
    } finally {
      setCapturing(false);
    }
  }, [onShare, shareUrl, subtitle, t, title]);

  const copyLink = useCallback(async () => {
    await Clipboard.setStringAsync(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareUrl]);

  return (
    <View style={styles.wrapper}>
      {/* The card that will be captured as image */}
      <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1 }} style={styles.card}>
        <LinearGradient
          colors={['#081120', accentFrom, accentTo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cardGradient}
        >
          <View style={styles.topRow}>
            <View style={styles.brandBadge}>
              <Text style={styles.brandBadgeText}>Agentrix</Text>
            </View>
            {categoryLabel ? (
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryBadgeText}>{categoryLabel}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.heroPanel}>
            <View style={styles.heroIconWrap}>
              <Text style={styles.headerEmoji}>{headerEmoji}</Text>
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>
              <Text style={styles.cardSubtitle} numberOfLines={2}>{subtitle}</Text>
              {description ? (
                <Text style={styles.description} numberOfLines={3}>{description}</Text>
              ) : null}
            </View>
          </View>

          {(priceLabel || statsLabel) ? (
            <View style={styles.metricsRow}>
              {priceLabel ? (
                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>{t({ en: 'Price', zh: '价格' })}</Text>
                  <Text style={styles.metricValue}>{priceLabel}</Text>
                </View>
              ) : null}
              {statsLabel ? (
                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>{t({ en: 'Highlights', zh: '亮点' })}</Text>
                  <Text style={styles.metricValue} numberOfLines={2}>{statsLabel}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {visibleTags.length > 0 ? (
            <View style={styles.tagsRow}>
              {visibleTags.map((tag) => (
                <View key={tag} style={styles.tagChip}>
                  <Text style={styles.tagText}>#{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.qrSection}>
            <View style={styles.qrContainer}>
              <QRCode
                value={shareUrl}
                size={132}
                backgroundColor="#ffffff"
                color="#111827"
              />
            </View>
            <View style={styles.qrCopy}>
              <Text style={styles.qrTitle}>{resolvedCta}</Text>
              <Text style={styles.qrSub}>{t({ en: 'Open on mobile, save the poster, or forward to friends.', zh: '手机扫码直达，也可保存海报后转发给好友。' })}</Text>
              <View style={styles.urlBadge}>
                <Text style={styles.urlText} numberOfLines={1}>{shareUrl}</Text>
              </View>
            </View>
          </View>

          {userName ? (
            <Text style={styles.cardUser}>
              {t({ en: 'Shared by', zh: '分享者' })} {userName}
            </Text>
          ) : null}

          <Text style={styles.cardFooter}>agentrix.top • Powered by OpenClaw</Text>
        </LinearGradient>
      </ViewShot>

      {/* Action buttons below the card */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary]}
          onPress={captureAndShare}
          disabled={capturing}
          activeOpacity={0.8}
        >
          {capturing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.btnPrimaryText}>📤 {t({ en: 'Share Poster', zh: '分享海报' })}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary]}
          onPress={copyLink}
          activeOpacity={0.8}
        >
          <Text style={styles.btnSecondaryText}>
            {copied ? `✓ ${t({ en: 'Copied', zh: '已复制' })}` : `🔗 ${t({ en: 'Copy Link', zh: '复制链接' })}`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  card: {
    width: '100%',
    maxWidth: 356,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  cardGradient: { padding: 22, gap: 16 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  brandBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  brandBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  categoryBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
  },
  categoryBadgeText: { color: '#0F172A', fontSize: 11, fontWeight: '800' },
  heroPanel: {
    borderRadius: 24,
    padding: 18,
    backgroundColor: 'rgba(4,10,24,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  heroIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginBottom: 14,
  },
  heroCopy: { gap: 6 },
  headerEmoji: { fontSize: 34 },
  cardTitle: { color: '#f8fbff', fontSize: 26, fontWeight: '900', lineHeight: 32 },
  cardSubtitle: { color: 'rgba(240,246,255,0.84)', fontSize: 13, fontWeight: '700' },
  description: { color: 'rgba(226,232,240,0.92)', fontSize: 13, lineHeight: 20 },
  metricsRow: { flexDirection: 'row', gap: 10 },
  metricCard: {
    flex: 1,
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    gap: 6,
  },
  metricLabel: { color: 'rgba(226,232,240,0.74)', fontSize: 11, fontWeight: '700' },
  metricValue: { color: '#fff', fontSize: 16, fontWeight: '800' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(8,16,32,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  tagText: { color: '#E2E8F0', fontSize: 12, fontWeight: '700' },
  qrSection: {
    flexDirection: 'row',
    gap: 14,
    padding: 16,
    borderRadius: 22,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
  },
  qrContainer: {
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  qrCopy: { flex: 1, gap: 8 },
  qrTitle: { color: '#0F172A', fontSize: 16, fontWeight: '900' },
  qrSub: { color: '#475569', fontSize: 12, lineHeight: 18 },
  urlBadge: {
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  urlText: { color: '#2563EB', fontSize: 11, fontFamily: 'monospace' },
  cardUser: { color: 'rgba(226,232,240,0.86)', fontSize: 13, fontWeight: '700' },
  cardFooter: { color: 'rgba(226,232,240,0.64)', fontSize: 11, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16, width: '100%', maxWidth: 340 },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: '#1a77e0' },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#2a3a52',
  },
  btnSecondaryText: { color: '#00d4ff', fontWeight: '600', fontSize: 15 },
});
