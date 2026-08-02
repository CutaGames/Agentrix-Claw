/**
 * aeonAssets — Aeon(永曜城)世界美术静态 require 映射(2026-06-01 豆包交付)。
 *
 * RN 打包器要求 `require()` 用字面量路径,不能动态拼。这里把建造目录贴图 + 房间背景
 * 静态登记,渲染层按 catalogId / room kind 查表;查不到则返回 undefined,调用方回退
 * emoji 占位(零崩溃)。美术为晨昏暖光基调(见 AEON_CONCEPT_ART_REVIEW)。
 */
import type { ImageSourcePropType } from 'react-native';

/** 建造目录贴图(catalogId → 图)。透明底等距单体。 */
export const AEON_BUILD_IMAGES: Record<string, ImageSourcePropType> = {
  'hq-tower': require('../../../assets/aeon/build/hq-tower.png'),
  'task-board': require('../../../assets/aeon/build/task-board.png'),
  'market-stall': require('../../../assets/aeon/build/market-stall.png'),
  'stage-dome': require('../../../assets/aeon/build/stage-dome.png'),
  'meeting-pod': require('../../../assets/aeon/build/meeting-pod.png'),
  'plaza-tree': require('../../../assets/aeon/build/plaza-tree.png'),
  'lamp-post': require('../../../assets/aeon/build/lamp-post.png'),
  'fountain': require('../../../assets/aeon/build/fountain.png'),
  'gate-arch': require('../../../assets/aeon/build/gate-arch.png'),
  'hologram': require('../../../assets/aeon/build/hologram.png'),
};

/** 房间背景(room kind → 图)。16:9 不透明背景。 */
export const AEON_ROOM_IMAGES: Record<string, ImageSourcePropType> = {
  company: require('../../../assets/aeon/rooms/room-company.png'),
  meeting: require('../../../assets/aeon/rooms/room-meeting.png'),
  venue: require('../../../assets/aeon/rooms/room-venue.png'),
  market: require('../../../assets/aeon/rooms/room-market.png'),
  public: require('../../../assets/aeon/rooms/room-public.png'),
};

export function buildImage(catalogId?: string | null): ImageSourcePropType | undefined {
  return catalogId ? AEON_BUILD_IMAGES[catalogId] : undefined;
}

export function roomImage(kind?: string | null): ImageSourcePropType | undefined {
  return kind ? AEON_ROOM_IMAGES[kind] : undefined;
}

/** 地块底图(CA-1 晨昏暖光等距地块),用于建造屏 + 地图选址背景。 */
export const AEON_PLOT_GROUND: ImageSourcePropType = require('../../../assets/aeon/world/plot-ground.png');

/** 等距地砖瓦片(豆包交付,已去水印+单块化)。用于场景地面平铺。 */
export const AEON_TILES: Record<string, ImageSourcePropType> = {
  base: require('../../../assets/aeon/tiles/floor-base.png'),
  glow: require('../../../assets/aeon/tiles/floor-glow.png'),
  road: require('../../../assets/aeon/tiles/floor-road.png'),
  grass: require('../../../assets/aeon/tiles/floor-grass.png'),
  water: require('../../../assets/aeon/tiles/floor-water.png'),
  edge: require('../../../assets/aeon/tiles/floor-edge.png'),
};

export function tileImage(kind?: string | null): ImageSourcePropType {
  return (kind && AEON_TILES[kind]) || AEON_TILES.base;
}
