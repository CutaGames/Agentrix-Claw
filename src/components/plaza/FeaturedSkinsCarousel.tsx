/**
 * FeaturedSkinsCarousel — Sprint 3 Task 3.2
 *
 * Horizontal snap carousel showing featured skins from
 * `GET /api/v1/market/skins?sort=featured&limit=6`.
 *
 * Placed at the top of PlazaScreen's Pets segment.
 */
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Dimensions,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { fetchMarketSkins, SkinListItem, SkinClan } from '../../services/marketSkins.api';
import type { PlazaStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<PlazaStackParamList, 'PlazaRoot'>;

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_W * 0.6;
const CARD_GAP = 12;

const CLAN_GRADIENTS: Record<SkinClan, [string, string]> = {
  A: ['#FF6B6B', '#FF8E8E'],
  B: ['#4ECDC4', '#6EE7DE'],
  C: ['#45B7D1', '#67D4EC'],
  D: ['#96CEB4', '#B8E6D0'],
  E: ['#FFEAA7', '#FFF3C4'],
  F: ['#DDA0DD', '#EBC4EB'],
};

export function FeaturedSkinsCarousel() {
  const { t } = useI18n();
  const navigation = useNavigation<Nav>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['featured-skins'],
    queryFn: () => fetchMarketSkins({ sort: 'featured', limit: 6 }),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={colors.accent} size="small" />
      </View>
    );
  }

  if (isError || !data || data.items.length === 0) {
    return null;
  }

  const handlePress = (skin: SkinListItem) => {
    // Navigate to skin auction screen (PetsSkins)
    navigation.navigate('PetsSkins');
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>
          🔥 {t({ en: 'Featured Skins', zh: '精选皮肤' })}
        </Text>
        <TouchableOpacity onPress={() => navigation.navigate('PetsSkins')}>
          <Text style={styles.seeAll}>{t({ en: 'See all', zh: '查看全部' })} ›</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + CARD_GAP}
        snapToAlignment="start"
        contentContainerStyle={styles.scrollContent}
      >
        {data.items.map((skin) => (
          <TouchableOpacity
            key={skin.id}
            style={styles.card}
            activeOpacity={0.8}
            onPress={() => handlePress(skin)}
          >
            <View
              style={[
                styles.thumbWrap,
                { backgroundColor: CLAN_GRADIENTS[skin.clan][0] + '30' },
              ]}
            >
              {skin.thumbnailUrl ? (
                <Image
                  source={{ uri: skin.thumbnailUrl }}
                  style={styles.thumb}
                  resizeMode="cover"
                />
              ) : (
                <View
                  style={[
                    styles.gradientPlaceholder,
                    { backgroundColor: CLAN_GRADIENTS[skin.clan][0] },
                  ]}
                >
                  <Text style={styles.placeholderEmoji}>🎨</Text>
                </View>
              )}
              {/* Featured badge */}
              <View style={styles.featuredBadge}>
                <Text style={styles.featuredBadgeText}>
                  🔥 {t({ en: 'Featured', zh: '精选' })}
                </Text>
              </View>
              {/* Clan badge */}
              <View
                style={[
                  styles.clanBadge,
                  { backgroundColor: CLAN_GRADIENTS[skin.clan][0] },
                ]}
              >
                <Text style={styles.clanBadgeText}>{skin.clan}</Text>
              </View>
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardName} numberOfLines={1}>
                {skin.displayName}
              </Text>
              <Text style={styles.cardPrice}>
                {skin.priceUsd != null && skin.priceUsd > 0
                  ? `$${skin.priceUsd.toFixed(2)}`
                  : t({ en: 'Free', zh: '免费' })}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  loadingWrap: { height: 60, justifyContent: 'center', alignItems: 'center' },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  seeAll: { fontSize: 12, fontWeight: '600', color: colors.accent },
  scrollContent: { paddingRight: 16, gap: CARD_GAP },
  card: {
    width: CARD_WIDTH,
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumbWrap: {
    width: '100%',
    height: 120,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: { width: '100%', height: '100%' },
  gradientPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.15,
  },
  placeholderEmoji: { fontSize: 40, opacity: 0.8 },
  featuredBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(239,68,68,0.9)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  featuredBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  clanBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clanBadgeText: { fontSize: 10, fontWeight: '900', color: '#fff' },
  cardBody: { padding: 10, gap: 4 },
  cardName: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  cardPrice: { fontSize: 12, fontWeight: '600', color: colors.accent },
});
