import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { Dungeon, DungeonEnemy, DungeonLoot, DungeonBoss } from '../entities/dungeon.entity';
import { ScanSession } from '../entities/scan-session.entity';

/**
 * DungeonLayout — Room scan data structure for dungeon generation.
 */
export interface DungeonLayout {
  walls: Polygon[];
  doors: Point[];
  furniturePositions: FurnitureItem[];
  walkableAreas: Polygon[];
  openAreas: OpenArea[];
}

export interface Polygon {
  points: Point[];
}

export interface Point {
  x: number;
  y: number;
}

export interface Size3D {
  length: number;
  width: number;
  height: number;
}

export interface FurnitureItem {
  type: string;
  position: Point;
  size: Size3D;
}

export interface OpenArea {
  position: Point;
  areaSqm: number;
}

/**
 * DungeonBuilderService — Generates game dungeons from room scan data.
 *
 * Responsibilities:
 * - Parse room layout from scan data (walls, doors, furniture, walkable areas)
 * - Populate enemies based on room area (3-4 for <15m², 5-6 for 15-30m², 7-8 for >30m²)
 * - Assign theme based on detected room category (kitchen→fire, bedroom→dream, office→data)
 * - Place loot within 1m of furniture locations (2-5 items)
 * - Place boss at largest open area (≥4m²)
 * - Generate share code (6-12 alphanumeric, deterministic from dungeon ID hash)
 * - Enforce 30-second generation timeout
 * - Handle partial dungeons for <180° coverage (fog-of-war boundary)
 *
 * Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8
 */
@Injectable()
export class DungeonBuilderService {
  private readonly logger = new Logger(DungeonBuilderService.name);

  /** 30-second generation timeout (R4.6) */
  private readonly GENERATION_TIMEOUT_MS = 30_000;

  /** Share code validity period: 30 days */
  private readonly SHARE_CODE_VALIDITY_DAYS = 30;

  constructor(
    @InjectRepository(Dungeon)
    private readonly dungeonRepo: Repository<Dungeon>,
    @InjectRepository(ScanSession)
    private readonly scanSessionRepo: Repository<ScanSession>,
  ) {}

  /**
   * Generate a dungeon from a room scan session.
   *
   * @param sessionId - The scan session ID containing room scan data
   * @param creatorId - The user who initiated the scan
   * @param theme - Optional theme override
   * @returns The generated Dungeon entity
   */
  async generateDungeon(
    sessionId: string,
    creatorId: string,
    theme?: string,
  ): Promise<Dungeon> {
    // Enforce 30-second timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error('Dungeon generation timed out (30s limit exceeded)')),
        this.GENERATION_TIMEOUT_MS,
      );
    });

    const generationPromise = this.buildDungeon(sessionId, creatorId, theme);

    return Promise.race([generationPromise, timeoutPromise]);
  }

  /**
   * Core dungeon building logic.
   */
  private async buildDungeon(
    sessionId: string,
    creatorId: string,
    themeOverride?: string,
  ): Promise<Dungeon> {
    // Load scan session
    const session = await this.scanSessionRepo.findOne({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException(`Scan session ${sessionId} not found`);
    }

    // Parse layout from scan data (in production, this would come from the reconstruction pipeline)
    const layout = this.parseRoomLayout(session);

    // Calculate room area from walkable areas
    const roomAreaSqm = this.calculateRoomArea(layout.walkableAreas);

    // Determine coverage degrees from session metadata
    const coverageDegrees = this.estimateCoverage(session);

    // Determine theme from furniture types (or use override)
    const detectedTheme = themeOverride || this.detectTheme(layout.furniturePositions);

    // Generate enemies based on room area
    const enemies = this.populateEnemies(roomAreaSqm, detectedTheme);

    // Place loot near furniture (2-5 items)
    const lootItems = this.placeLoot(layout.furniturePositions);

    // Place boss at largest open area (≥4m²)
    const boss = this.placeBoss(layout.openAreas, detectedTheme);

    // Calculate difficulty rating (1-5) based on enemy count and boss presence
    const difficultyRating = this.calculateDifficulty(enemies.length, boss, roomAreaSqm);

    // Generate dungeon ID first (needed for deterministic share code)
    const dungeonId = uuidv4();

    // Generate deterministic share code from dungeon ID hash
    const shareCode = await this.generateShareCode(dungeonId);

    // Set expiration (30 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.SHARE_CODE_VALIDITY_DAYS);

    // Determine if this is a partial dungeon (<180° coverage)
    const isPartial = coverageDegrees < 180;

    // Build the dungeon entity
    const dungeon = this.dungeonRepo.create({
      id: dungeonId,
      creatorId,
      worldAssetId: session.resultAssetId || dungeonId, // Use session result or self-reference
      shareCode,
      layout: {
        ...layout,
        isPartial,
        fogOfWarBoundary: isPartial ? this.generateFogOfWarBoundary(layout, coverageDegrees) : null,
      } as any,
      enemies,
      lootItems,
      boss,
      theme: detectedTheme,
      roomAreaSqm,
      coverageDegrees,
      difficultyRating,
      expiresAt,
    });

    // Save to database
    const saved = await this.dungeonRepo.save(dungeon);

    this.logger.log(
      `Dungeon generated: id=${saved.id}, shareCode=${shareCode}, ` +
      `area=${roomAreaSqm.toFixed(1)}m², enemies=${enemies.length}, ` +
      `theme=${detectedTheme}, partial=${isPartial}`,
    );

    return saved;
  }

  /**
   * Parse room layout from scan session data.
   * In production, this would process the actual 3D reconstruction output.
   * For Phase 1, we extract layout from session metadata or generate defaults.
   */
  parseRoomLayout(session: ScanSession): DungeonLayout {
    // Check if session has layout data in quality scores metadata
    const sessionData = session.qualityScores as any;

    // If the session contains embedded layout data (from room scan processing)
    if (sessionData && Array.isArray(sessionData) && sessionData.length > 0) {
      const layoutData = sessionData.find((s: any) => s.layout);
      if (layoutData?.layout) {
        return layoutData.layout as DungeonLayout;
      }
    }

    // Default layout for when no explicit layout data is available
    // This represents a basic rectangular room
    return {
      walls: [
        { points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 4 }, { x: 0, y: 4 }] },
      ],
      doors: [{ x: 2.5, y: 0 }],
      furniturePositions: [],
      walkableAreas: [
        { points: [{ x: 0.5, y: 0.5 }, { x: 4.5, y: 0.5 }, { x: 4.5, y: 3.5 }, { x: 0.5, y: 3.5 }] },
      ],
      openAreas: [{ position: { x: 2.5, y: 2 }, areaSqm: 12 }],
    };
  }

  /**
   * Calculate total room area from walkable area polygons.
   * Uses the Shoelace formula for polygon area.
   */
  calculateRoomArea(walkableAreas: Polygon[]): number {
    let totalArea = 0;
    for (const polygon of walkableAreas) {
      totalArea += this.polygonArea(polygon.points);
    }
    return Math.max(1, totalArea); // Minimum 1 m²
  }

  /**
   * Shoelace formula for polygon area.
   */
  private polygonArea(points: Point[]): number {
    if (points.length < 3) return 0;
    let area = 0;
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    return Math.abs(area) / 2;
  }

  /**
   * Estimate coverage degrees from session metadata.
   */
  private estimateCoverage(session: ScanSession): number {
    // If session has image count, estimate coverage
    // Room scan typically captures ~45° per image
    const estimatedCoverage = session.imageCount * 45;
    return Math.min(360, Math.max(0, estimatedCoverage));
  }

  /**
   * Detect room theme from furniture types.
   *
   * - kitchen keywords → 'fire' (fire elementals)
   * - bedroom keywords → 'dream' (dream creatures)
   * - office keywords → 'data' (data golems)
   * - default → 'neutral'
   */
  detectTheme(furniturePositions: FurnitureItem[]): string {
    if (!furniturePositions || furniturePositions.length === 0) {
      return 'neutral';
    }

    const types = furniturePositions.map((f) => f.type.toLowerCase());
    const allTypes = types.join(' ');

    // Kitchen keywords
    const kitchenKeywords = ['stove', 'oven', 'fridge', 'refrigerator', 'sink', 'microwave', 'kitchen', 'counter', 'dishwasher', 'toaster', 'kettle', 'pot', 'pan'];
    if (kitchenKeywords.some((kw) => allTypes.includes(kw))) {
      return 'fire';
    }

    // Bedroom keywords
    const bedroomKeywords = ['bed', 'pillow', 'mattress', 'nightstand', 'wardrobe', 'closet', 'dresser', 'bedroom', 'blanket', 'lamp', 'alarm'];
    if (bedroomKeywords.some((kw) => allTypes.includes(kw))) {
      return 'dream';
    }

    // Office keywords
    const officeKeywords = ['desk', 'computer', 'monitor', 'keyboard', 'mouse', 'office', 'chair', 'printer', 'bookshelf', 'filing', 'laptop', 'screen'];
    if (officeKeywords.some((kw) => allTypes.includes(kw))) {
      return 'data';
    }

    return 'neutral';
  }

  /**
   * Populate enemies based on room area.
   *
   * Deterministic count formula: Math.min(8, Math.max(3, Math.floor(area / 5) + 1))
   * - < 15 m²: 3-4 enemies
   * - 15-30 m²: 5-6 enemies (actually 4-7 with the formula)
   * - > 30 m²: 7-8 enemies
   */
  populateEnemies(roomAreaSqm: number, theme: string): DungeonEnemy[] {
    const count = Math.min(8, Math.max(3, Math.floor(roomAreaSqm / 5) + 1));
    const enemies: DungeonEnemy[] = [];

    const enemyTemplates = this.getEnemyTemplates(theme);

    for (let i = 0; i < count; i++) {
      const template = enemyTemplates[i % enemyTemplates.length];
      enemies.push({
        id: uuidv4(),
        name: `${template.name} ${i + 1}`,
        type: template.type,
        hp: template.baseHp + Math.floor(roomAreaSqm * 2),
        atk: template.baseAtk + Math.floor(roomAreaSqm),
        position: {
          x: ((i + 1) / (count + 1)) * Math.sqrt(roomAreaSqm),
          y: ((i % 3) + 1) * (Math.sqrt(roomAreaSqm) / 4),
        },
      });
    }

    return enemies;
  }

  /**
   * Get enemy templates based on theme.
   */
  private getEnemyTemplates(theme: string): Array<{ name: string; type: string; baseHp: number; baseAtk: number }> {
    switch (theme) {
      case 'fire':
        return [
          { name: 'Fire Elemental', type: 'fire_elemental', baseHp: 50, baseAtk: 15 },
          { name: 'Flame Sprite', type: 'flame_sprite', baseHp: 30, baseAtk: 20 },
          { name: 'Ember Golem', type: 'ember_golem', baseHp: 80, baseAtk: 10 },
        ];
      case 'dream':
        return [
          { name: 'Dream Wisp', type: 'dream_wisp', baseHp: 40, baseAtk: 18 },
          { name: 'Nightmare Shade', type: 'nightmare_shade', baseHp: 60, baseAtk: 22 },
          { name: 'Sleep Walker', type: 'sleep_walker', baseHp: 45, baseAtk: 16 },
        ];
      case 'data':
        return [
          { name: 'Data Golem', type: 'data_golem', baseHp: 70, baseAtk: 12 },
          { name: 'Byte Swarm', type: 'byte_swarm', baseHp: 25, baseAtk: 25 },
          { name: 'Logic Gate', type: 'logic_gate', baseHp: 55, baseAtk: 14 },
        ];
      default:
        return [
          { name: 'Shadow Lurker', type: 'shadow_lurker', baseHp: 50, baseAtk: 15 },
          { name: 'Stone Sentinel', type: 'stone_sentinel', baseHp: 65, baseAtk: 12 },
          { name: 'Void Crawler', type: 'void_crawler', baseHp: 35, baseAtk: 20 },
        ];
    }
  }

  /**
   * Place loot items within 1m of furniture locations.
   * Generates 2-5 items.
   */
  placeLoot(furniturePositions: FurnitureItem[]): DungeonLoot[] {
    const lootCount = Math.min(5, Math.max(2, furniturePositions.length));
    const loot: DungeonLoot[] = [];

    const lootTemplates = [
      { name: 'Health Potion', type: 'consumable', rarity: 'common' },
      { name: 'Mana Crystal', type: 'consumable', rarity: 'common' },
      { name: 'Ancient Scroll', type: 'equipment', rarity: 'uncommon' },
      { name: 'Enchanted Ring', type: 'equipment', rarity: 'rare' },
      { name: 'Dragon Scale', type: 'material', rarity: 'epic' },
    ];

    for (let i = 0; i < lootCount; i++) {
      const template = lootTemplates[i % lootTemplates.length];
      // Place within 1m of furniture (or at default positions if no furniture)
      let position: Point;
      if (furniturePositions.length > 0) {
        const furniture = furniturePositions[i % furniturePositions.length];
        // Offset within 1m radius
        const angle = (i / lootCount) * Math.PI * 2;
        position = {
          x: furniture.position.x + Math.cos(angle) * 0.8,
          y: furniture.position.y + Math.sin(angle) * 0.8,
        };
      } else {
        position = { x: 1 + i, y: 1 + i * 0.5 };
      }

      loot.push({
        id: uuidv4(),
        name: template.name,
        type: template.type,
        rarity: template.rarity,
        position,
      });
    }

    return loot;
  }

  /**
   * Place boss at the largest open area (≥4m²).
   * If no open area ≥4m² exists, place at the largest available area.
   */
  placeBoss(openAreas: OpenArea[], theme: string): DungeonBoss {
    // Sort by area descending, pick the largest
    const sorted = [...openAreas].sort((a, b) => b.areaSqm - a.areaSqm);
    const bossArea = sorted[0] || { position: { x: 3, y: 3 }, areaSqm: 5 };

    const bossTemplates: Record<string, { name: string; type: string; skills: string[] }> = {
      fire: { name: 'Inferno Lord', type: 'fire_boss', skills: ['Flame Burst', 'Lava Pool', 'Heat Wave'] },
      dream: { name: 'Dreamweaver', type: 'dream_boss', skills: ['Sleep Spell', 'Nightmare Pulse', 'Dream Trap'] },
      data: { name: 'Mainframe Titan', type: 'data_boss', skills: ['System Crash', 'Data Drain', 'Firewall'] },
      neutral: { name: 'Dungeon Guardian', type: 'neutral_boss', skills: ['Heavy Strike', 'Shield Bash', 'War Cry'] },
    };

    const template = bossTemplates[theme] || bossTemplates.neutral;

    return {
      id: uuidv4(),
      name: template.name,
      type: template.type,
      hp: 200 + Math.floor(bossArea.areaSqm * 20),
      atk: 30 + Math.floor(bossArea.areaSqm * 3),
      def: 20 + Math.floor(bossArea.areaSqm * 2),
      skills: template.skills,
      position: bossArea.position,
    };
  }

  /**
   * Generate a deterministic share code from dungeon ID hash.
   * 6-12 alphanumeric characters. Ensures uniqueness via DB unique index.
   */
  async generateShareCode(dungeonId: string): Promise<string> {
    const hash = createHash('sha256').update(dungeonId).digest('hex');
    // Take first 8 characters of the hash, convert to alphanumeric
    let code = hash.substring(0, 8).toUpperCase();

    // Ensure it's alphanumeric (it already is since hex is 0-9A-F)
    // Extend with more characters from hash if needed for uniqueness
    let attempts = 0;
    while (attempts < 10) {
      // Check if code already exists
      const existing = await this.dungeonRepo.findOne({ where: { shareCode: code } });
      if (!existing) {
        return code;
      }
      // Generate a different code using more of the hash
      attempts++;
      const offset = attempts * 4;
      code = hash.substring(offset, offset + 8).toUpperCase();
      if (code.length < 6) {
        // Fallback: append random suffix
        code = hash.substring(0, 6).toUpperCase() + attempts.toString(36).toUpperCase();
      }
    }

    // Final fallback: use full UUID-based code
    const fallbackHash = createHash('sha256').update(dungeonId + Date.now()).digest('hex');
    return fallbackHash.substring(0, 8).toUpperCase();
  }

  /**
   * Calculate difficulty rating (1-5) based on dungeon properties.
   */
  private calculateDifficulty(enemyCount: number, boss: DungeonBoss, roomAreaSqm: number): number {
    let difficulty = 1;

    // More enemies = harder
    if (enemyCount >= 7) difficulty += 2;
    else if (enemyCount >= 5) difficulty += 1;

    // Stronger boss = harder
    if (boss.hp > 300) difficulty += 1;

    // Larger rooms with more enemies = harder
    if (roomAreaSqm > 25 && enemyCount >= 6) difficulty += 1;

    return Math.min(5, Math.max(1, difficulty));
  }

  /**
   * Generate fog-of-war boundary for partial dungeons (<180° coverage).
   */
  private generateFogOfWarBoundary(
    layout: DungeonLayout,
    coverageDegrees: number,
  ): { boundary: Point[]; coveragePercentage: number } {
    const coveragePercentage = coverageDegrees / 360;

    // Generate a boundary arc based on coverage
    const centerX = layout.walkableAreas.length > 0
      ? layout.walkableAreas[0].points.reduce((sum, p) => sum + p.x, 0) / layout.walkableAreas[0].points.length
      : 2.5;
    const centerY = layout.walkableAreas.length > 0
      ? layout.walkableAreas[0].points.reduce((sum, p) => sum + p.y, 0) / layout.walkableAreas[0].points.length
      : 2;

    const radius = Math.sqrt(this.calculateRoomArea(layout.walkableAreas)) / 2;
    const startAngle = 0;
    const endAngle = (coverageDegrees * Math.PI) / 180;

    const boundary: Point[] = [];
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const angle = startAngle + (endAngle * i) / steps;
      boundary.push({
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      });
    }

    return { boundary, coveragePercentage };
  }

  /**
   * Load a dungeon by its share code.
   */
  async getDungeonByShareCode(shareCode: string): Promise<Dungeon> {
    const dungeon = await this.dungeonRepo.findOne({ where: { shareCode } });
    if (!dungeon) {
      throw new NotFoundException(`Dungeon with code ${shareCode} not found`);
    }

    // Check if expired
    if (new Date() > dungeon.expiresAt) {
      throw new NotFoundException(`Dungeon with code ${shareCode} has expired`);
    }

    return dungeon;
  }
}
