/**
 * WorldMapRenderer — World_Map 3D renderer with device-tier degradation (R13).
 *
 * Task 10.3. Renders the shared World_Map's Plots. The 3D backdrop uses the v5
 * mobile rendering stack — three.js driven through `expo-gl`'s `GLView` (the
 * React-Three-Fiber renderer on Expo) — consistent with the existing
 * `PetVrmRenderer` (R13.1). Two backdrops are chosen by render quality:
 *
 *   - **full**     (R13.2) — three.js GL scene: extruded plot tiles, lighting,
 *                            higher pixel ratio, the requesting user's avatar.
 *   - **degraded** (R13.3) — a lightweight 2D grid backdrop (plain RN Views) for
 *                            devices below the full profile, GL unavailable, or
 *                            web. Reduced detail, but navigation + Plot entry are
 *                            fully preserved.
 *
 * In **both** modes a shared, absolutely-positioned layer of touchable Plot
 * markers (mapped from grid coordinates with a top-down linear projection that
 * matches the orthographic GL camera) drives selection/entry — so navigation
 * and Plot entry survive any rendering downgrade.
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — §5.1 (L0), §5.3, §13
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';

import type { MapPlotSummary } from '../../shared/types/world-creation-api';
import type { SubstrateTier } from '../../shared/types/world-creation';
import type { RenderQualityParams } from './renderStrategy';

// ============================================================
// §1 Props & helpers
// ============================================================

/** The requesting user's avatar position on the map. */
export interface MapSelfPosition {
  x: number;
  y: number;
}

export interface WorldMapRendererProps {
  /** Plots within the current viewport. */
  plots: MapPlotSummary[];
  /** Requesting user's avatar position. */
  self?: MapSelfPosition;
  /** Render quality knobs (from {@link useDeviceTier}). */
  params: RenderQualityParams;
  /** Render surface width (dp). */
  width: number;
  /** Render surface height (dp). */
  height: number;
  /** Currently selected plot id (highlighted). */
  selectedPlotId?: string | null;
  /** Called when a plot marker is tapped. */
  onSelectPlot: (plot: MapPlotSummary) => void;
}

/** Tier → accent color (kept in sync between GL boxes and 2D markers). */
const TIER_COLOR: Record<SubstrateTier, string> = {
  A: '#4CAF50', // declarative scene-graph (safe)
  B: '#6c5ce7', // DSL rules
  C: '#ff7043', // sandboxed logic (heaviest)
};

/** Padding (in grid units) added around the plot bounds so markers aren't flush to edges. */
const BOUNDS_PADDING = 1.5;

interface MapBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Compute padded grid bounds spanning all plots (and the self avatar). */
function computeBounds(plots: MapPlotSummary[], self?: MapSelfPosition): MapBounds {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of plots) {
    xs.push(p.mapX);
    ys.push(p.mapY);
  }
  if (self) {
    xs.push(self.x);
    ys.push(self.y);
  }
  if (xs.length === 0) {
    // Empty viewport — provide a sane default window.
    return { minX: -5, maxX: 5, minY: -5, maxY: 5 };
  }
  const minX = Math.min(...xs) - BOUNDS_PADDING;
  const maxX = Math.max(...xs) + BOUNDS_PADDING;
  const minY = Math.min(...ys) - BOUNDS_PADDING;
  const maxY = Math.max(...ys) + BOUNDS_PADDING;
  // Guard against zero-width bounds (single plot).
  return {
    minX,
    maxX: maxX > minX ? maxX : minX + 1,
    minY,
    maxY: maxY > minY ? maxY : minY + 1,
  };
}

/** Project a grid coordinate to a screen pixel position within [width,height]. */
function projectToScreen(
  gridX: number,
  gridY: number,
  bounds: MapBounds,
  width: number,
  height: number,
): { left: number; top: number } {
  const nx = (gridX - bounds.minX) / (bounds.maxX - bounds.minX);
  // Invert Y so larger mapY renders higher on screen.
  const ny = 1 - (gridY - bounds.minY) / (bounds.maxY - bounds.minY);
  return { left: nx * width, top: ny * height };
}

// ============================================================
// §2 Component
// ============================================================

/**
 * Renders the World_Map. Picks a full GL backdrop or a degraded 2D backdrop by
 * `params.quality`; both share the tappable marker overlay so Plot entry is
 * always available.
 */
export function WorldMapRenderer({
  plots,
  self,
  params,
  width,
  height,
  selectedPlotId,
  onSelectPlot,
}: WorldMapRendererProps) {
  const bounds = useMemo(() => computeBounds(plots, self), [plots, self]);

  // If the full GL backdrop fails to initialize, fall back to the 2D backdrop
  // without losing navigation/entry (R13.3).
  const [glFailed, setGlFailed] = useState(false);
  const useGl = params.quality === 'full' && Platform.OS !== 'web' && !glFailed;

  return (
    <View style={[styles.container, { width, height }]}>
      {useGl ? (
        <WorldMapGlBackdrop
          plots={plots}
          self={self}
          params={params}
          bounds={bounds}
          width={width}
          height={height}
          onError={() => setGlFailed(true)}
        />
      ) : (
        <WorldMapDegradedBackdrop width={width} height={height} />
      )}

      {/* Shared interactive marker layer (both modes) — preserves Plot entry. */}
      <View style={[styles.overlay, { width, height }]} pointerEvents="box-none">
        {plots.map((plot) => {
          const { left, top } = projectToScreen(plot.mapX, plot.mapY, bounds, width, height);
          const selected = plot.plotId === selectedPlotId;
          return (
            <TouchableOpacity
              key={plot.plotId}
              accessibilityRole="button"
              accessibilityLabel={`${plot.title} · Tier ${plot.substrateTier}`}
              testID={`plot-marker-${plot.plotId}`}
              style={[
                styles.marker,
                {
                  left: left - MARKER_SIZE / 2,
                  top: top - MARKER_SIZE / 2,
                  borderColor: TIER_COLOR[plot.substrateTier] ?? '#888',
                },
                selected && styles.markerSelected,
              ]}
              onPress={() => onSelectPlot(plot)}
            >
              <Text style={styles.markerTier}>{plot.substrateTier}</Text>
            </TouchableOpacity>
          );
        })}

        {/* Self avatar marker. */}
        {self && (
          <View
            pointerEvents="none"
            testID="map-self-avatar"
            style={[
              styles.selfMarker,
              (() => {
                const { left, top } = projectToScreen(self.x, self.y, bounds, width, height);
                return { left: left - SELF_SIZE / 2, top: top - SELF_SIZE / 2 };
              })(),
            ]}
          />
        )}
      </View>

      {/* Quality badge (debug/clarity — shows degraded mode is active). */}
      <View style={styles.qualityBadge} pointerEvents="none">
        <Text style={styles.qualityBadgeText}>
          {params.quality === 'full' ? '◆ 全画质' : '◇ 降级模式'}
        </Text>
      </View>
    </View>
  );
}

// ============================================================
// §3 Degraded 2D backdrop (R13.3) — plain RN Views, no GL
// ============================================================

function WorldMapDegradedBackdrop({ width, height }: { width: number; height: number }) {
  // A light grid drawn with absolutely-positioned hairlines. Cheap, no GL.
  const cols = 6;
  const rows = 10;
  const lines: React.ReactNode[] = [];
  for (let c = 1; c < cols; c++) {
    lines.push(
      <View
        key={`v${c}`}
        style={[styles.gridLine, { left: (c / cols) * width, top: 0, width: StyleSheet.hairlineWidth, height }]}
      />,
    );
  }
  for (let r = 1; r < rows; r++) {
    lines.push(
      <View
        key={`h${r}`}
        style={[styles.gridLine, { top: (r / rows) * height, left: 0, height: StyleSheet.hairlineWidth, width }]}
      />,
    );
  }
  return (
    <View style={[styles.degradedBackdrop, { width, height }]} testID="map-degraded-backdrop">
      {lines}
    </View>
  );
}

// ============================================================
// §4 Full GL backdrop (R13.1, R13.2) — three.js via expo-gl GLView
// ============================================================

interface GlBackdropProps {
  plots: MapPlotSummary[];
  self?: MapSelfPosition;
  params: RenderQualityParams;
  bounds: MapBounds;
  width: number;
  height: number;
  onError: () => void;
}

/**
 * Full-quality 3D backdrop. Renders an orthographic top-down view of the map:
 * a ground plane plus an extruded box per plot (colored by tier) and the self
 * avatar. Mirrors `PetVrmRenderer`'s expo-gl/three setup and lazy-imports both
 * so unsupported platforms degrade gracefully via `onError`.
 */
function WorldMapGlBackdrop({
  plots,
  self,
  params,
  bounds,
  width,
  height,
  onError,
}: GlBackdropProps) {
  const rendererRef = useRef<any>(null);
  const frameRef = useRef<number>(0);

  const onContextCreate = useCallback(
    async (gl: any) => {
      try {
        const THREE = await import('three');

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
          antialias: params.antialias,
        });
        renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
        renderer.setPixelRatio(params.pixelRatio);
        renderer.shadowMap.enabled = params.shadows;
        rendererRef.current = renderer;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0a14);

        // Orthographic top-down camera spanning the grid bounds.
        const cam = new THREE.OrthographicCamera(
          bounds.minX,
          bounds.maxX,
          bounds.maxY,
          bounds.minY,
          0.1,
          100,
        );
        cam.position.set(0, 20, 0);
        cam.up.set(0, 0, -1);
        cam.lookAt(0, 0, 0);

        // Lighting (capped by params.maxLights).
        const ambient = new THREE.AmbientLight(0xffffff, 0.7);
        scene.add(ambient);
        if (params.maxLights > 1) {
          const dir = new THREE.DirectionalLight(0xffffff, 0.6);
          dir.position.set(5, 10, 2);
          scene.add(dir);
        }

        // Ground plane.
        const groundGeo = new THREE.PlaneGeometry(
          bounds.maxX - bounds.minX,
          bounds.maxY - bounds.minY,
        );
        const groundMat = new THREE.MeshStandardMaterial({ color: 0x14142a });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(
          (bounds.minX + bounds.maxX) / 2,
          0,
          (bounds.minY + bounds.maxY) / 2,
        );
        scene.add(ground);

        // One extruded box per plot (capped by maxRenderedPlots).
        const shown = plots.slice(0, params.maxRenderedPlots);
        for (const p of shown) {
          const color = new THREE.Color(TIER_COLOR[p.substrateTier] ?? '#888888');
          const geo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
          const mat = new THREE.MeshStandardMaterial({ color });
          const box = new THREE.Mesh(geo, mat);
          // Map grid (x,y) → world (x, up, z); z uses mapY.
          box.position.set(p.mapX, 0.35, p.mapY);
          scene.add(box);
        }

        // Self avatar marker (small bright cylinder).
        if (self) {
          const selfGeo = new THREE.CylinderGeometry(0.25, 0.25, 1.0, 12);
          const selfMat = new THREE.MeshStandardMaterial({ color: 0xffd54f });
          const selfMesh = new THREE.Mesh(selfGeo, selfMat);
          selfMesh.position.set(self.x, 0.5, self.y);
          scene.add(selfMesh);
        }

        const render = () => {
          frameRef.current = requestAnimationFrame(render);
          renderer.render(scene, cam);
          gl.endFrameEXP();
        };
        render();
      } catch (err) {
        // GL / three unavailable — caller falls back to the 2D backdrop.
        onError();
      }
    },
    [plots, self, params, bounds, height, onError],
  );

  useEffect(() => {
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      if (rendererRef.current) {
        try {
          rendererRef.current.dispose();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  return <GLViewWrapper width={width} height={height} onContextCreate={onContextCreate} onError={onError} />;
}

/** Lazy-loaded expo-gl GLView wrapper (mirrors PetVrmRenderer). */
function GLViewWrapper({
  width,
  height,
  onContextCreate,
  onError,
}: {
  width: number;
  height: number;
  onContextCreate: (gl: any) => void;
  onError: () => void;
}) {
  const [GLView, setGLView] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const expoGl = require('expo-gl');
        if (mounted) setGLView(() => expoGl.GLView);
      } catch {
        if (mounted) onError();
      }
    })();
    return () => {
      mounted = false;
    };
  }, [onError]);

  if (!GLView) return null;
  return <GLView style={{ width, height }} onContextCreate={onContextCreate} />;
}

// ============================================================
// §5 Styles
// ============================================================

const MARKER_SIZE = 30;
const SELF_SIZE = 16;

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    backgroundColor: '#0a0a14',
    overflow: 'hidden',
  },
  overlay: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  degradedBackdrop: {
    position: 'absolute',
    left: 0,
    top: 0,
    backgroundColor: '#0e0e1c',
  },
  gridLine: {
    position: 'absolute',
    backgroundColor: 'rgba(108,92,231,0.18)',
  },
  marker: {
    position: 'absolute',
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderRadius: MARKER_SIZE / 2,
    borderWidth: 2,
    backgroundColor: 'rgba(26,26,46,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  markerSelected: {
    borderWidth: 3,
    backgroundColor: 'rgba(108,92,231,0.35)',
    transform: [{ scale: 1.15 }],
  },
  markerTier: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  selfMarker: {
    position: 'absolute',
    width: SELF_SIZE,
    height: SELF_SIZE,
    borderRadius: SELF_SIZE / 2,
    backgroundColor: '#ffd54f',
    borderWidth: 2,
    borderColor: '#fff',
  },
  qualityBadge: {
    position: 'absolute',
    right: 8,
    top: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  qualityBadgeText: {
    color: '#bbb',
    fontSize: 11,
    fontWeight: '600',
  },
});
