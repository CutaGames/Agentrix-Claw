import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { apiFetch } from '../../services/api';
import { useI18n } from '../../stores/i18nStore';
import type { SocialStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<SocialStackParamList>;

const PRESET_TAGS = ['showcase', 'skill', 'productivity', 'dev', 'ai', 'workflow', 'agent'];

async function createPost(body: { content: string; tags: string[] }) {
  return apiFetch('/social/posts', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function CreatePostScreen() {
  const navigation = useNavigation<Nav>();
  const { t, language } = useI18n();
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState('');

  const { mutate: submit, isPending } = useMutation({
    mutationFn: createPost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      Alert.alert(t({ en: 'Posted!', zh: '发布成功！' }), t({ en: 'Your post is now live in the community.', zh: '你的帖子已在社区中公开。' }));
      navigation.goBack();
    },
    onError: (err: any) => {
      Alert.alert(t({ en: 'Error', zh: '错误' }), err?.message || t({ en: 'Failed to post. Please try again.', zh: '发布失败，请重试。' }));
    },
  });

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((tg) => tg !== tag) : [...prev, tag]
    );
  };

  const addCustomTag = () => {
    const trimmed = customTag.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (trimmed && !selectedTags.includes(trimmed)) {
      setSelectedTags((prev) => [...prev, trimmed]);
    }
    setCustomTag('');
  };

  const handlePost = () => {
    if (!content.trim()) {
      Alert.alert(t({ en: 'Empty Post', zh: '内容为空' }), t({ en: 'Please write something before posting.', zh: '请先写内容再发布。' }));
      return;
    }
    submit({ content: content.trim(), tags: selectedTags });
  };

  return (
    <KeyboardAvancingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.root}>
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>{t({ en: 'Cancel', zh: '取消' })}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t({ en: 'New Post', zh: '发新帖' })}</Text>
          <TouchableOpacity
            onPress={handlePost}
            disabled={isPending || !content.trim()}
            style={[styles.postBtn, (!content.trim() || isPending) && styles.postBtnDisabled]}
          >
            {isPending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.postBtnText}>{t({ en: 'Post', zh: '发布' })}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Content Input */}
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>{t({ en: "What are you building?", zh: '你在开发什么？' })}</Text>
          <TextInput
            style={styles.input}
            placeholder={t({ en: 'Share your agent workflow, skill, or discovery with the community...', zh: '与社区分享你的 agent 工作流、技能或发现...' })}
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={6}
            maxLength={2000}
            value={content}
            onChangeText={setContent}
            autoFocus
          />
          <Text style={styles.charCount}>{content.length} / 2000</Text>
        </View>

        {/* Tags */}
        <View style={styles.tagsSection}>
          <Text style={styles.inputLabel}>{t({ en: 'Tags (optional)', zh: '标签（可选）' })}</Text>
          <View style={styles.tagGrid}>
            {PRESET_TAGS.map((tag) => (
              <TouchableOpacity
                key={tag}
                style={[styles.tagChip, selectedTags.includes(tag) && styles.tagChipActive]}
                onPress={() => toggleTag(tag)}
              >
                <Text style={[styles.tagChipText, selectedTags.includes(tag) && styles.tagChipTextActive]}>
                  #{tag}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Custom tag input */}
          <View style={styles.customTagRow}>
            <TextInput
              style={styles.customTagInput}
              placeholder={t({ en: 'Add custom tag...', zh: '添加自定义标签...' })}
              placeholderTextColor={colors.textMuted}
              value={customTag}
              onChangeText={setCustomTag}
              onSubmitEditing={addCustomTag}
              returnKeyType="done"
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={addCustomTag} style={styles.addTagBtn}>
              <Text style={styles.addTagText}>{t({ en: 'Add', zh: '添加' })}</Text>
            </TouchableOpacity>
          </View>

          {/* Selected custom tags */}
          {selectedTags.filter((t) => !PRESET_TAGS.includes(t)).length > 0 && (
            <View style={styles.selectedCustomTags}>
              {selectedTags
                .filter((t) => !PRESET_TAGS.includes(t))
                .map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={styles.tagChipActive}
                    onPress={() => toggleTag(t)}
                  >
                    <Text style={styles.tagChipTextActive}>#{t} ✕</Text>
                  </TouchableOpacity>
                ))}
            </View>
          )}
        </View>

        {/* Tips */}
        <View style={styles.tips}>
          <Text style={styles.tipsTitle}>💡 {t({ en: 'Post Ideas', zh: '发帖灵感' })}</Text>
          <Text style={styles.tipsText}>• {t({ en: 'Share a workflow or skill you built', zh: '分享你制作的工作流或技能' })}</Text>
          <Text style={styles.tipsText}>• {t({ en: 'Show off your agent running live', zh: '展示你的 agent 实时运行效果' })}</Text>
          <Text style={styles.tipsText}>• {t({ en: 'Ask for help with an automation', zh: '寻求自动化方面的帮助' })}</Text>
          <Text style={styles.tipsText}>• {t({ en: 'Celebrate a milestone 🎉', zh: '庆祝里程碑 🎉' })}</Text>
        </View>
      </ScrollView>
    </KeyboardAvancingView>
  );
}

// Fix typo in component tag
const KeyboardAvancingView = KeyboardAvoidingView;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  scroll: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bgSecondary,
  },
  cancelBtn: { paddingVertical: 4, paddingHorizontal: 2 },
  cancelText: { fontSize: 15, color: colors.textMuted },
  title: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  postBtn: {
    backgroundColor: colors.accent,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 7,
    minWidth: 60,
    alignItems: 'center',
  },
  postBtnDisabled: { opacity: 0.45 },
  postBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  inputWrapper: { padding: 16, gap: 8 },
  inputLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    fontSize: 15,
    color: colors.textPrimary,
    minHeight: 140,
    textAlignVertical: 'top',
  },
  charCount: { fontSize: 11, color: colors.textMuted, textAlign: 'right' },
  tagsSection: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagChip: {
    backgroundColor: colors.bgCard,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagChipActive: {
    backgroundColor: colors.accent + '22',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  tagChipText: { fontSize: 13, color: colors.textMuted },
  tagChipTextActive: { fontSize: 13, color: colors.accent, fontWeight: '600' },
  customTagRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  customTagInput: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.textPrimary,
  },
  addTagBtn: {
    backgroundColor: colors.bgCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addTagText: { fontSize: 13, color: colors.accent, fontWeight: '600' },
  selectedCustomTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tips: {
    margin: 16,
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 14,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tipsTitle: { fontSize: 13, color: colors.textPrimary, fontWeight: '700', marginBottom: 4 },
  tipsText: { fontSize: 13, color: colors.textMuted, lineHeight: 20 },
});
