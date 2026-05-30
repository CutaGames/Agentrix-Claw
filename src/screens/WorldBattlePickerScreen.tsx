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
import { useNavigation } from '@react-navigation/native';
import {
  listWorldAssets,
  type WorldAssetSummary,
} from '../services/worldEngineApi';

type Slot = 'challenger' | 'defender';

export default function WorldBattlePickerScreen() {
  const navigation = useNavigation<any>();
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
    });
  }, [challenger, defender, navigation]);

  return (
    <View style={styles.container} testID="world-battle-picker">
      <Text style={styles.title}>选择对战双方</Text>

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
      <View style={styles.startRow}>
        <TouchableOpacity
          style={[
            styles.startButtonHalf,
            styles.startButtonAuto,
            (!challenger || !defender) && { opacity: 0.4 },
          ]}
          onPress={handleStart}
          disabled={!challenger || !defender}
          testID="world-battle-picker-start"
        >
          <Text style={styles.startButtonText}>⚡ 快速对战</Text>
          <Text style={styles.startButtonHint}>自动结算</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.startButtonHalf,
            (!challenger || !defender) && { opacity: 0.4 },
          ]}
          onPress={handleStartInteractive}
          disabled={!challenger || !defender}
          testID="world-battle-picker-start-interactive"
        >
          <Text style={styles.startButtonText}>🎮 决策对战</Text>
          <Text style={styles.startButtonHint}>你来出招</Text>
        </TouchableOpacity>
      </View>
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
    paddingBottom: 100,
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
  startButton: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: Platform.OS === 'ios' ? 30 : 16,
    backgroundColor: '#6c5ce7',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  startRow: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: Platform.OS === 'ios' ? 30 : 16,
    flexDirection: 'row',
    gap: 10,
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
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
