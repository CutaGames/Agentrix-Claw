// 分享海报生成组件 — 使用 ViewShot 截图 + expo-sharing 分享
import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Alert,
  Platform,
} from 'react-native';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import QRCode from 'react-native-qrcode-svg';
import { colors } from '../../theme/colors';

const { width: SCREEN_W } = Dimensions.get('window');
const POSTER_W = SCREEN_W - 48;

interface Props {
  visible: boolean;
  onClose: () => void;
  skillName: string;
  skillPrice?: number;
  skillPriceUnit?: string;
  shareUrl: string;
  description?: string;
  tags?: string[];
}

// 海报主题配色
const THEMES = [
  { name: 'Blue', bg: ['#0B1220', '#1A2744'], accent: '#3B82F6', text: '#E6EDF6' },
  { name: 'Orange', bg: ['#1A0F05', '#2D1A0A'], accent: '#F59E0B', text: '#FEF3C7' },
  { name: 'Green', bg: ['#051210', '#0A2520'], accent: '#10B981', text: '#D1FAE5' },
  { name: 'Purple', bg: ['#120B20', '#1F1338'], accent: '#8B5CF6', text: '#EDE9FE' },
];

export function SharePoster({ visible, onClose, skillName, skillPrice, skillPriceUnit, shareUrl, description, tags }: Props) {
  const viewShotRef = useRef<ViewShot>(null);
  const [saving, setSaving] = useState(false);
  const [themeIdx, setThemeIdx] = useState(0);

  if (!visible) return null;

  const theme = THEMES[themeIdx];

  const handleShare = async () => {
    if (!viewShotRef.current?.capture) return;
    setSaving(true);
    try {
      const uri = await viewShotRef.current.capture();
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'Share Poster',
          UTI: 'public.png',
        });
      } else {
        Alert.alert('Note', 'Sharing not supported on this device. Poster saved.');
      }
    } catch (e: any) {
      if (!e?.message?.includes('cancel')) {
        Alert.alert('Share Failed', e?.message || 'Please try again later');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!viewShotRef.current?.capture) return;
    setSaving(true);
    try {
      const uri = await viewShotRef.current.capture();
      // On mobile, sharing to "Save Image" is the standard way
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png' });
      }
      Alert.alert('Done', 'Poster generated. Choose save from the share menu.');
    } catch (e: any) {
      Alert.alert('Save Failed', e?.message || 'Please try again later');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Theme Selector */}
      <View style={styles.themeRow}>
        <Text style={styles.themeLabel}>Theme:</Text>
        {THEMES.map((t, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.themeChip, { borderColor: t.accent }, themeIdx === i && { backgroundColor: t.accent + '30' }]}
            onPress={() => setThemeIdx(i)}
          >
            <View style={[styles.themeDot, { backgroundColor: t.accent }]} />
            <Text style={[styles.themeText, { color: themeIdx === i ? t.accent : colors.muted }]}>{t.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Poster (captured by ViewShot) */}
      <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1.0 }} style={styles.posterWrapper}>
        <View style={[styles.poster, { backgroundColor: theme.bg[0] }]}>
          {/* Top accent bar */}
          <View style={[styles.accentBar, { backgroundColor: theme.accent }]} />

          {/* Brand */}
          <View style={styles.posterBrand}>
            <Text style={[styles.brandLogo, { color: theme.accent }]}>⚡</Text>
            <Text style={[styles.brandName, { color: theme.text }]}>Agentrix</Text>
          </View>

          {/* Skill Name */}
          <Text style={[styles.posterTitle, { color: theme.text }]} numberOfLines={3}>
            {skillName}
          </Text>

          {/* Description */}
          {description && (
            <Text style={[styles.posterDesc, { color: theme.text + 'AA' }]} numberOfLines={3}>
              {description}
            </Text>
          )}

          {/* Tags */}
          {tags && tags.length > 0 && (
            <View style={styles.posterTags}>
              {tags.slice(0, 4).map((tag, i) => (
                <View key={i} style={[styles.posterTag, { backgroundColor: theme.accent + '20', borderColor: theme.accent + '40' }]}>
                  <Text style={[styles.posterTagText, { color: theme.accent }]}>{tag}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Price */}
          {skillPrice !== undefined && (
            <View style={styles.priceSection}>
              <Text style={[styles.priceLabel, { color: theme.text + '80' }]}>Price</Text>
              <Text style={[styles.priceValue, { color: theme.accent }]}>
                ${skillPrice}{skillPriceUnit ? `/${skillPriceUnit}` : ''}
              </Text>
            </View>
          )}

          {/* Bottom: QR + CTA */}
          <View style={styles.posterBottom}>
            <View style={styles.qrSection}>
              <View style={styles.qrBg}>
                <QRCode value={shareUrl} size={72} backgroundColor="#FFFFFF" color="#000000" />
              </View>
              <Text style={[styles.qrHint, { color: theme.text + '80' }]}>Scan to view</Text>
            </View>
            <View style={styles.ctaSection}>
              <Text style={[styles.ctaText, { color: theme.text }]}>Discover great skills</Text>
              <Text style={[styles.ctaText, { color: theme.text }]}>on Agentrix</Text>
              <View style={[styles.ctaBtn, { backgroundColor: theme.accent }]}>
                <Text style={styles.ctaBtnText}>Try Now →</Text>
              </View>
            </View>
          </View>

          {/* Footer */}
          <Text style={[styles.posterFooter, { color: theme.text + '50' }]}>
            agentrix.top · AI Skill Marketplace
          </Text>
        </View>
      </ViewShot>

      {/* Action Buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity style={[styles.actionBtn, styles.saveBtn]} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveBtnText}>💾 Save</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.shareBtn]} onPress={handleShare} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.shareBtnText}>📤 Share Poster</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Close */}
      <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
        <Text style={styles.closeBtnText}>← Back</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: 8 },
  // Theme
  themeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap', justifyContent: 'center' },
  themeLabel: { color: colors.muted, fontSize: 12, marginRight: 4 },
  themeChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1, gap: 4 },
  themeDot: { width: 10, height: 10, borderRadius: 5 },
  themeText: { fontSize: 11, fontWeight: '600' },
  // Poster
  posterWrapper: { borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  poster: {
    width: POSTER_W,
    padding: 20,
    borderRadius: 16,
  },
  accentBar: { height: 4, borderRadius: 2, marginBottom: 16 },
  posterBrand: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  brandLogo: { fontSize: 20 },
  brandName: { fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  posterTitle: { fontSize: 22, fontWeight: '800', lineHeight: 30, marginBottom: 8 },
  posterDesc: { fontSize: 13, lineHeight: 20, marginBottom: 12 },
  posterTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  posterTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  posterTagText: { fontSize: 11, fontWeight: '600' },
  priceSection: { marginBottom: 16 },
  priceLabel: { fontSize: 11, marginBottom: 2 },
  priceValue: { fontSize: 28, fontWeight: '800' },
  posterBottom: { flexDirection: 'row', alignItems: 'flex-end', gap: 16, marginBottom: 12 },
  qrSection: { alignItems: 'center' },
  qrBg: { backgroundColor: '#fff', borderRadius: 8, padding: 6, marginBottom: 4 },
  qrHint: { fontSize: 10 },
  ctaSection: { flex: 1 },
  ctaText: { fontSize: 15, fontWeight: '700', lineHeight: 22 },
  ctaBtn: { marginTop: 8, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16, alignSelf: 'flex-start' },
  ctaBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  posterFooter: { fontSize: 10, textAlign: 'center', marginTop: 4 },
  // Actions
  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  actionBtn: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24, minWidth: 120, alignItems: 'center' },
  saveBtn: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  saveBtnText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  shareBtn: { backgroundColor: colors.primary },
  shareBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  closeBtn: { padding: 8 },
  closeBtnText: { color: colors.primary, fontSize: 13 },
});
