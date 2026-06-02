/**
 * PetVrmRenderer — Sprint 5 · Task 5.2
 *
 * VRM 3D model renderer using expo-gl + three.js + @pixiv/three-vrm.
 * Renders a .vrm model with emotion-driven blendshape expressions.
 *
 * This is an experimental component — WebGL via GLView in React Native
 * has known performance limitations. The component includes proper error
 * boundaries and falls back to the gradient+emoji renderer on failure.
 *
 * Requirements:
 *   - expo-gl (GLView rendering surface)
 *   - three (WebGL renderer)
 *   - @pixiv/three-vrm (VRM model loading + blendshape control)
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';

// ── Types ──────────────────────────────────────────────────────────────────

export interface PetVrmRendererProps {
  /** URL to the .vrm model file */
  modelUrl: string;
  /** Drives blendshape expressions (happy, sad, excited, etc.) */
  emotion?: string;
  /** Render width in dp */
  width?: number;
  /** Render height in dp */
  height?: number;
  /** Slowly rotate the model on Y axis */
  autoRotate?: boolean;
  /** Callback when model loading fails */
  onLoadError?: (error: Error) => void;
}

// ── Emotion → VRM BlendShape mapping ──────────────────────────────────────

const EMOTION_BLENDSHAPE_MAP: Record<string, { preset: string; weight: number }[]> = {
  happy:    [{ preset: 'happy', weight: 1.0 }],
  excited:  [{ preset: 'happy', weight: 0.8 }, { preset: 'surprised', weight: 0.5 }],
  sleepy:   [{ preset: 'blink', weight: 0.7 }, { preset: 'relaxed', weight: 0.5 }],
  thinking: [{ preset: 'neutral', weight: 0.5 }, { preset: 'lookUp', weight: 0.3 }],
  sad:      [{ preset: 'sad', weight: 1.0 }],
  neutral:  [{ preset: 'neutral', weight: 1.0 }],
  calm:     [{ preset: 'relaxed', weight: 0.8 }],
  focused:  [{ preset: 'neutral', weight: 0.6 }, { preset: 'lookDown', weight: 0.3 }],
  concerned:[{ preset: 'sad', weight: 0.4 }, { preset: 'surprised', weight: 0.2 }],
  tired:    [{ preset: 'blink', weight: 0.6 }, { preset: 'sad', weight: 0.3 }],
  love:     [{ preset: 'happy', weight: 1.0 }],
  angry:    [{ preset: 'angry', weight: 1.0 }],
};

// ── Component ──────────────────────────────────────────────────────────────

/**
 * PetVrmRenderer — renders a VRM 3D model with emotion blendshapes.
 *
 * Uses expo-gl GLView as the WebGL surface. On load failure or unsupported
 * platforms, renders nothing (parent should provide fallback).
 */
export function PetVrmRenderer({
  modelUrl,
  emotion = 'neutral',
  width = 180,
  height = 180,
  autoRotate = true,
  onLoadError,
}: PetVrmRendererProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const glRef = useRef<any>(null);
  const rendererRef = useRef<any>(null);
  const sceneRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const vrmRef = useRef<any>(null);
  const frameRef = useRef<number>(0);
  const rotationRef = useRef<number>(0);

  // Handle GL context creation
  const onContextCreate = useCallback(
    async (gl: any) => {
      try {
        // Dynamic imports to avoid loading three.js on low-end devices
        const THREE = await import('three');
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const { VRMLoaderPlugin, VRMUtils } = await import('@pixiv/three-vrm');

        // Create renderer
        const renderer = new THREE.WebGLRenderer({
          canvas: {
            width: gl.drawingBufferWidth,
            height: gl.drawingBufferHeight,
            style: {},
            addEventListener: () => {},
            removeEventListener: () => {},
            clientHeight: height,
          } as any,
          context: gl,
        });
        renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
        renderer.setPixelRatio(1);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        rendererRef.current = renderer;

        // Create scene
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0b1220); // Match app dark bg
        sceneRef.current = scene;

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(1, 2, 3);
        scene.add(directionalLight);

        // Rim light for depth
        const rimLight = new THREE.DirectionalLight(0x6366f1, 0.3);
        rimLight.position.set(-2, 1, -1);
        scene.add(rimLight);

        // Camera
        const camera = new THREE.PerspectiveCamera(
          30,
          gl.drawingBufferWidth / gl.drawingBufferHeight,
          0.1,
          20,
        );
        camera.position.set(0, 1.2, 3.5);
        camera.lookAt(0, 1.0, 0);
        cameraRef.current = camera;

        // Load VRM model
        const loader = new GLTFLoader();
        loader.register((parser: any) => new VRMLoaderPlugin(parser));

        loader.load(
          modelUrl,
          (gltf: any) => {
            const vrm = gltf.userData.vrm;
            if (!vrm) {
              const err = new Error('Loaded GLTF does not contain VRM data');
              setError(err);
              onLoadError?.(err);
              return;
            }

            VRMUtils.removeUnnecessaryJoints(gltf.scene);
            VRMUtils.removeUnnecessaryVertices(gltf.scene);

            scene.add(gltf.scene);
            vrmRef.current = vrm;
            setLoading(false);

            // Apply initial emotion
            applyEmotion(vrm, emotion);

            // Start render loop
            const animate = () => {
              frameRef.current = requestAnimationFrame(animate);

              if (autoRotate && gltf.scene) {
                rotationRef.current += 0.005;
                gltf.scene.rotation.y = rotationRef.current;
              }

              // Update VRM (spring bones, etc.)
              vrm.update(1 / 60);

              renderer.render(scene, camera);
              gl.endFrameEXP();
            };
            animate();
          },
          undefined,
          (loadError: any) => {
            const err = loadError instanceof Error
              ? loadError
              : new Error(`VRM load failed: ${String(loadError)}`);
            setError(err);
            setLoading(false);
            onLoadError?.(err);
          },
        );
      } catch (initError: any) {
        const err = initError instanceof Error
          ? initError
          : new Error(`GL init failed: ${String(initError)}`);
        setError(err);
        setLoading(false);
        onLoadError?.(err);
      }
    },
    [modelUrl, emotion, autoRotate, width, height, onLoadError],
  );

  // Update emotion blendshapes when emotion prop changes
  useEffect(() => {
    if (vrmRef.current) {
      applyEmotion(vrmRef.current, emotion);
    }
  }, [emotion]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
    };
  }, []);

  // If error occurred, render nothing (parent handles fallback)
  if (error) {
    return null;
  }

  // Web platform not supported for GLView
  if (Platform.OS === 'web') {
    return null;
  }

  return (
    <View style={[styles.container, { width, height }]}>
      <GLViewWrapper
        width={width}
        height={height}
        onContextCreate={onContextCreate}
      />
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color="#6366f1" />
          <Text style={styles.loadingText}>Loading 3D...</Text>
        </View>
      )}
    </View>
  );
}

// ── GLView Wrapper (lazy import) ───────────────────────────────────────────

/**
 * Wraps expo-gl's GLView with lazy loading to avoid import errors
 * on platforms where expo-gl is not available.
 */
function GLViewWrapper({
  width,
  height,
  onContextCreate,
}: {
  width: number;
  height: number;
  onContextCreate: (gl: any) => void;
}) {
  const [GLView, setGLView] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const expoGl = require('expo-gl');
        if (mounted) {
          setGLView(() => expoGl.GLView);
        }
      } catch {
        // expo-gl not available
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (!GLView) {
    return null;
  }

  return (
    <GLView
      style={{ width, height }}
      onContextCreate={onContextCreate}
    />
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Applies emotion-based blendshape expressions to a VRM model.
 */
function applyEmotion(vrm: any, emotion: string) {
  if (!vrm?.expressionManager) return;

  // Reset all expressions first
  const manager = vrm.expressionManager;
  try {
    // Reset known presets
    const presets = ['happy', 'angry', 'sad', 'relaxed', 'surprised', 'neutral', 'blink', 'lookUp', 'lookDown'];
    for (const preset of presets) {
      manager.setValue(preset, 0);
    }

    // Apply target emotion blendshapes
    const mappings = EMOTION_BLENDSHAPE_MAP[emotion] || EMOTION_BLENDSHAPE_MAP.neutral;
    for (const { preset, weight } of mappings) {
      manager.setValue(preset, weight);
    }
  } catch {
    // Silently fail — some VRM models may not have all presets
  }
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: '#0b1220',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11, 18, 32, 0.8)',
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 6,
  },
});

export default PetVrmRenderer;
