/**
 * PetRiveRenderer — Sprint 2 · Task 2.2 + Sprint 5 · Task 5.4
 *
 * Renderer-agnostic pet visual component. Supports a 3-tier fallback chain:
 *   1. VRM 3D (high-end devices, ≥ 8 GB RAM) — WebGL via expo-gl + three.js
 *   2. Rive 2D animation (mid-range devices)
 *   3. Gradient circle + emoji (low-end / fallback)
 *
 * Clan colors match the web design system:
 *   A (Office): #3B82F6 → #06B6D4
 *   B (Life):   #22C55E → #10B981
 *   C (Learn):  #A855F7 → #8B5CF6
 *   D (Play):   #F97316 → #EAB308
 *   E (Web3):   #EC4899 → #F43F5E
 *   F (Family): #14B8A6 → #0EA5E9
 */
import React, { useEffect, useMemo, useRef, useState, lazy, Suspense, type ReactNode } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getRecommendedRenderer, type RendererType } from '../../utils/deviceCapability';
import type { PetClanShortCode } from '../../../shared/types/pet';

// Lazy-load VRM renderer to avoid loading three.js on low/mid-end devices
const LazyPetVrmRenderer = lazy(() => import('./PetVrmRenderer'));

// ── Types ──────────────────────────────────────────────────────────────────

// Renderer clan code is the shared single-letter bridge type — keep the
// `PetClan` export name for back-compat with existing imports, but base it on
// the canonical `PetClanShortCode` so the two never drift (audit P1).
export type PetClan = PetClanShortCode;

export type PetEmotion =
  | 'happy' | 'excited' | 'sleepy' | 'thinking' | 'sad' | 'neutral'
  | 'calm' | 'focused' | 'concerned' | 'tired' | 'love' | 'angry';

export interface PetRiveRendererProps {
  clan: PetClan;
  emotion: string;
  width?: number;
  height?: number;
  fallback?: ReactNode;
  /** Force a specific renderer (overrides device detection) */
  forceRenderer?: RendererType;
  /** URL to a .vrm model file (enables VRM 3D rendering on high-end devices) */
  modelUrl?: string;
}

// ── Clan gradient palette ──────────────────────────────────────────────────

const CLAN_GRADIENTS: Record<PetClan, [string, string]> = {
  A: ['#3B82F6', '#06B6D4'], // Office: blue → cyan
  B: ['#22C55E', '#10B981'], // Life: green → emerald
  C: ['#A855F7', '#8B5CF6'], // Learn: purple → violet
  D: ['#F97316', '#EAB308'], // Play: orange → yellow
  E: ['#EC4899', '#F43F5E'], // Web3: pink → rose
  F: ['#14B8A6', '#0EA5E9'], // Family: teal → sky
};

// ── Emotion emoji map ──────────────────────────────────────────────────────

const EMOTION_EMOJI: Record<string, string> = {
  happy: '😊',
  excited: '🤩',
  sleepy: '😴',
  thinking: '🤔',
  sad: '😢',
  neutral: '😐',
  calm: '😌',
  focused: '🧐',
  concerned: '😟',
  tired: '😪',
  love: '🥰',
  angry: '😠',
};

// ── Rive availability hook ─────────────────────────────────────────────────

let _riveAvailable: boolean | null = null;

/**
 * Checks if rive-react-native is loaded and functional.
 * Caches the result after first check.
 */
export function useRiveAvailable(): boolean {
  const [available, setAvailable] = useState<boolean>(_riveAvailable ?? false);

  useEffect(() => {
    if (_riveAvailable !== null) {
      setAvailable(_riveAvailable);
      return;
    }
    // Attempt dynamic import to check if Rive is bundled
    try {
      const rive = require('rive-react-native');
      _riveAvailable = !!rive?.default || !!rive?.RiveView || !!rive?.Rive;
      setAvailable(_riveAvailable);
    } catch {
      _riveAvailable = false;
      setAvailable(false);
    }
  }, []);

  return available;
}

// ── Gradient Fallback Renderer ─────────────────────────────────────────────

function GradientFallback({
  clan,
  emotion,
  width,
  height,
}: {
  clan: PetClan;
  emotion: string;
  width: number;
  height: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const emoji = EMOTION_EMOJI[emotion] || EMOTION_EMOJI.neutral;
  const gradient = CLAN_GRADIENTS[clan] || CLAN_GRADIENTS.A;

  // Emotion-driven breathing speed
  const breathDuration = useMemo(() => {
    const map: Record<string, number> = {
      sleepy: 4000,
      tired: 3500,
      sad: 3000,
      calm: 2000,
      neutral: 2000,
      thinking: 2500,
      focused: 2200,
      concerned: 1800,
      happy: 1400,
      excited: 900,
      love: 1200,
      angry: 800,
    };
    return map[emotion] ?? 2000;
  }, [emotion]);

  // Breathing animation
  useEffect(() => {
    const breathScale = emotion === 'excited' || emotion === 'happy' ? 1.12 : 1.06;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: breathScale,
          duration: breathDuration / 2,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1.0,
          duration: breathDuration / 2,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale, breathDuration, emotion]);

  // Occasional micro-actions: gentle wiggle every 8-15 seconds
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      const delay = 8000 + Math.random() * 7000;
      timer = setTimeout(() => {
        Animated.sequence([
          Animated.timing(rotate, {
            toValue: 1,
            duration: 200,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(rotate, {
            toValue: -1,
            duration: 400,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(rotate, {
            toValue: 0,
            duration: 200,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]).start(scheduleNext);
      }, delay);
    };
    scheduleNext();
    return () => clearTimeout(timer);
  }, [rotate]);

  const rotateInterp = rotate.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-6deg', '6deg'],
  });

  const borderRadius = Math.min(width, height) / 2;
  const emojiSize = Math.max(24, Math.round(width * 0.4));

  return (
    <Animated.View style={{ transform: [{ scale }, { rotate: rotateInterp }] }}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.gradientCircle,
          {
            width,
            height,
            borderRadius,
            shadowColor: gradient[0],
          },
        ]}
      >
        <Text style={[styles.emoji, { fontSize: emojiSize }]}>{emoji}</Text>
      </LinearGradient>
    </Animated.View>
  );
}

// ── Rive Renderer (placeholder — ready for real .riv files) ────────────────

function RiveRenderer({
  clan,
  emotion,
  width,
  height,
}: {
  clan: PetClan;
  emotion: string;
  width: number;
  height: number;
}) {
  // TODO: When real .riv files are available, load them here:
  // const riveFile = `pet_clan_${clan}_${emotion}.riv`;
  // For now, render the gradient fallback as a beautiful placeholder.
  // The component structure is ready to swap in:
  //
  // import { RiveView } from 'rive-react-native';
  // return (
  //   <RiveView
  //     resourceName={`pet_clan_${clan}`}
  //     artboardName={emotion}
  //     style={{ width, height }}
  //     autoplay
  //   />
  // );

  return (
    <GradientFallback clan={clan} emotion={emotion} width={width} height={height} />
  );
}

// ── Main exported component ────────────────────────────────────────────────

/**
 * PetRenderer — auto-selects VRM → Rive → gradient fallback based on device
 * capability, Rive availability, and VRM model URL availability.
 *
 * Fallback chain: VRM 3D → Rive 2D → Gradient+Emoji
 */
export function PetRenderer({
  clan,
  emotion,
  width = 180,
  height = 180,
  fallback,
  forceRenderer,
  modelUrl,
}: PetRiveRendererProps) {
  const riveAvailable = useRiveAvailable();
  const recommended = forceRenderer || getRecommendedRenderer();
  const [vrmFailed, setVrmFailed] = useState(false);

  // VRM 3D rendering (high-end devices with a model URL)
  const useVrm = (recommended === 'vrm' || forceRenderer === 'vrm') && !!modelUrl && !vrmFailed;

  if (useVrm) {
    return (
      <View style={[styles.container, { width, height }]}>
        <Suspense
          fallback={
            <GradientFallback clan={clan} emotion={emotion} width={width} height={height} />
          }
        >
          <LazyPetVrmRenderer
            modelUrl={modelUrl!}
            emotion={emotion}
            width={width}
            height={height}
            autoRotate
            onLoadError={() => setVrmFailed(true)}
          />
        </Suspense>
      </View>
    );
  }

  // Determine which 2D renderer to use
  const useRive = (recommended === 'rive' || recommended === 'vrm') && riveAvailable;

  if (fallback && !useRive && recommended === 'emoji') {
    return <>{fallback}</>;
  }

  if (useRive) {
    return (
      <View style={[styles.container, { width, height }]}>
        <RiveRenderer clan={clan} emotion={emotion} width={width} height={height} />
      </View>
    );
  }

  // SVG/gradient fallback (default for low-end or when Rive unavailable)
  return (
    <View style={[styles.container, { width, height }]}>
      <GradientFallback clan={clan} emotion={emotion} width={width} height={height} />
    </View>
  );
}

// Also export the fallback directly for use in non-Rive contexts
export { GradientFallback as PetGradientFallback };

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradientCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  emoji: {
    textAlign: 'center',
  },
});
