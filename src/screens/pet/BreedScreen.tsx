/**
 * BreedScreen — Mobile · V4 §3.4
 *
 *   POST /v1/pet/breed
 *
 * Picks two parent skins and submits a breed task. Mirrors web /console/pet/breed
 * and desktop PetCreatorPanel "breed" tab.
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
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  type PetSkinSummary,
  type PetBreedResult,
  listSkins,
  breedPet,
} from '../../services/mobilePetSdk';
import { colors } from '../../theme/colors';

export function BreedScreen() {
  const navigation = useNavigation<any>();
  const [skins, setSkins] = useState<PetSkinSummary[]>([]);
  const [parentA, setParentA] = useState<string>('');
  const [parentB, setParentB] = useState<string>('');
  const [prompt, setPrompt] = useState<string>('');
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

  const onSubmit = useCallback(async () => {
    if (!parentA || !parentB) {
      setError('请选择两只父系皮肤');
      return;
    }
    if (parentA === parentB) {
      setError('两只父系不能相同');
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
      });
      setResult(res);
    } catch (err: any) {
      const msg = err?.message || String(err);
      setError(msg);
      Alert.alert('提交失败', msg);
    } finally {
      setSubmitting(false);
    }
  }, [parentA, parentB, prompt]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      testID="pet-breed-screen"
    >
      <Text style={styles.subtitle}>
        选择两只父系皮肤，融合它们的视觉特征生成新宠物。结果将作为新皮肤进入你的衣柜。
      </Text>

      {error && (
        <View style={styles.errorBox} testID="pet-breed-error">
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {loadingSkins ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
      ) : (
        <View style={styles.card}>
          <Text style={styles.label}>父系 A</Text>
          <View style={styles.parentList}>
            {skins.map((s) => (
              <Pressable
                key={`A-${s.id}`}
                onPress={() => setParentA(s.id)}
                style={[styles.parentItem, parentA === s.id && styles.parentItemActive]}
                testID={`breed-parent-a-${s.id}`}
              >
                <Text style={styles.parentText} numberOfLines={1}>
                  {s.display_name}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.label, { marginTop: 16 }]}>父系 B</Text>
          <View style={styles.parentList}>
            {skins.map((s) => (
              <Pressable
                key={`B-${s.id}`}
                onPress={() => setParentB(s.id)}
                style={[styles.parentItem, parentB === s.id && styles.parentItemActive]}
                testID={`breed-parent-b-${s.id}`}
              >
                <Text style={styles.parentText} numberOfLines={1}>
                  {s.display_name}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.label, { marginTop: 16 }]}>附加提示词（可选）</Text>
          <TextInput
            value={prompt}
            onChangeText={setPrompt}
            placeholder="例如：偏向 A 的颜色 + B 的轮廓"
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={3}
            style={styles.textArea}
            testID="breed-prompt"
          />

          <Pressable
            disabled={submitting}
            onPress={onSubmit}
            style={[styles.submitBtn, submitting && styles.submitBtnBusy]}
            testID="breed-submit"
          >
            <Text style={styles.submitBtnText}>{submitting ? '提交中…' : '🧬 开始繁殖'}</Text>
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
              <Text style={styles.resultTitle}>✓ 任务已提交</Text>
              {result.taskId && <Text style={styles.resultMeta}>Task ID: {result.taskId}</Text>}
              {result.message && <Text style={styles.resultMsg}>{result.message}</Text>}
              <Pressable
                onPress={() => navigation.navigate('Wardrobe')}
                style={[styles.submitBtn, { marginTop: 12 }]}
              >
                <Text style={styles.submitBtnText}>回到衣柜</Text>
              </Pressable>
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  card: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
  },
  label: { color: colors.textSecondary, fontSize: 13, marginBottom: 8 },
  parentList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  parentItem: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    maxWidth: '48%',
  },
  parentItemActive: {
    borderColor: 'rgba(0,212,255,0.55)',
    backgroundColor: 'rgba(0,212,255,0.12)',
  },
  parentText: { color: colors.text, fontSize: 12, fontWeight: '500' },
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
});

export default BreedScreen;
