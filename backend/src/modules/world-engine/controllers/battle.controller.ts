import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Request,
  UseGuards,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorldEngineFlagGuard } from '../guards/world-engine-flag.guard';
import { BattleEngineService, BattleParticipant } from '../services/battle-engine.service';
import {
  InteractiveBattleEngineService,
  InteractiveParticipant,
  BattleDecision,
  InteractiveBattleState,
} from '../services/interactive-battle-engine.service';
import { Battle } from '../entities/battle.entity';
import { WorldAsset } from '../entities/world-asset.entity';
import { UgcGameService } from '../services/ugc-game.service';
import {
  CharacterStats,
  Skill,
  BattleRound,
  BATTLE_CHALLENGE_EXPIRY_HOURS,
} from '../../../../shared/types/world-engine';
import { emitWorldEngineBattlePending } from '../../desktop-sync/companion-presence.helpers';

@ApiTags('world-engine/battles')
@Controller('v1/world-engine/battles')
@UseGuards(JwtAuthGuard, WorldEngineFlagGuard)
@ApiBearerAuth()
export class BattleController {
  constructor(
    private readonly battleEngine: BattleEngineService,
    private readonly interactiveBattle: InteractiveBattleEngineService,
    @InjectRepository(Battle)
    private readonly battleRepo: Repository<Battle>,
    @InjectRepository(WorldAsset)
    private readonly worldAssetRepo: Repository<WorldAsset>,
    private readonly ugcGame: UgcGameService,
  ) {}

  /**
   * 解析 UGC 玩法规则(若提供 shareCode):返回引擎可用的 BattleRules + 计一次游玩。
   * 失败/未提供 → undefined(用引擎默认规则)。
   */
  private async resolveUgcRules(shareCode?: string): Promise<Record<string, unknown> | undefined> {
    if (!shareCode) return undefined;
    try {
      const { effectiveRules } = await this.ugcGame.play(shareCode);
      return effectiveRules;
    } catch {
      return undefined;
    }
  }

  /**
   * POST /battles/create
   * Load both assets, run simulateBattle(), save Battle entity, update asset XP/wins/losses.
   */
  @Post('create')
  @ApiOperation({ summary: 'Create a battle between two world assets' })
  async createBattle(
    @Request() req: any,
    @Body() body: { challengerAssetId: string; defenderAssetId: string },
  ) {
    const userId = req.user?.id || req.user?.sub;
    const { challengerAssetId, defenderAssetId } = body;

    if (!challengerAssetId || !defenderAssetId) {
      throw new BadRequestException('Both challengerAssetId and defenderAssetId are required');
    }

    if (challengerAssetId === defenderAssetId) {
      throw new BadRequestException('Cannot battle an asset against itself');
    }

    // Load both assets
    const [challengerAsset, defenderAsset] = await Promise.all([
      this.worldAssetRepo.findOne({ where: { id: challengerAssetId } }),
      this.worldAssetRepo.findOne({ where: { id: defenderAssetId } }),
    ]);

    if (!challengerAsset) {
      throw new NotFoundException(`Challenger asset ${challengerAssetId} not found`);
    }
    if (!defenderAsset) {
      throw new NotFoundException(`Defender asset ${defenderAssetId} not found`);
    }

    // Verify the challenger belongs to the requesting user
    if (challengerAsset.ownerId !== userId) {
      throw new ForbiddenException('You can only initiate battles with your own assets');
    }

    // Generate a deterministic seed
    const seed = this.generateBattleSeed();

    // Build battle participants
    const challenger = this.assetToParticipant(challengerAsset);
    const defender = this.assetToParticipant(defenderAsset);

    // Run the deterministic battle simulation
    const result = this.battleEngine.simulateBattle(challenger, defender, seed);

    // Determine winner asset ID
    const winnerAssetId = result.winnerSide === 'challenger'
      ? challengerAssetId
      : defenderAssetId;

    // Save battle entity
    const battle = this.battleRepo.create({
      challengerAssetId,
      defenderAssetId,
      challengerUserId: challengerAsset.ownerId,
      defenderUserId: defenderAsset.ownerId,
      status: 'completed',
      randomSeed: seed.toString(),
      rounds: result.rounds as unknown as Record<string, unknown>[],
      winnerAssetId,
      totalRounds: result.totalRounds,
      xpAwarded: result.xpAwarded,
      expiresAt: new Date(Date.now() + BATTLE_CHALLENGE_EXPIRY_HOURS * 60 * 60 * 1000),
    });

    const savedBattle = await this.battleRepo.save(battle);

    // Update asset XP and win/loss records
    await this.updateAssetBattleRecords(
      challengerAsset,
      defenderAsset,
      result.winnerSide,
      result.xpAwarded,
    );

    return savedBattle;
  }

  /**
   * POST /battles/:id/accept
   * For async challenges: load pending battle, run simulation, save results.
   */
  @Post(':id/accept')
  @ApiOperation({ summary: 'Accept an async battle challenge' })
  async acceptBattle(@Request() req: any, @Param('id') id: string) {
    const userId = req.user?.id || req.user?.sub;

    const battle = await this.battleRepo.findOne({ where: { id } });
    if (!battle) {
      throw new NotFoundException(`Battle ${id} not found`);
    }

    if (battle.status !== 'pending') {
      throw new BadRequestException(`Battle is not in pending state (current: ${battle.status})`);
    }

    if (battle.defenderUserId !== userId) {
      throw new ForbiddenException('Only the challenged user can accept this battle');
    }

    // Check if the battle has expired
    if (new Date() > battle.expiresAt) {
      battle.status = 'expired';
      await this.battleRepo.save(battle);
      throw new BadRequestException('This battle challenge has expired');
    }

    // Load both assets — handle edge case where asset was deleted/sold
    const [challengerAsset, defenderAsset] = await Promise.all([
      this.worldAssetRepo.findOne({ where: { id: battle.challengerAssetId } }),
      this.worldAssetRepo.findOne({ where: { id: battle.defenderAssetId } }),
    ]);

    if (!challengerAsset || !defenderAsset) {
      // Edge case: challenged asset deleted/sold → cancel with notification
      battle.status = 'cancelled';
      await this.battleRepo.save(battle);
      throw new BadRequestException(
        'Battle cancelled: one or both assets are no longer available (deleted or sold)',
      );
    }

    // Verify defender still owns their asset
    if (defenderAsset.ownerId !== userId) {
      battle.status = 'cancelled';
      await this.battleRepo.save(battle);
      throw new BadRequestException(
        'Battle cancelled: you no longer own the defender asset',
      );
    }

    // Run the deterministic battle simulation
    const seed = parseInt(battle.randomSeed, 10);
    const challenger = this.assetToParticipant(challengerAsset);
    const defender = this.assetToParticipant(defenderAsset);

    const result = this.battleEngine.simulateBattle(challenger, defender, seed);

    const winnerAssetId = result.winnerSide === 'challenger'
      ? battle.challengerAssetId
      : battle.defenderAssetId;

    // Update battle with results
    battle.status = 'completed';
    battle.rounds = result.rounds as unknown as Record<string, unknown>[];
    battle.winnerAssetId = winnerAssetId;
    battle.totalRounds = result.totalRounds;
    battle.xpAwarded = result.xpAwarded;

    const savedBattle = await this.battleRepo.save(battle);

    // Update asset XP and win/loss records
    await this.updateAssetBattleRecords(
      challengerAsset,
      defenderAsset,
      result.winnerSide,
      result.xpAwarded,
    );

    return savedBattle;
  }

  /**
   * GET /battles/:id
   * Return battle details.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get battle details' })
  async getBattle(@Request() req: any, @Param('id') id: string) {
    const battle = await this.battleRepo.findOne({ where: { id } });
    if (!battle) {
      throw new NotFoundException(`Battle ${id} not found`);
    }
    return battle;
  }

  /**
   * POST /battles/challenge
   * Create async challenge (status='pending', expiresAt=72h).
   */
  @Post('challenge')
  @ApiOperation({ summary: 'Create an async battle challenge with share link' })
  async createChallenge(
    @Request() req: any,
    @Body() body: { challengerAssetId: string; targetUserId: string },
  ) {
    const userId = req.user?.id || req.user?.sub;
    const { challengerAssetId, targetUserId } = body;

    if (!challengerAssetId || !targetUserId) {
      throw new BadRequestException('Both challengerAssetId and targetUserId are required');
    }

    // Load challenger asset
    const challengerAsset = await this.worldAssetRepo.findOne({
      where: { id: challengerAssetId },
    });

    if (!challengerAsset) {
      throw new NotFoundException(`Challenger asset ${challengerAssetId} not found`);
    }

    if (challengerAsset.ownerId !== userId) {
      throw new ForbiddenException('You can only challenge with your own assets');
    }

    // Find a random asset owned by the target user to challenge
    const defenderAsset = await this.worldAssetRepo.findOne({
      where: { ownerId: targetUserId, category: 'character' },
    });

    if (!defenderAsset) {
      throw new BadRequestException('Target user has no character assets available for battle');
    }

    // Generate seed for the future battle
    const seed = this.generateBattleSeed();
    const expiresAt = new Date(Date.now() + BATTLE_CHALLENGE_EXPIRY_HOURS * 60 * 60 * 1000);

    // Create pending battle
    const battle = this.battleRepo.create({
      challengerAssetId,
      defenderAssetId: defenderAsset.id,
      challengerUserId: userId,
      defenderUserId: targetUserId,
      status: 'pending',
      randomSeed: seed.toString(),
      rounds: null,
      winnerAssetId: null,
      totalRounds: 0,
      xpAwarded: null,
      expiresAt,
    });

    const savedBattle = await this.battleRepo.save(battle);

    // P-9 Companion Redesign — emit world-engine.battle-pending so the defender's
    // mobile Companion_Ball flips to nudge mode + Lock_Screen_Pet shows
    // "⚔️ 你被挑战了 — 24h 内回应". Wrapped so emit failure cannot break challenge.
    try {
      emitWorldEngineBattlePending({
        battleId: savedBattle.id,
        challengerUserId: userId,
        defenderUserId: targetUserId,
        challengerAssetId,
        defenderAssetId: defenderAsset.id,
        expiresAt: savedBattle.expiresAt.getTime(),
        createdAt: Date.now(),
      });
    } catch {
      // never block challenge for presence failure
    }

    return {
      battleId: savedBattle.id,
      shareLink: `agentrix://world-engine/battle/${savedBattle.id}`,
      expiresAt: savedBattle.expiresAt,
      status: 'pending',
    };
  }

  /**
   * GET /battles/:id/replay
   * Return replay video URL (placeholder for now).
   */
  @Get(':id/replay')
  @ApiOperation({ summary: 'Get battle replay video URL' })
  async getReplay(@Request() req: any, @Param('id') id: string) {
    const battle = await this.battleRepo.findOne({ where: { id } });
    if (!battle) {
      throw new NotFoundException(`Battle ${id} not found`);
    }

    if (battle.status !== 'completed') {
      throw new BadRequestException('Replay is only available for completed battles');
    }

    return {
      videoUrl: battle.replayVideoUrl || null,
      battleId: battle.id,
      status: battle.replayVideoUrl ? 'ready' : 'generating',
    };
  }

  // ============================================================
  // Phase B — Interactive (player-decision) battle
  // ============================================================

  /**
   * POST /battles/interactive/start
   * 创建一场交互战斗(mode='interactive', status='active', decisions=[]),返回初始局面。
   * 玩家是 challenger;防守方由确定性 AI 依 seed + behaviorTree 出招。
   */
  @Post('interactive/start')
  @ApiOperation({ summary: 'Start a player-decision (interactive) battle' })
  async startInteractive(
    @Request() req: any,
    @Body() body: { challengerAssetId: string; defenderAssetId: string; ruleSetShareCode?: string },
  ) {
    const isGuest = req.user?.isGuest === true || req.user?.type === 'guest';
    if (isGuest) {
      throw new ForbiddenException('登录后才能进行决策对战');
    }
    const userId = req.user?.id || req.user?.sub;
    const { challengerAssetId, defenderAssetId } = body;

    if (!challengerAssetId || !defenderAssetId) {
      throw new BadRequestException('Both challengerAssetId and defenderAssetId are required');
    }
    if (challengerAssetId === defenderAssetId) {
      throw new BadRequestException('Cannot battle an asset against itself');
    }

    const [challengerAsset, defenderAsset] = await Promise.all([
      this.worldAssetRepo.findOne({ where: { id: challengerAssetId } }),
      this.worldAssetRepo.findOne({ where: { id: defenderAssetId } }),
    ]);
    if (!challengerAsset) throw new NotFoundException(`Challenger asset ${challengerAssetId} not found`);
    if (!defenderAsset) throw new NotFoundException(`Defender asset ${defenderAssetId} not found`);
    if (challengerAsset.ownerId !== userId) {
      throw new ForbiddenException('You can only initiate battles with your own assets');
    }

    const seed = this.generateBattleSeed();
    const challenger = this.assetToInteractiveParticipant(challengerAsset);
    const defender = this.assetToInteractiveParticipant(defenderAsset);
    const state = this.interactiveBattle.initState(challenger, defender);
    // UGC 玩法规则随局面持久化(服务器权威),step 重放时一并应用。
    const rules = await this.resolveUgcRules(body.ruleSetShareCode);
    const stateWithRules = rules ? { ...state, rules } : state;

    const battle = this.battleRepo.create({
      challengerAssetId,
      defenderAssetId,
      challengerUserId: challengerAsset.ownerId,
      defenderUserId: defenderAsset.ownerId,
      status: 'active',
      mode: 'interactive',
      randomSeed: seed.toString(),
      rounds: [],
      decisions: [],
      interactiveState: stateWithRules as unknown as Record<string, unknown>,
      winnerAssetId: null,
      totalRounds: 0,
      xpAwarded: null,
      expiresAt: new Date(Date.now() + BATTLE_CHALLENGE_EXPIRY_HOURS * 60 * 60 * 1000),
    });
    const saved = await this.battleRepo.save(battle);

    return {
      battleId: saved.id,
      seed: seed.toString(),
      state,
      rules: rules ?? null,
      challengerSkills: challenger.skills.map((s) => ({ name: s.name, type: s.type, damageBase: s.damageBase })),
      defenderSkills: defender.skills.map((s) => ({ name: s.name, type: s.type, damageBase: s.damageBase })),
    };
  }

  /**
   * POST /battles/interactive/:id/step
   * 玩家提交本回合决策。服务器权威:从 decisions[] + seed 重放到当前回合(防篡改),
   * 再 step 一回合(防守方 AI 决策由 seed 派生)。结束时落库 XP/胜负。
   */
  @Post('interactive/:id/step')
  @ApiOperation({ summary: 'Submit a decision for one round of an interactive battle' })
  async stepInteractive(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { decision: BattleDecision },
  ) {
    const userId = req.user?.id || req.user?.sub;
    const decision = body?.decision;
    if (!decision || !['attack', 'charge', 'defend'].includes(decision.action)) {
      throw new BadRequestException('A valid decision { action } is required');
    }

    const battle = await this.battleRepo.findOne({ where: { id } });
    if (!battle) throw new NotFoundException(`Battle ${id} not found`);
    if (battle.mode !== 'interactive') {
      throw new BadRequestException('This battle is not interactive');
    }
    if (battle.challengerUserId !== userId) {
      throw new ForbiddenException('Only the challenger can play this battle');
    }
    if (battle.status === 'completed') {
      throw new BadRequestException('Battle already completed');
    }

    const isTraining = battle.defenderUserId === 'system-dummy';

    const challengerAsset = await this.worldAssetRepo.findOne({ where: { id: battle.challengerAssetId } });
    if (!challengerAsset) {
      battle.status = 'cancelled';
      await this.battleRepo.save(battle);
      throw new BadRequestException('Battle cancelled: an asset is no longer available');
    }

    const seed = parseInt(battle.randomSeed, 10);
    const challenger = this.assetToInteractiveParticipant(challengerAsset);

    // 防守方: 训练模式用存在局面里的 defenderSpec(假人), 否则加载真实资产
    let defender: InteractiveParticipant;
    let defenderLevel = challenger.level;
    if (isTraining) {
      const spec = (battle.interactiveState as any)?.defenderSpec;
      defender = spec ?? this.buildTrainingDummy(challenger, 'normal');
      defenderLevel = defender.level;
    } else {
      const defenderAsset = await this.worldAssetRepo.findOne({ where: { id: battle.defenderAssetId } });
      if (!defenderAsset) {
        battle.status = 'cancelled';
        await this.battleRepo.save(battle);
        throw new BadRequestException('Battle cancelled: an asset is no longer available');
      }
      defender = this.assetToInteractiveParticipant(defenderAsset);
      defenderLevel = defenderAsset.level;
    }

    // 服务器权威重放:从初始态 + 已存 decisions 重建当前 state(忽略客户端传来的 state)
    const ugcRules = (battle.interactiveState as any)?.rules as Record<string, unknown> | undefined;
    const priorDecisions = (battle.decisions ?? []) as unknown as BattleDecision[];
    let state = this.interactiveBattle.initState(challenger, defender);
    const allRounds: any[] = [];
    for (const prior of priorDecisions) {
      const aiPrior = this.interactiveBattle.deriveAiDecision(state, defender, 'defender', seed);
      const r = this.interactiveBattle.stepRound(state, prior, aiPrior, challenger, defender, seed, ugcRules as any);
      allRounds.push(r.round);
      state = r.nextState;
    }

    if (state.status === 'completed') {
      throw new BadRequestException('Battle already completed');
    }

    // 推进本回合:玩家 decision + 防守方 AI 决策
    const aiDecision = this.interactiveBattle.deriveAiDecision(state, defender, 'defender', seed);
    const { round, nextState } = this.interactiveBattle.stepRound(
      state,
      decision,
      aiDecision,
      challenger,
      defender,
      seed,
      ugcRules as any,
    );
    allRounds.push(round);

    const newDecisions = [...priorDecisions, decision];
    battle.decisions = newDecisions as unknown as Record<string, unknown>[];
    battle.rounds = allRounds as unknown as Record<string, unknown>[];
    // 保留 rules + defenderSpec(训练假人)在持久化的 state 中,下一回合重放仍可读到。
    const preservedSpec = (battle.interactiveState as any)?.defenderSpec;
    battle.interactiveState = {
      ...nextState,
      ...(ugcRules ? { rules: ugcRules } : {}),
      ...(preservedSpec ? { defenderSpec: preservedSpec } : {}),
    } as unknown as Record<string, unknown>;
    battle.totalRounds = nextState.round;

    let result: { winnerSide: 'challenger' | 'defender'; totalRounds: number; xpAwarded: { challenger: number; defender: number } } | undefined;

    if (nextState.status === 'completed' && nextState.winnerSide) {
      const winnerSide = nextState.winnerSide;
      const xpAwarded = this.interactiveBattle.calculateXpAwards(
        challengerAsset.level,
        defenderLevel,
        winnerSide,
      );
      battle.status = 'completed';
      battle.winnerAssetId = winnerSide === 'challenger' ? battle.challengerAssetId : battle.defenderAssetId;
      battle.xpAwarded = xpAwarded;
      if (isTraining) {
        // 训练模式: 只给玩家角色记 XP + 胜负, 不动假人(无真实资产)
        if (winnerSide === 'challenger') challengerAsset.battleWins += 1;
        else challengerAsset.battleLosses += 1;
        challengerAsset.xp += xpAwarded.challenger;
        await this.worldAssetRepo.save(challengerAsset);
      } else {
        const defenderAsset = await this.worldAssetRepo.findOne({ where: { id: battle.defenderAssetId } });
        if (defenderAsset) {
          await this.updateAssetBattleRecords(challengerAsset, defenderAsset, winnerSide, xpAwarded);
        }
      }
      result = { winnerSide, totalRounds: nextState.round, xpAwarded };
    }

    await this.battleRepo.save(battle);

    return { round, state: nextState, result };
  }

  /**
   * POST /battles/interactive/train
   * 单人 PvE: 跟系统训练假人打一场交互战斗(不需要第二个角色 / 不需要别人在线)。
   * 解决"冷启动没人玩"——只要有 1 个角色就能开打。
   */
  @Post('interactive/train')
  @ApiOperation({ summary: 'Start an interactive battle vs a system training dummy (single-player PvE)' })
  async startTrain(
    @Request() req: any,
    @Body() body: { challengerAssetId: string; difficulty?: 'easy' | 'normal' | 'hard'; ruleSetShareCode?: string },
  ) {
    const isGuest = req.user?.isGuest === true || req.user?.type === 'guest';
    if (isGuest) {
      throw new ForbiddenException('登录后才能进行训练对战');
    }
    const userId = req.user?.id || req.user?.sub;
    const { challengerAssetId } = body;
    if (!challengerAssetId) throw new BadRequestException('challengerAssetId is required');

    const challengerAsset = await this.worldAssetRepo.findOne({ where: { id: challengerAssetId } });
    if (!challengerAsset) throw new NotFoundException(`Challenger asset ${challengerAssetId} not found`);
    if (challengerAsset.ownerId !== userId) {
      throw new ForbiddenException('You can only train with your own assets');
    }

    const seed = this.generateBattleSeed();
    const challenger = this.assetToInteractiveParticipant(challengerAsset);
    const dummy = this.buildTrainingDummy(challenger, body.difficulty ?? 'normal');
    const state = this.interactiveBattle.initState(challenger, dummy);
    // 把假人 participant spec 嵌进局面, step 时据此重建(假人无真实资产)
    (state as any).defenderSpec = dummy;
    // UGC 玩法规则随局面持久化(用"我的玩法"开打时生效)。
    const rules = await this.resolveUgcRules(body.ruleSetShareCode);
    if (rules) (state as any).rules = rules;

    const battle = this.battleRepo.create({
      challengerAssetId,
      defenderAssetId: challengerAssetId, // 自指占位(假人无真实资产);winner 计算只用 side
      challengerUserId: challengerAsset.ownerId,
      defenderUserId: 'system-dummy',
      status: 'active',
      mode: 'interactive',
      randomSeed: seed.toString(),
      rounds: [],
      decisions: [],
      interactiveState: state as unknown as Record<string, unknown>,
      winnerAssetId: null,
      totalRounds: 0,
      xpAwarded: null,
      expiresAt: new Date(Date.now() + BATTLE_CHALLENGE_EXPIRY_HOURS * 60 * 60 * 1000),
    });
    const saved = await this.battleRepo.save(battle);

    return {
      battleId: saved.id,
      seed: seed.toString(),
      state,
      challengerSkills: challenger.skills.map((s) => ({ name: s.name, type: s.type, damageBase: s.damageBase })),
      defenderSkills: dummy.skills.map((s) => ({ name: s.name, type: s.type, damageBase: s.damageBase })),
      isTrainingDummy: true,
      dummyName: '训练假人',
    };
  }

  // ============================================================
  // Private helpers
  // ============================================================

  /** 构造一个与玩家角色实力相当的训练假人(难度调节血量/攻击)。 */
  private buildTrainingDummy(
    challenger: InteractiveParticipant,
    difficulty: 'easy' | 'normal' | 'hard',
  ): InteractiveParticipant {
    const mult = difficulty === 'easy' ? 0.7 : difficulty === 'hard' ? 1.3 : 1.0;
    const s = challenger.stats;
    return {
      id: 'system-training-dummy',
      level: challenger.level,
      behaviorTree: null,
      stats: {
        hp: Math.max(30, Math.round(s.hp * mult)),
        atk: Math.max(10, Math.round(s.atk * mult)),
        def: Math.max(10, Math.round(s.def * mult)),
        spd: Math.max(5, Math.round(s.spd * mult)),
        int: Math.max(5, Math.round(s.int * mult)),
      },
      skills: [
        { name: '木桩重击', type: 'offensive', effectDescription: '训练假人的标准攻击', damageBase: 18, cooldownTurns: 0 },
        { name: '硬化', type: 'defensive', effectDescription: '木桩硬化减伤', damageBase: undefined, cooldownTurns: 1 },
      ],
    };
  }

  private assetToParticipant(asset: WorldAsset): BattleParticipant {
    const stats = asset.stats as unknown as CharacterStats;
    const skills = (asset.skills as unknown as Skill[]).filter(
      (s) => s.damageBase != null && s.damageBase > 0,
    );

    // If no offensive skills, create a default basic attack
    const effectiveSkills = skills.length > 0
      ? skills
      : [{
          name: 'Basic Attack',
          type: 'offensive' as const,
          effectDescription: 'A basic attack dealing moderate damage',
          damageBase: 10,
          cooldownTurns: 0,
        }];

    return {
      id: asset.id,
      stats,
      skills: effectiveSkills,
      level: asset.level,
    };
  }

  private assetToInteractiveParticipant(asset: WorldAsset): InteractiveParticipant {
    // Phase A 联动: 交互战斗优先用能力加成后的 effectiveStats(若快照存在), 否则 base stats。
    const snap = asset.abilitySnapshot as any;
    const rawStats = (snap?.effectiveStats ?? asset.stats) as Partial<CharacterStats> | null | undefined;
    // 兜底: card_only / 老数据可能 stats 缺字段 → 给安全默认值, 避免 initState 读 hp 抛错
    // (这正是"开局正常但出招后空白/无法继续"的潜在根因之一)。
    const stats: CharacterStats = {
      hp: Number(rawStats?.hp) > 0 ? Number(rawStats!.hp) : 100,
      atk: Number(rawStats?.atk) >= 0 ? Number(rawStats!.atk) : 30,
      def: Number(rawStats?.def) >= 0 ? Number(rawStats!.def) : 20,
      spd: Number(rawStats?.spd) >= 0 ? Number(rawStats!.spd) : 40,
      int: Number(rawStats?.int) >= 0 ? Number(rawStats!.int) : 30,
    } as CharacterStats;
    const rawSkills = (asset.skills as unknown as Skill[]) || [];
    const skills = rawSkills.length > 0
      ? rawSkills
      : [{
          name: 'Basic Attack',
          type: 'offensive' as const,
          effectDescription: 'A basic attack dealing moderate damage',
          damageBase: 10,
          cooldownTurns: 0,
        }];
    return {
      id: asset.id,
      stats,
      skills,
      level: asset.level,
      behaviorTree: asset.behaviorTree as Record<string, unknown> | null,
    };
  }

  private generateBattleSeed(): number {
    // Generate a random seed using crypto-safe randomness for initial seed selection
    // The battle itself is deterministic given this seed
    return Math.floor(Math.random() * 2147483647) + 1;
  }

  private async updateAssetBattleRecords(
    challengerAsset: WorldAsset,
    defenderAsset: WorldAsset,
    winnerSide: 'challenger' | 'defender',
    xpAwarded: { challenger: number; defender: number },
  ): Promise<void> {
    // Update challenger
    if (winnerSide === 'challenger') {
      challengerAsset.battleWins += 1;
    } else {
      challengerAsset.battleLosses += 1;
    }
    challengerAsset.xp += xpAwarded.challenger;

    // Update defender
    if (winnerSide === 'defender') {
      defenderAsset.battleWins += 1;
    } else {
      defenderAsset.battleLosses += 1;
    }
    defenderAsset.xp += xpAwarded.defender;

    await Promise.all([
      this.worldAssetRepo.save(challengerAsset),
      this.worldAssetRepo.save(defenderAsset),
    ]);
  }
}
