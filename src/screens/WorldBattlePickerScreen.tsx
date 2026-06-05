/**
 * WorldBattlePickerScreen — Sprint P-8 P2 (2026-05-22).
 *
 * Lets the user choose two world assets (challenger + defender) from
 * their inventory and launch a battle. Routes into
 * `WorldBattleArena` with the chosen IDs as params, which triggers the
 * real `createBattle` backend call (vs the deterministic mock used
 * when the arena is opened without IDs).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  listWorldAssets,
  type WorldAssetSummary,
} from '../services/worldEngineApi';

type Slot = 'challenger' | 'defender';

export default function WorldBattlePickerScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const ruleSetShareCode: string | undefined = route.params?.ruleSetShareCode;
  const ruleSetName: string | undefined = route.params?.ruleSetName;
  const [assets, setAssets] = useState<WorldAssetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSlot, setActiveSlot] = useState<Slot>('challenger');
  const [challenger, setChallenger] = useState<WorldAssetSummary | null>(null);
  const [defender, setDefender] = useState<WorldAssetSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await listWorldAssets({ category: 'character', limit: 100 });
        if (!cancelled) setAssets(r.items ?? []);
      } catch (err: any) {
        if (!cancelled) {
          Alert.alert('加载资产失败', err?.message || '请稍后再试');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePick = useCallback(
    (asset: WorldAssetSummary) => {
      if (activeSlot === 'challenger') {
        if (defender?.id === asset.id) {
          Alert.alert('不能选择同一只', '挑战者和防御者必须不同');
          return;
        }
        setChallenger(asset);
        setActiveSlot('defender');
      } else {
        if (challenger?.id === asset.id) {
          Alert.alert('不能选择同一只', '挑战者和防御者必须不同');
          return;
        }
        setDefender(asset);
      }
    },
    [activeSlot, challenger, defender],
  );

  const handleStart = useCallback(() => {
    if (!challenger || !defender) {
      Alert.alert('需要选择双方', '请选择挑战者和防御者');
      return;
    }
    navigation.navigate('WorldBattleArena', {
      challengerAssetId: challenger.id,
      defenderAssetId: defender.id,
    });
  }, [challenger, defender, navigation]);

  const handleStartInteractive = useCallback(() => {
    if (!challenger || !defender) {
      Alert.alert('需要选择双方', '请选择挑战者和防御者');
      return;
    }
    navigation.navigate('WorldInteractiveBattle', {
      challengerAssetId: challenger.id,
      defenderAssetId: defender.id,
      ruleSetShareCode,
      ruleSetName,
      challengerName: challenger.name,
      challengerPortraitUrl: challenger.styledMeshUrl ?? challenger.portraitUrl ?? null,
      defenderName: defender.name,
      defenderPortraitUrl: defender.styledMeshUrl ?? defender.portraitUrl ?? null,
    });
  }, [challenger, defender, navigation]);

  // 单人训练对战 — 只需要挑战者(防御者由系统训练假人担任)。这是冷启动
  // "只有一个角色也能 PK"的核心入口: 解决"没有对手/无法对战"的代入感问题。
  const handleStartTraining = useCallback(() => {
    const me = challenger ?? assets[0];
    if (!me) {
      Alert.alert('还没有角色', '先去扫描生成一个角色,再来训练场练习对战。');
      return;
    }
    navigation.navigate('WorldInteractiveBattle', {
      challengerAssetId: me.id,
      // 训练模式下后端用 system-dummy 作防守方, defenderAssetId 仅占位。
      defenderAssetId: me.id,
      training: true,
      ruleSetShareCode,
      ruleSetName,
      challengerName: me.name,
      challengerPortraitUrl: me.styledMeshUrl ?? me.portraitUrl ?? null,
      defenderName: '训练假人',
    });
  }, [challenger, assets, navigation]);

  return (
    <View style={styles.container} testID="world-battle-picker">
      <Text style={styles.title}>选择对战双方</Text>
      {ruleSetName ? (
        <View style={styles.ruleBanner}>
          <Text style={styles.ruleBannerText}>🎲 使用玩法「{ruleSetName}」规则对战</Text>
        </View>
      ) : null}

      {/* Slot row */}
      <View style={styles.slotRow}>
        <TouchableOpacity
          style={[
            styles.slotCard,
            activeSlot === 'challenger' && styles.slotCardActive,
          ]}
          onPress={() => setActiveSlot('challenger')}
        >
          <Text style={styles.slotLabel}>挑战者</Text>
          {challenger ? (
            <SlotContent asset={challenger} />
          ) : (
            <Text style={styles.slotEmpty}>点击下方资产选择</Text>
          )}
        </TouchableOpacity>
        <Text style={styles.vs}>VS</Text>
        <TouchableOpacity
          style={[
            styles.slotCard,
            activeSlot === 'defender' && styles.slotCardActive,
          ]}
          onPress={() => setActiveSlot('defender')}
        >
          <Text style={styles.slotLabel}>防御者</Text>
          {defender ? (
            <SlotContent asset={defender} />
          ) : (
            <Text style={styles.slotEmpty}>点击下方资产选择</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Asset list */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#6c5ce7" />
          <Text style={styles.loadingText}>加载资产中…</Text>
        </View>
      ) : assets.length === 0 ? (
        <View style={styles.loadingBox}>
          <Text style={styles.emptyText}>
            没有可对战的角色,先去扫描生成一些吧
          </Text>
          <TouchableOpacity
            style={styles.emptyScanButton}
            onPress={() => navigation.navigate('WorldEngineScanner')}
            testID="world-battle-picker-empty-scan"
          >
            <Text style={styles.emptyScanText}>📷 去扫描生成角色</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={assets}
          keyExtractor={(item) => item.id}
          numColumns={3}
          contentContainerStyle={styles.gridContent}
          columnWrapperStyle={styles.gridRow}
          renderItem={({ item }) => {
            const isChallenger = challenger?.id === item.id;
            const isDefender = defender?.id === item.id;
            return (
              <TouchableOpacity
                style={[
                  styles.tile,
                  isChallenger && styles.tileChallenger,
                  isDefender && styles.tileDefender,
                ]}
                onPress={() => handlePick(item)}
              >
                {item.styledMeshUrl ? (
                  <Image
                    source={{ uri: item.styledMeshUrl }}
                    style={styles.tileImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.tilePlaceholder}>
                    <Text style={styles.tilePlaceholderText}>3D</Text>
                  </View>
                )}
                <Text style={styles.tileName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.tileLevel}>Lv.{item.level}</Text>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Start buttons */}
      {!loading && assets.length > 0 && (
        <View style={styles.startWrap}>
          {/* 单人训练 — 只需 1 个角色即可开打(对手 = 系统训练假人)。
              冷启动核心入口: 没有第二只角色 / 没有别的玩家在线也能 PK。 */}
          <TouchableOpacity
            style={styles.trainButton}
            onPress={handleStartTraining}
            testID="world-battle-picker-start-training"
          >
            <Text style={styles.startButtonText}>🥋 单人训练对战</Text>
            <Text style={styles.startButtonHint}>
              {challenger ? `${challenger.name} vs 训练假人` : `${assets[0]?.name ?? '你的角色'} vs 训练假人`} · 只需 1 个角色
            </Text>
          </TouchableOpacity>

          <View style={styles.startRow}>
            <TouchableOpacity
              style={[
                styles.startButtonHalf,
                styles.startButtonAuto,
                (!challenger || !defender) && { opacity: 0.55 },
              ]}
              onPress={handleStart}
              testID="world-battle-picker-start"
            >
              <Text style={styles.startButtonText}>⚡ 快速对战</Text>
              <Text style={styles.startButtonHint}>{(!challenger || !defender) ? '需选双方角色' : '双角色 · 自动结算'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.startButtonHalf,
                (!challenger || !defender) && { opacity: 0.55 },
              ]}
              onPress={handleStartInteractive}
              testID="world-battle-picker-start-interactive"
            >
              <Text style={styles.startButtonText}>🎮 决策对战</Text>
              <Text style={styles.startButtonHint}>{(!challenger || !defender) ? '需选双方角色' : '双角色 · 你来出招'}</Text>
            </TouchableOpacity>
          </View>
          {(!challenger || !defender) ? (
            <Text style={styles.dualHint}>
              💡 只有一个角色?先用上面的「🥋 单人训练对战」练手;扫描/购买第二个角色后即可解锁双人对战。
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

function SlotContent({ asset }: { asset: WorldAssetSummary }) {
  return (
    <View style={styles.slotContent}>
      {asset.styledMeshUrl ? (
        <Image
          source={{ uri: asset.styledMeshUrl }}
          style={styles.slotImage}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.slotImage, styles.slotImagePlaceholder]}>
          <Text style={styles.tilePlaceholderText}>3D</Text>
        </View>
      )}
      <Text style={styles.slotName} numberOfLines={1}>
        {asset.name}
      </Text>
      <Text style={styles.slotLevel}>Lv.{asset.level}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 28,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 16,
  },
  ruleBanner: { backgroundColor: 'rgba(108,92,231,0.18)', borderColor: '#6c5ce7', borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 14 },
  ruleBannerText: { color: '#bcaaff', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  slotCard: {
    flex: 1,
    height: 140,
    backgroundColor: '#1a1a2e',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  slotCardActive: {
    borderColor: '#6c5ce7',
  },
  slotLabel: {
    color: '#aaa',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  slotEmpty: {
    color: '#555',
    fontSize: 12,
    marginTop: 18,
    textAlign: 'center',
  },
  slotContent: {
    alignItems: 'center',
  },
  slotImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
    marginBottom: 6,
  },
  slotImagePlaceholder: {
    backgroundColor: '#0d0d1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotName: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    maxWidth: 100,
  },
  slotLevel: {
    color: '#6c5ce7',
    fontSize: 11,
    fontWeight: '600',
  },
  vs: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    marginHorizontal: 12,
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    color: '#888',
    marginTop: 12,
    fontSize: 13,
  },
  emptyText: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
  },
  gridContent: {
    paddingBottom: 180,
  },
  gridRow: {
    gap: 8,
    marginBottom: 8,
  },
  tile: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 6,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tileChallenger: {
    borderColor: '#22c55e',
  },
  tileDefender: {
    borderColor: '#ef4444',
  },
  tileImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    marginBottom: 4,
  },
  tilePlaceholder: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: '#0d0d1a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  tilePlaceholderText: {
    color: '#444',
    fontSize: 16,
    fontWeight: '700',
  },
  tileName: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    width: '100%',
    textAlign: 'center',
  },
  tileLevel: {
    color: '#6c5ce7',
    fontSize: 10,
  },
  startRow: {
    flexDirection: 'row',
    gap: 10,
  },
  startWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: Platform.OS === 'ios' ? 30 : 16,
    gap: 10,
  },
  trainButton: {
    backgroundColor: '#6c5ce7',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyScanButton: {
    marginTop: 18,
    backgroundColor: '#6c5ce7',
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 12,
  },
  emptyScanText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  startButtonHalf: {
    flex: 1,
    backgroundColor: '#6c5ce7',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  startButtonAuto: {
    backgroundColor: '#2d2d44',
  },
  startButtonHint: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    marginTop: 2,
  },
  dualHint: {
    color: '#9aa',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
    paddingHorizontal: 4,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
