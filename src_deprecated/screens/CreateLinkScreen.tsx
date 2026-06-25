// 创建推广链接页
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Share,
  ActivityIndicator,
} from 'react-native';
import { colors } from '../theme/colors';
import { referralApi } from '../services/referral.api';

interface Props {
  route: { params: { skillId: string; skillName: string; skillPrice: number; skillPriceUnit: string } };
  navigation: any;
}

export function CreateLinkScreen({ route, navigation }: Props) {
  const { skillId, skillName, skillPrice, skillPriceUnit } = route.params;
  const [link, setLink] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const commissionPerCall = skillPrice * 0.01;

  const handleCreate = async () => {
    setCreating(true);
    try {
      const result = await referralApi.createLink({
        name: skillName,
        targetType: 'skill',
        targetId: skillId,
      });
      setLink(result.shortUrl);
    } catch (e) {
      Alert.alert('创建失败', '请稍后重试');
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = () => {
    if (link) {
      Alert.alert('已复制', link);
    }
  };

  const handleShare = async () => {
    if (!link) return;
    try {
      const text = referralApi.generateShareText({
        name: skillName,
        price: skillPrice,
        priceUnit: skillPriceUnit,
        shortUrl: link,
      });
      await Share.share({ message: text });
    } catch {
      // User cancelled
    }
  };

  return (
    <View style={styles.container}>
      {/* 技能信息 */}
      <View style={styles.skillInfo}>
        <Text style={styles.skillName}>{skillName}</Text>
        <Text style={styles.skillPrice}>
          ${skillPrice < 1 ? skillPrice.toFixed(4) : skillPrice.toFixed(2)}/{skillPriceUnit}
        </Text>
      </View>

      {/* 佣金预估 */}
      <View style={styles.commissionCard}>
        <Text style={styles.commissionLabel}>📢 推广此技能的预估佣金</Text>
        <Text style={styles.commissionValue}>${commissionPerCall.toFixed(4)}/{skillPriceUnit}</Text>
        <Text style={styles.commissionNote}>
          每次通过你的链接产生的购买，你将获得 1% 佣金
        </Text>
      </View>

      {!link ? (
        /* 生成链接按钮 */
        <TouchableOpacity
          style={[styles.createBtn, creating && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={creating}
        >
          {creating ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.createBtnText}>🔗 生成推广链接</Text>
          )}
        </TouchableOpacity>
      ) : (
        /* 链接已生成 */
        <View style={styles.linkResult}>
          <Text style={styles.linkResultTitle}>✅ 推广链接已生成</Text>
          <View style={styles.linkBox}>
            <Text style={styles.linkUrl} selectable>{link}</Text>
          </View>

          <View style={styles.linkActions}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleCopy}>
              <Text style={styles.actionIcon}>📋</Text>
              <Text style={styles.actionText}>复制链接</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={handleShare}>
              <Text style={styles.actionIcon}>📱</Text>
              <Text style={[styles.actionText, styles.actionTextPrimary]}>分享</Text>
            </TouchableOpacity>
          </View>

          {/* 分享文案预览 */}
          <View style={styles.previewCard}>
            <Text style={styles.previewLabel}>预览推广文案：</Text>
            <Text style={styles.previewText}>
              {referralApi.generateShareText({
                name: skillName,
                price: skillPrice,
                priceUnit: skillPriceUnit,
                shortUrl: link,
              })}
            </Text>
          </View>
        </View>
      )}

      {/* 底部提示 */}
      <View style={styles.tips}>
        <Text style={styles.tipsTitle}>💡 推广技巧</Text>
        <Text style={styles.tipsText}>• 分享到技术社群效果更好</Text>
        <Text style={styles.tipsText}>• 附上你的使用体验更有说服力</Text>
        <Text style={styles.tipsText}>• 佣金 T+3 自动结算到账</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 16,
  },
  skillInfo: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skillName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  skillPrice: {
    color: colors.success,
    fontSize: 15,
    fontWeight: '600',
  },
  commissionCard: {
    backgroundColor: '#F97316' + '10',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#F97316' + '25',
  },
  commissionLabel: {
    color: '#FB923C',
    fontSize: 14,
    marginBottom: 6,
  },
  commissionValue: {
    color: '#FB923C',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
  },
  commissionNote: {
    color: colors.muted,
    fontSize: 12,
  },
  createBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  createBtnDisabled: {
    opacity: 0.6,
  },
  createBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  linkResult: {
    marginBottom: 20,
  },
  linkResultTitle: {
    color: colors.success,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  linkBox: {
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  linkUrl: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '500',
  },
  linkActions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  actionBtnPrimary: {
    backgroundColor: colors.primary + '15',
    borderColor: colors.primary + '30',
  },
  actionIcon: {
    fontSize: 16,
  },
  actionText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '500',
  },
  actionTextPrimary: {
    color: colors.primary,
  },
  previewCard: {
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewLabel: {
    color: colors.muted,
    fontSize: 12,
    marginBottom: 6,
  },
  previewText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 20,
  },
  tips: {
    marginTop: 'auto',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tipsTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  tipsText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 22,
  },
});
