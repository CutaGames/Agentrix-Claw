/**
 * WardrobeScreen — Mobile · V4 §3.2
 *
 * Shows owned skin grid + activate, with quick links to Marketplace / Breed / SoulPicker.
 * Mirrors desktop WardrobePanel and web /console/pet/wardrobe.
 *
 * 后端契约：
 *   GET  /v1/pet/skins
 *   GET  /v1/pet/skins/active
 *   POST /v1/pet/skin/activate
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  type PetSkinSummary,
  listSkins,
  getActiveSkinId,
  activateSkin,
} from '../../services/mobilePetSdk';
import { colors } from '../../theme/colors';
import { themedStyles } from '../../theme/useTheme';

export function WardrobeScreen() {
  const navigation = useNavigation<any>();
  const [skins, setSkins] = useState<PetSkinSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, aid] = await Promise.all([listSkins(), getActiveSkinId()]);
      setSkins(list);
      setActiveId(aid);
    } catch (err: any) {
      const msg = err?.message || String(err);
      setError(msg);
      setSkins([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onActivate = useCallback(
    async (skinId: string) => {
      if (switchingId || activeId === skinId) return;
      setSwitchingId(skinId);
      setError(null);
      try {
        await activateSkin(skinId);
        setActiveId(skinId);
      } catch (err: any) {
        const msg = err?.message || String(err);
        setError(msg);
        Alert.alert('切换失败', msg);
      } finally {
        setSwitchingId(null);
      }
    },
    [switchingId, activeId],
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      testID="pet-wardrobe-screen"
    >
      <Text style={styles.subtitle}>
        灵魂决定行为，皮肤决定外观 —— 同一只灵魂可以穿不同皮肤。
      </Text>

      <View style={styles.ctaRow}>
        <Pressable
          style={styles.ctaBtn}
          onPress={() => navigation.navigate('PetSkinMarketplace')}
          testID="wardrobe-link-marketplace"
        >
          <Text style={styles.ctaText}>🛒 皮肤市场</Text>
        </Pressable>
        <Pressable
          style={styles.ctaBtn}
          onPress={() => navigation.navigate('PetBreed')}
          testID="wardrobe-link-breed"
        >
          <Text style={styles.ctaText}>🧬 双图繁殖</Text>
        </Pressable>
      </View>

      {error && (
        <View style={styles.errorBox} testID="pet-wardrobe-error">
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} />
      ) : skins.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>还没有任何皮肤。去市场逛逛，或用宠物创造器生成一只。</Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {skins.map((skin) => {
            const isActive = activeId === skin.id;
            const isBusy = switchingId === skin.id;
            return (
              <View
                key={skin.id}
                style={[styles.card, isActive && styles.cardActive]}
                testID={`wardrobe-skin-${skin.id}`}
              >
                <View style={styles.thumbBox}>
                  {skin.thumbnail_url ? (
                    <Image
                      source={{ uri: skin.thumbnail_url }}
                      style={styles.thumbImg}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={styles.thumbEmoji}>{skin.format === 'vrm' ? '🧸' : '🐾'}</Text>
                  )}
                </View>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {skin.display_name}
                </Text>
                <Text style={styles.cardMeta}>
                  {skin.format.toUpperCase()} · {skin.source}
                </Text>
                <Pressable
                  disabled={isActive || isBusy}
                  onPress={() => onActivate(skin.id)}
                  style={[
                    styles.activateBtn,
                    isActive && styles.activateBtnActive,
                  ]}
                  testID={`wardrobe-activate-${skin.id}`}
                >
                  <Text style={styles.activateBtnText}>
                    {isActive ? '✓ 当前皮肤' : isBusy ? '切换中…' : '装备这只'}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 48 },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginBottom: 16, lineHeight: 18 },
  ctaRow: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  ctaBtn: {
    backgroundColor: 'rgba(0,212,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,212,255,0.35)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  ctaText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  errorBox: {
    backgroundColor: 'rgba(127,29,29,0.28)',
    borderColor: 'rgba(239,68,68,0.35)',
    borderWidth: 1,
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  errorText: { color: '#fecaca', fontSize: 13 },
  emptyBox: {
    backgroundColor: colors.cardBackground,
    padding: 32,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyText: { color: colors.textMuted, textAlign: 'center', fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  card: {
    width: '48%',
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  cardActive: {
    borderColor: 'rgba(0,212,255,0.55)',
    backgroundColor: 'rgba(0,212,255,0.06)',
  },
  thumbBox: {
    aspectRatio: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 8,
  },
  thumbImg: { width: '100%', height: '100%' },
  thumbEmoji: { fontSize: 56 },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  cardMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2, marginBottom: 8 },
  activateBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  activateBtnActive: { opacity: 0.55 },
  activateBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
}));

export default WardrobeScreen;
