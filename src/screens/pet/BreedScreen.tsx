/**
 * BreedScreen — Mobile · V4 §4.2 (Sprint F enhanced)
 *
 *   POST /v1/pet/breed
 *
 * Picks two parent skins with thumbnail previews, A/B bias slider,
 * and submits a breed task. Mirrors web /console/pet/breed and
 * desktop PetCreatorPanel "breed" tab.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  type PetSkinSummary,
  type PetBreedResult,
  listSkins,
  breedPet,
} from '../../services/mobilePetSdk';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { themedStyles } from '../../theme/useTheme';

const { width: SCREEN_W } = Dimensions.get('window');
const PARENT_CARD_W = (SCREEN_W - 48 - 12) / 2;

export function BreedScreen() {
  const navigation = useNavigation<any>();
  const { t } = useI18n();
  const [skins, setSkins] = useState<PetSkinSummary[]>([]);
  const [parentA, setParentA] = useState<string>('');
  const [parentB, setParentB] = useState<string>('');
  const [prompt, setPrompt] = useState<string>('');
  const [bias, setBias] = useState<number>(50); // 0=all A, 100=all B
  const [loadingSkins, setLoadingSkins] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PetBreedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listSkins();
        if (!cancelled) setSkins(list);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || String(err));
      } finally {
        if (!cancelled) setLoadingSkins(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const skinA = skins.find((s) => s.id === parentA);
  const skinB = skins.find((s) => s.id === parentB);

  const onSubmit = useCallback(async () => {
    if (!parentA || !parentB) {
      setError(t({ en: 'Please select two parent skins', zh: '请选择两只父系皮肤' }));
      return;
    }
    if (parentA === parentB) {
      setError(t({ en: 'Parents must be different', zh: '两只父系不能相同' }));
      return;
    }
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await breedPet({
        parentSkinIdA: parentA,
        parentSkinIdB: parentB,
        prompt: prompt.trim() || undefined,
        biasTowardA: (100 - bias) / 100, // 0-1 where 1 = fully A
      });
      setResult(res);
    } catch (err: any) {
      const msg = err?.message || String(err);
      setError(msg);
      Alert.alert(t({ en: 'Submit failed', zh: '提交失败' }), msg);
    } finally {
      setSubmitting(false);
    }
  }, [parentA, parentB, prompt, bias, t]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      testID="pet-breed-screen"
    >
      <Text style={styles.subtitle}>
        {t({
          en: 'Select two parent skins and blend their visual traits into a new pet. The result becomes a new skin in your wardrobe.',
          zh: '选择两只父系皮肤，融合它们的视觉特征生成新宠物。结果将作为新皮肤进入你的衣柜。',
        })}
      </Text>

      {error && (
        <View style={styles.errorBox} testID="pet-breed-error">
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {loadingSkins ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
      ) : skins.length < 2 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>
            {t({
              en: 'You need at least 2 skins to breed. Create or buy more skins first.',
              zh: '至少需要 2 个皮肤才能繁殖。先去创建或购买更多皮肤。',
            })}
          </Text>
          <Pressable
            style={styles.submitBtn}
            onPress={() =>
              navigation.navigate('Main', {
                screen: 'World',
                params: { screen: 'PetCreator' },
              })
            }
          >
            <Text style={styles.submitBtnText}>✨ {t({ en: 'Create Pet', zh: '创建宠物' })}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          {/* Parent selection with thumbnails */}
          <Text style={styles.label}>
            {t({ en: 'Parent A', zh: '父系 A' })}
            {skinA ? ` — ${skinA.display_name}` : ''}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.parentScroll}>
            {skins.map((s) => (
              <Pressable
                key={`A-${s.id}`}
                onPress={() => setParentA(s.id)}
                style={[styles.parentCard, parentA === s.id && styles.parentCardActive]}
                testID={`breed-parent-a-${s.id}`}
              >
                <View style={styles.parentThumb}>
                  {s.thumbnail_url ? (
                    <Image source={{ uri: s.thumbnail_url }} style={styles.parentImg} resizeMode="cover" />
                  ) : (
                    <Text style={styles.parentEmoji}>{s.format === 'vrm' ? '🧸' : '🐾'}</Text>
                  )}
                </View>
                <Text style={styles.parentName} numberOfLines={1}>{s.display_name}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={[styles.label, { marginTop: 16 }]}>
            {t({ en: 'Parent B', zh: '父系 B' })}
            {skinB ? ` — ${skinB.display_name}` : ''}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.parentScroll}>
            {skins.map((s) => (
              <Pressable
                key={`B-${s.id}`}
                onPress={() => setParentB(s.id)}
                style={[styles.parentCard, parentB === s.id && styles.parentCardActive]}
                testID={`breed-parent-b-${s.id}`}
              >
                <View style={styles.parentThumb}>
                  {s.thumbnail_url ? (
                    <Image source={{ uri: s.thumbnail_url }} style={styles.parentImg} resizeMode="cover" />
                  ) : (
                    <Text style={styles.parentEmoji}>{s.format === 'vrm' ? '🧸' : '🐾'}</Text>
                  )}
                </View>
                <Text style={styles.parentName} numberOfLines={1}>{s.display_name}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* A/B Bias Slider */}
          <Text style={[styles.label, { marginTop: 20 }]}>
            {t({ en: 'Appearance Bias', zh: '外观倾向' })}
          </Text>
          <View style={styles.biasRow}>
            <Text style={styles.biasLabel}>A</Text>
            <View style={styles.biasTrack}>
              <Pressable
                style={styles.biasTrackTouchable}
                onPress={(e) => {
                  const x = (e.nativeEvent as any).locationX ?? 0;
                  const trackW = SCREEN_W - 48 - 60; // approximate
                  const pct = Math.max(0, Math.min(100, Math.round((x / trackW) * 100)));
                  setBias(pct);
                }}
              >
                <View style={styles.biasTrackBg}>
                  <View style={[styles.biasFill, { width: `${bias}%` }]} />
                </View>
              </Pressable>
            </View>
            <Text style={styles.biasLabel}>B</Text>
          </View>
          <Text style={styles.biasHint}>
            {bias <= 30
              ? t({ en: 'Mostly A appearance', zh: '偏向 A 的外观' })
              : bias >= 70
                ? t({ en: 'Mostly B appearance', zh: '偏向 B 的外观' })
                : t({ en: 'Balanced blend', zh: '均衡融合' })}
          </Text>

          {/* Prompt */}
          <Text style={[styles.label, { marginTop: 16 }]}>
            {t({ en: 'Extra prompt (optional)', zh: '附加提示词（可选）' })}
          </Text>
          <TextInput
            value={prompt}
            onChangeText={setPrompt}
            placeholder={t({ en: "e.g. A's color + B's silhouette", zh: '例如：偏向 A 的颜色 + B 的轮廓' })}
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={3}
            style={styles.textArea}
            testID="breed-prompt"
          />

          <Pressable
            disabled={submitting || !parentA || !parentB}
            onPress={onSubmit}
            style={[styles.submitBtn, (submitting || !parentA || !parentB) && styles.submitBtnBusy]}
            testID="breed-submit"
          >
            <Text style={styles.submitBtnText}>
              {submitting
                ? t({ en: 'Submitting…', zh: '提交中…' })
                : t({ en: '🧬 Start Breeding', zh: '🧬 开始繁殖' })}
            </Text>
          </Pressable>
        </View>
      )}

      {result && (
        <View
          style={[
            styles.card,
            { marginTop: 16, borderColor: result.error ? 'rgba(239,68,68,0.35)' : 'rgba(0,212,255,0.35)' },
          ]}
          testID="pet-breed-result"
        >
          {result.error ? (
            <Text style={styles.errorText}>{result.error}</Text>
          ) : (
            <>
              <Text style={styles.resultTitle}>✓ {t({ en: 'Task submitted', zh: '任务已提交' })}</Text>
              {result.taskId && <Text style={styles.resultMeta}>Task ID: {result.taskId}</Text>}
              {result.message && <Text style={styles.resultMsg}>{result.message}</Text>}
              <Pressable
                onPress={() => navigation.navigate('PetWardrobe')}
                style={[styles.submitBtn, { marginTop: 12 }]}
              >
                <Text style={styles.submitBtnText}>{t({ en: 'Back to Wardrobe', zh: '回到衣柜' })}</Text>
              </Pressable>
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 48 },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginBottom: 16, lineHeight: 18 },
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
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyText: { color: colors.textMuted, textAlign: 'center', fontSize: 13, marginBottom: 16 },
  card: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
  },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 8 },
  // Parent selection with thumbnails
  parentScroll: { marginBottom: 4 },
  parentCard: {
    width: 100,
    marginRight: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    overflow: 'hidden',
  },
  parentCardActive: {
    borderColor: 'rgba(0,212,255,0.55)',
    backgroundColor: 'rgba(0,212,255,0.12)',
  },
  parentThumb: {
    width: '100%',
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  parentImg: { width: '100%', height: '100%' },
  parentEmoji: { fontSize: 32 },
  parentName: { color: colors.text, fontSize: 11, fontWeight: '500', padding: 6, textAlign: 'center' },
  // Bias slider
  biasRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  biasLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700', width: 16, textAlign: 'center' },
  biasTrack: { flex: 1 },
  biasTrackTouchable: { paddingVertical: 8 },
  biasTrackBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  biasFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 4,
  },
  biasHint: { color: colors.textMuted, fontSize: 11, marginTop: 4, textAlign: 'center' },
  // Text area
  textArea: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    color: colors.text,
    fontSize: 13,
    textAlignVertical: 'top',
    minHeight: 64,
  },
  submitBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 14,
  },
  submitBtnBusy: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  resultTitle: { color: colors.text, fontSize: 14, fontWeight: '600', marginBottom: 6 },
  resultMeta: { color: colors.textMuted, fontSize: 12 },
  resultMsg: { color: colors.textSecondary, fontSize: 12, marginTop: 6 },
}));

export default BreedScreen;
