/**
 * AeonTileMap — 真·等距瓦片地面渲染(2026-06-01)。
 *
 * 用豆包交付的单块等距地砖(assets/aeon/tiles/*,已去水印)平铺成 N×N 等距网格,
 * 替换之前那张整图房间背景。画家算法(按 x+y 从远到近渲染)保证遮挡正确;
 * 方块带厚度的等距砖按 标准 iso 投影错位拼接:
 *   screenX = cx + (x - y) * (S/2)
 *   screenY = cy + (x + y) * (S/4)
 * 角色用同一投影叠在格子上(由父组件通过 children/renderChar 提供)。
 *
 * 瓦片类型按 (x,y)+roomKind 确定性选取(地块花纹稳定,不抖动);中心留 glow 高亮
 * 暗示"可建造/活动区",边缘点缀草地,偶有道路/水面,呼应 A' 晨昏暖光基调。
 */
import React, { useMemo } from 'react';
import { View, Image, StyleSheet, type ImageSourcePropType } from 'react-native';
import { AEON_TILES } from './aeonAssets';

export type AeonTileKind = 'base' | 'glow' | 'road' | 'grass' | 'water' | 'edge';

export interface AeonTileMapProps {
  /** 画布可用宽度(px),决定单砖尺寸。 */
  width: number;
  /** 画布高度(px)。 */
  height: number;
  /** 网格边长(N×N),默认 7。 */
  gridSize?: number;
  /** 房间类型,影响花纹。 */
  roomKind?: string;
  /** 渲染叠加层(角色等),拿到投影函数把内容放到对应格子。 */
  children?: (proj: TileProjection) => React.ReactNode;
}

export interface TileProjection {
  /** 把网格坐标 (gx,gy) 投影到画布像素左上角(用于定位 size×size 的内容)。 */
  project: (gx: number, gy: number, contentSize: number) => { left: number; top: number };
  gridSize: number;
  tilePx: number;
}

/** 简单确定性哈希(稳定花纹)。 */
function hash(x: number, y: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

function tileKindFor(x: number, y: number, n: number, roomKind?: string): AeonTileKind {
  const last = n - 1;
  const onEdge = x === 0 || y === 0 || x === last || y === last;
  const mid = Math.floor(n / 2);
  // 边缘:悬浮岛发光边
  if (onEdge) return 'edge';
  // 中心 2×2 区:发光高亮(活动/建造区)
  if (Math.abs(x - mid) <= 0 && Math.abs(y - mid) <= 0) return 'glow';
  const r = hash(x, y);
  if (roomKind === 'market') {
    // 市场:多一条横向道路
    if (y === mid) return 'road';
    if (r < 0.12) return 'grass';
  } else if (roomKind === 'venue') {
    if (r < 0.18) return 'glow';
  } else if (roomKind === 'company' || roomKind === 'meeting') {
    if (x === mid || y === mid) return 'road';
  } else {
    // public / 默认:草地环 + 偶发水洼
    if (x === 1 || y === 1 || x === last - 1 || y === last - 1) {
      if (r < 0.35) return 'grass';
    }
    if (r < 0.05) return 'water';
  }
  return 'base';
}

export function AeonTileMap({ width, height, gridSize = 7, roomKind, children }: AeonTileMapProps) {
  const n = gridSize;
  // 单砖渲染尺寸:让 N×N 等距网格横向铺满可用宽度(留少量边距)。
  const tilePx = Math.max(28, Math.floor((width - 12) / n));
  const halfW = tilePx / 2;
  const quarterH = tilePx / 4;

  // 让中心格 (mid,mid) 居中:其 (x-y)=0 → left 居中;(x+y)=2*mid → top 居中。
  const mid = (n - 1) / 2;
  const cx0 = width / 2 - tilePx / 2;
  const cy0 = height / 2 - tilePx / 2 - 2 * mid * quarterH;

  const project = (gx: number, gy: number, contentSize: number) => {
    const tileLeft = cx0 + (gx - gy) * halfW;
    const tileTop = cy0 + (gx + gy) * quarterH;
    // 内容(角色)以格子顶面中心为锚:格子顶面中心 ≈ (tileLeft+tilePx/2, tileTop+tilePx*0.3)
    const left = tileLeft + tilePx / 2 - contentSize / 2;
    const top = tileTop + tilePx * 0.18 - contentSize / 2;
    return { left, top };
  };

  // 生成所有瓦片,按 (x+y) 从小到大(远→近)渲染(画家算法)。
  const tiles = useMemo(() => {
    const list: { x: number; y: number; depth: number; src: ImageSourcePropType }[] = [];
    for (let x = 0; x < n; x++) {
      for (let y = 0; y < n; y++) {
        const kind = tileKindFor(x, y, n, roomKind);
        list.push({ x, y, depth: x + y, src: AEON_TILES[kind] || AEON_TILES.base });
      }
    }
    list.sort((a, b) => a.depth - b.depth);
    return list;
  }, [n, roomKind]);

  return (
    <View style={[styles.root, { width, height }]} pointerEvents="box-none">
      {tiles.map((t) => {
        const left = cx0 + (t.x - t.y) * halfW;
        const top = cy0 + (t.x + t.y) * quarterH;
        return (
          <Image
            key={`${t.x}-${t.y}`}
            source={t.src}
            style={[styles.tile, { left, top, width: tilePx, height: tilePx }]}
            resizeMode="contain"
            pointerEvents="none"
          />
        );
      })}
      {children?.({ project, gridSize: n, tilePx })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'relative', overflow: 'hidden' },
  tile: { position: 'absolute' },
});

export default AeonTileMap;
