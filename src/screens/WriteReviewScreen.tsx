// 写评价页
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { colors } from '../theme/colors';
import { marketplaceApi } from '../services/marketplace.api';

interface Props {
  route: { params: { skillId: string } };
  navigation: any;
}

export function WriteReviewScreen({ route, navigation }: Props) {
  const { skillId } = route.params;
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) {
      Alert.alert('请选择评分');
      return;
    }
    if (comment.trim().length < 5) {
      Alert.alert('请输入至少 5 个字的评价');
      return;
    }

    setSubmitting(true);
    try {
      await marketplaceApi.submitReview(skillId, { rating, comment: comment.trim() });
      Alert.alert('评价成功', '感谢你的评价！', [
        { text: '好的', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('提交失败', '请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* 评分选择 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>评分</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map(star => (
              <TouchableOpacity
                key={star}
                onPress={() => setRating(star)}
                style={styles.starBtn}
              >
                <Text style={[styles.starText, star <= rating && styles.starTextActive]}>
                  {star <= rating ? '⭐' : '☆'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.ratingHint}>
            {rating === 0 ? '点击星星评分' :
             rating <= 2 ? '不太满意' :
             rating <= 3 ? '一般' :
             rating <= 4 ? '不错' : '非常满意'}
          </Text>
        </View>

        {/* 评价内容 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>评价内容</Text>
          <TextInput
            style={styles.textInput}
            placeholder="分享你的使用体验..."
            placeholderTextColor={colors.muted}
            value={comment}
            onChangeText={setComment}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            maxLength={500}
          />
          <Text style={styles.charCount}>{comment.length}/500</Text>
        </View>

        {/* 提交按钮 */}
        <TouchableOpacity
          style={[styles.submitBtn, (rating === 0 || submitting) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={rating === 0 || submitting}
        >
          <Text style={styles.submitBtnText}>
            {submitting ? '提交中...' : '提交评价'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    paddingVertical: 8,
  },
  starBtn: {
    padding: 8,
  },
  starText: {
    fontSize: 36,
    color: colors.muted,
  },
  starTextActive: {
    color: '#FBBF24',
  },
  ratingHint: {
    color: colors.muted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  textInput: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 140,
    borderWidth: 1,
    borderColor: colors.border,
  },
  charCount: {
    color: colors.muted,
    fontSize: 12,
    textAlign: 'right',
    marginTop: 6,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
